"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { ChevronDown, Download, ImagePlus, Loader2, Save, Trash2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WeekSelector } from "@/components/app/WeekSelector";
import { ScheduleGridComponent } from "@/components/app/ScheduleGrid";
import { ShiftLegend } from "@/components/app/ShiftLegend";
import {
  createDefaultRequirements,
  INITIAL_EMPLOYEES,
  createInitialGrid,
  DAYS,
  ShiftCode,
  ScheduleGrid,
  Employee,
  WeekRequirements,
} from "@/lib/schedule-data";
import { exportNodeAsPng } from "@/lib/export-as-image";
import {
  applyParsedEntriesToSchedule,
  ParsedSchedulePayload,
} from "@/lib/schedule-import";
import { toast } from "sonner";

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

type WeekSchedule = {
  employees: Employee[];
  grid: ScheduleGrid;
  requirements: WeekRequirements;
  locked: boolean;
};

type UploadedScreenshot = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  previewUrl: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:4000";

export default function Index() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [schedulesByWeek, setSchedulesByWeek] = useState<Record<string, WeekSchedule>>(() => {
    const initialWeekKey = getWeekKey(getMonday(new Date()));
    return {
      [initialWeekKey]: {
        employees: INITIAL_EMPLOYEES,
        grid: createInitialGrid(INITIAL_EMPLOYEES),
        requirements: createDefaultRequirements(),
        locked: false,
      },
    };
  });
  const [isExporting, setIsExporting] = useState(false);
  const [uploads, setUploads] = useState<UploadedScreenshot[]>([]);
  const [isReadingUploads, setIsReadingUploads] = useState(false);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [isRequirementsOpen, setIsRequirementsOpen] = useState(false);
  const scheduleExportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const weekKey = getWeekKey(weekStart);
  const currentSchedule = schedulesByWeek[weekKey] ?? {
    employees: INITIAL_EMPLOYEES,
    grid: createInitialGrid(INITIAL_EMPLOYEES),
    requirements: createDefaultRequirements(),
    locked: false,
  };
  const employees = currentSchedule.employees;
  const grid = currentSchedule.grid;
  const requirements = currentSchedule.requirements ?? createDefaultRequirements();
  const locked = currentSchedule.locked;
  const weekEnd = addDays(weekStart, 6);
  const targetDayLabels = Array.from({ length: 7 }, (_, index) =>
    format(addDays(weekStart, index), "yyyy-MM-dd")
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSchedules() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/schedules`);
        const payload = (await response.json()) as {
          schedulesByWeek?: Record<string, WeekSchedule>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Хуваарь татаж чадсангүй.");
        }

        if (!cancelled && payload.schedulesByWeek && Object.keys(payload.schedulesByWeek).length > 0) {
          setSchedulesByWeek(payload.schedulesByWeek);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Хуваарь татаж чадсангүй.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSchedules(false);
        }
      }
    }

    void loadSchedules();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoadingSchedules) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/api/schedules/${weekKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentSchedule),
      }).catch(() => {
        toast.error("Backend дээр хадгалах үед алдаа гарлаа.");
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentSchedule, isLoadingSchedules, weekKey]);

  const updateCurrentWeek = useCallback(
    (updater: (schedule: WeekSchedule) => WeekSchedule) => {
      setSchedulesByWeek((prev) => {
        const existing = prev[weekKey] ?? {
          employees: INITIAL_EMPLOYEES,
          grid: createInitialGrid(INITIAL_EMPLOYEES),
          requirements: createDefaultRequirements(),
          locked: false,
        };

        const normalizedExisting: WeekSchedule = {
          ...existing,
          requirements: existing.requirements ?? createDefaultRequirements(),
        };

        return {
          ...prev,
          [weekKey]: updater(normalizedExisting),
        };
      });
    },
    [weekKey]
  );

  const applyImportedEntries = useCallback((entries: ParsedSchedulePayload["entries"]) => {
    const merged = applyParsedEntriesToSchedule(employees, grid, entries);
    updateCurrentWeek((schedule) => ({
      ...schedule,
      employees: merged.employees,
      grid: merged.grid,
    }));
    toast.success(
      merged.reviewCount > 0
        ? `${merged.updatedCount} ажилтан шинэчлэгдэж, ${merged.reviewCount} мөр таараагүй үлдлээ.`
        : `${merged.updatedCount} ажилтан шинэчлэгдлээ.`
    );
  }, [employees, grid, updateCurrentWeek]);

  const handleRequirementChange = useCallback(
    (dayIndex: number, field: "morning" | "evening", value: number) => {
      updateCurrentWeek((schedule) => {
        const nextRequirements = [...schedule.requirements];
        nextRequirements[dayIndex] = {
          ...nextRequirements[dayIndex],
          [field]: Math.max(0, value),
        };

        return {
          ...schedule,
          requirements: nextRequirements,
        };
      });
    },
    [updateCurrentWeek]
  );

  const handleCellChange = useCallback((empId: string, dayIndex: number, shift: ShiftCode) => {
    updateCurrentWeek((schedule) => {
      const updated = { ...schedule.grid };
      const row = [...updated[empId]];
      const existing = row[dayIndex];
      row[dayIndex] = { ...existing, shift, time: undefined };
      updated[empId] = row;

      return {
        ...schedule,
        grid: updated,
      };
    });
  }, [updateCurrentWeek]);

  const handleNameChange = useCallback((empId: string, newName: string) => {
    updateCurrentWeek((schedule) => ({
      ...schedule,
      employees: schedule.employees.map((employee) =>
        employee.id === empId ? { ...employee, name: newName } : employee
      ),
    }));
  }, [updateCurrentWeek]);

  const handleAddEmployee = useCallback((branch: 1 | 2) => {
    const id = crypto.randomUUID();
    const newEmp: Employee = { id, name: "Шинэ ажилтан", branch };
    updateCurrentWeek((schedule) => ({
      ...schedule,
      employees: [...schedule.employees, newEmp],
      grid: {
        ...schedule.grid,
        [id]: Array.from({ length: 7 }, () => ({
          shift: "А" as ShiftCode,
          prefix: branch === 2 ? "19" : undefined,
        })),
      },
    }));
  }, [updateCurrentWeek]);

  const handleMoveEmployee = useCallback((empId: string, direction: "up" | "down") => {
    updateCurrentWeek((schedule) => {
      const branchEmployees = schedule.employees.filter((employee) => {
        const target = schedule.employees.find((item) => item.id === empId);
        return target ? employee.branch === target.branch : false;
      });
      const branchIndex = branchEmployees.findIndex((employee) => employee.id === empId);

      if (branchIndex === -1) {
        return schedule;
      }

      const swapIndex = direction === "up" ? branchIndex - 1 : branchIndex + 1;
      if (swapIndex < 0 || swapIndex >= branchEmployees.length) {
        return schedule;
      }

      const reorderedBranch = [...branchEmployees];
      const [movedEmployee] = reorderedBranch.splice(branchIndex, 1);
      reorderedBranch.splice(swapIndex, 0, movedEmployee);

      const nextEmployees: Employee[] = [];
      let branchCursor = 0;

      schedule.employees.forEach((employee) => {
        if (employee.branch === movedEmployee.branch) {
          nextEmployees.push(reorderedBranch[branchCursor]);
          branchCursor += 1;
        } else {
          nextEmployees.push(employee);
        }
      });

      return {
        ...schedule,
        employees: nextEmployees,
      };
    });
  }, [updateCurrentWeek]);

  const handleRemoveEmployee = useCallback((empId: string) => {
    updateCurrentWeek((schedule) => {
      const updated = { ...schedule.grid };
      delete updated[empId];

      return {
        ...schedule,
        employees: schedule.employees.filter((employee) => employee.id !== empId),
        grid: updated,
      };
    });
  }, [updateCurrentWeek]);

  const handleSave = useCallback(() => {
    if (locked) {
      updateCurrentWeek((schedule) => ({
        ...schedule,
        locked: false,
      }));
      toast.success("Хуваарь түгжээ тайлагдлаа.");
      return;
    }

    updateCurrentWeek((schedule) => ({
      ...schedule,
      locked: true,
    }));
    toast.success("Хуваарь хадгалагдаж түгжигдлээ.");
  }, [locked, updateCurrentWeek]);

  const handleExport = useCallback(async () => {
    if (!scheduleExportRef.current) {
      toast.error("Экспортлох хуваарь олдсонгүй.");
      return;
    }

    setIsExporting(true);
    try {
      const filename = `schedule-${format(weekStart, "yyyy-MM-dd")}.png`;
      await exportNodeAsPng(scheduleExportRef.current, filename);
      toast.success("Зураг амжилттай татагдлаа.");
    } catch {
      toast.error("Зураг экспортлох үед алдаа гарлаа.");
    } finally {
      setIsExporting(false);
    }
  }, [weekStart]);

  const handleUploadFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const nextUploads = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<UploadedScreenshot>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = typeof reader.result === "string" ? reader.result : "";
              if (!dataUrl) {
                reject(new Error(`Failed to read ${file.name}`));
                return;
              }

              resolve({
                id: crypto.randomUUID(),
                name: file.name,
                mimeType: file.type || "image/png",
                dataUrl,
                previewUrl: URL.createObjectURL(file),
              });
            };
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsDataURL(file);
          })
      )
    );

    setUploads((prev) => [...prev, ...nextUploads]);
    toast.success(`${nextUploads.length} зураг нэмэгдлээ.`);
  }, []);

  const handleRemoveUpload = useCallback((uploadId: string) => {
    setUploads((prev) => {
      const target = prev.find((upload) => upload.id === uploadId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((upload) => upload.id !== uploadId);
    });
  }, []);

  const handleClearUploads = useCallback(() => {
    setUploads((prev) => {
      prev.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      return [];
    });
  }, []);

  const handleAnalyzeUploads = useCallback(async () => {
    if (locked) {
      toast.info("Түгжигдсэн долоо хоног дээр зураг уншуулах боломжгүй.");
      return;
    }

    if (uploads.length === 0) {
      toast.info("Эхлээд screenshots-аа оруулна уу.");
      return;
    }

    setIsReadingUploads(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/parse-schedule-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekKey,
          weekStartIso: format(weekStart, "yyyy-MM-dd"),
          weekEndIso: format(weekEnd, "yyyy-MM-dd"),
          dayLabels: targetDayLabels,
          employeeNames: employees.map((employee) => employee.name),
          dailyRequirements: requirements.map((item, index) => ({
            date: targetDayLabels[index],
            morning: item.morning,
            evening: item.evening,
          })),
          allowFallbackAssignment: false,
          images: uploads.map((upload) => ({
            name: upload.name,
            mimeType: upload.mimeType,
            dataUrl: upload.dataUrl,
          })),
        }),
      });

      const payload = (await response.json()) as ParsedSchedulePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "AI уншилт амжилтгүй боллоо.");
      }

      if (!payload.entries?.length) {
        throw new Error("Зурагнаас ээлжийн мэдээлэл олдсонгүй.");
      }

      applyImportedEntries(payload.entries);
      handleClearUploads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI уншилт амжилтгүй боллоо.");
    } finally {
      setIsReadingUploads(false);
    }
  }, [applyImportedEntries, employees, handleClearUploads, locked, requirements, targetDayLabels, uploads, weekEnd, weekKey, weekStart]);

  const handleWeekChange = useCallback((offset: number) => {
    const nextWeekStart = addDays(weekStart, offset);
    const nextWeekKey = getWeekKey(nextWeekStart);

    setSchedulesByWeek((prev) => {
      if (prev[nextWeekKey]) {
        return prev;
      }

      return {
        ...prev,
        [nextWeekKey]: {
          employees: employees.map((employee) => ({ ...employee })),
          grid: createInitialGrid(employees),
          requirements: requirements.map((item) => ({ ...item })),
          locked: false,
        },
      };
    });

    setWeekStart(nextWeekStart);
  }, [employees, requirements, weekStart]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight">🐨 Ээлжийн хуваарь</h1>
            <WeekSelector
              weekStart={weekStart}
              onPrev={() => handleWeekChange(-7)}
              onNext={() => handleWeekChange(7)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleUploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={locked}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Screenshots
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Screenshot Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="w-4 h-4" />
                  Add Screenshots
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleAnalyzeUploads()}
                  disabled={uploads.length === 0 || isReadingUploads}
                >
                  {isReadingUploads ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <WandSparkles className="w-4 h-4" />
                  )}
                  AI Read Screenshots
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsRequirementsOpen(true)}>
                  <WandSparkles className="w-4 h-4" />
                  Staffing Requirements
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClearUploads}
                  disabled={uploads.length === 0}
                  variant="destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Queue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? "Экспортлож байна" : "Зураг болгох"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
            >
              <Save className="w-3.5 h-3.5" />
              {locked ? "Тайлах" : "Хадгалах"}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Dialog open={isRequirementsOpen} onOpenChange={setIsRequirementsOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Daily Staffing Requirements</DialogTitle>
              <DialogDescription>
                Morning and evening headcount targets for this week.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {requirements.map((requirement, index) => (
                <div key={targetDayLabels[index]} className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-2">
                    <p className="text-sm font-semibold">{DAYS[index]}</p>
                    <p className="text-xs text-muted-foreground">{targetDayLabels[index]}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>Өглөө</span>
                      <input
                        type="number"
                        min={0}
                        value={requirement.morning}
                        disabled={locked}
                        onChange={(event) =>
                          handleRequirementChange(index, "morning", Number(event.target.value))
                        }
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>Орой</span>
                      <input
                        type="number"
                        min={0}
                        value={requirement.evening}
                        disabled={locked}
                        onChange={(event) =>
                          handleRequirementChange(index, "evening", Number(event.target.value))
                        }
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div
          ref={scheduleExportRef}
          className="rounded-2xl bg-background px-1 py-1"
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">KB Schedule</h2>
              <p className="text-sm text-muted-foreground">
                {format(weekStart, "yyyy.MM.dd")} - {format(addDays(weekStart, 6), "yyyy.MM.dd")}
              </p>
            </div>
          </div>
          <ShiftLegend />
          <div className="mt-4">
            <ScheduleGridComponent
              employees={employees}
              grid={grid}
              locked={locked}
              onCellChange={handleCellChange}
              onNameChange={handleNameChange}
              onAddEmployee={handleAddEmployee}
              onMoveEmployee={handleMoveEmployee}
              onRemoveEmployee={handleRemoveEmployee}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
