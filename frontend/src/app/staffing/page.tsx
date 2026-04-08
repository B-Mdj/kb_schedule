"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, isValid, parseISO } from "date-fns";
import { ArrowLeft, ImagePlus, Loader2, Trash2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeekSelector } from "@/components/app/WeekSelector";
import { fetchApiJson } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-base-url";
import {
  createDefaultRequirements,
  DAYS,
  INITIAL_EMPLOYEES,
  createInitialGrid,
  normalizeEmployees,
  normalizeWeekRequirements,
  Employee,
  ScheduleGrid,
  WeekRequirements,
} from "@/lib/schedule-data";
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

function parseWeekParam(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(`${value}T00:00:00`);
  if (!isValid(parsed)) return null;
  return getMonday(parsed);
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

function StaffingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialWeek = useMemo(
    () => parseWeekParam(searchParams.get("week")) ?? getMonday(new Date()),
    [searchParams]
  );

  const [weekStart, setWeekStart] = useState(initialWeek);
  const [schedulesByWeek, setSchedulesByWeek] = useState<Record<string, WeekSchedule>>(() => {
    const initialWeekKey = getWeekKey(initialWeek);
    return {
      [initialWeekKey]: {
        employees: INITIAL_EMPLOYEES,
        grid: createInitialGrid(INITIAL_EMPLOYEES),
        requirements: createDefaultRequirements(),
        locked: false,
      },
    };
  });
  const [uploads, setUploads] = useState<UploadedScreenshot[]>([]);
  const [isReadingUploads, setIsReadingUploads] = useState(false);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [hasLoadedSchedules, setHasLoadedSchedules] = useState(false);

  useEffect(() => {
    const requestedWeek = parseWeekParam(searchParams.get("week"));
    if (requestedWeek && getWeekKey(requestedWeek) !== getWeekKey(weekStart)) {
      setWeekStart(requestedWeek);
    }
  }, [searchParams, weekStart]);

  const weekKey = getWeekKey(weekStart);
  const currentSchedule = schedulesByWeek[weekKey] ?? {
    employees: INITIAL_EMPLOYEES,
    grid: createInitialGrid(INITIAL_EMPLOYEES),
    requirements: createDefaultRequirements(),
    locked: false,
  };
  const employees = normalizeEmployees(currentSchedule.employees);
  const grid = currentSchedule.grid;
  const requirements = normalizeWeekRequirements(currentSchedule.requirements);
  const locked = currentSchedule.locked;
  const weekEnd = addDays(weekStart, 6);
  const targetDayLabels = Array.from({ length: 7 }, (_, index) =>
    format(addDays(weekStart, index), "yyyy-MM-dd")
  );
  const totalMorningRequirementBranch1 = requirements.reduce(
    (sum, item) => sum + item.branch1.morning,
    0
  );
  const totalEveningRequirementBranch1 = requirements.reduce(
    (sum, item) => sum + item.branch1.evening,
    0
  );
  const totalMorningRequirementBranch2 = requirements.reduce(
    (sum, item) => sum + item.branch2.morning,
    0
  );
  const totalEveningRequirementBranch2 = requirements.reduce(
    (sum, item) => sum + item.branch2.evening,
    0
  );
  const branch2Employees = employees.filter((employee) => employee.branch === 2);

  const syncWeekQuery = useCallback(
    (date: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("week", getWeekKey(date));
      router.replace(`/staffing?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSchedules() {
      try {
        const payload = await fetchApiJson<{
          schedulesByWeek?: Record<string, WeekSchedule>;
          error?: string;
        }>(`${API_BASE_URL}/schedules`);

        if (!cancelled && payload.schedulesByWeek && Object.keys(payload.schedulesByWeek).length > 0) {
          setSchedulesByWeek(payload.schedulesByWeek);
        }

        if (!cancelled) {
          setHasLoadedSchedules(true);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Хуваарь ачаалж чадсангүй.");
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

  const persistSchedule = useCallback(async (targetWeekKey: string, schedule: WeekSchedule) => {
    const normalized: WeekSchedule = {
      ...schedule,
      employees: normalizeEmployees(schedule.employees),
      requirements: normalizeWeekRequirements(schedule.requirements),
    };

    const response = await fetch(`${API_BASE_URL}/schedules/${targetWeekKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });

    if (!response.ok) {
      throw new Error("Хүний нөөцийн мэдээлэл хадгалж чадсангүй.");
    }
  }, []);

  useEffect(() => {
    if (isLoadingSchedules || !hasLoadedSchedules) return;

    const timeoutId = window.setTimeout(() => {
      void persistSchedule(weekKey, currentSchedule).catch(() => {
        toast.error("Хүний нөөцийн мэдээлэл хадгалж чадсангүй.");
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentSchedule, hasLoadedSchedules, isLoadingSchedules, persistSchedule, weekKey]);

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
          employees: normalizeEmployees(existing.employees),
          requirements: normalizeWeekRequirements(existing.requirements),
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
        ? `${merged.updatedCount} ажилтан шинэчлэгдэж, ${merged.reviewCount} мөр шалгах шаардлагатай байна.`
        : `${merged.updatedCount} ажилтан шинэчлэгдлээ.`
    );
  }, [employees, grid, updateCurrentWeek]);

  const handleRequirementChange = useCallback(
    (
      dayIndex: number,
      branch: "branch1" | "branch2",
      field: "morning" | "evening",
      value: number
    ) => {
      updateCurrentWeek((schedule) => {
        const nextRequirements = normalizeWeekRequirements(schedule.requirements);
        nextRequirements[dayIndex] = {
          ...nextRequirements[dayIndex],
          [branch]: {
            ...nextRequirements[dayIndex][branch],
            [field]: Math.max(0, value),
          },
        };

        return {
          ...schedule,
          requirements: nextRequirements,
        };
      });
    },
    [updateCurrentWeek]
  );

  const handleBranchSupportToggle = useCallback((employeeId: string, enabled: boolean) => {
    updateCurrentWeek((schedule) => ({
      ...schedule,
      employees: schedule.employees.map((employee) =>
        employee.id === employeeId
          ? { ...employee, canWorkBranch1: employee.branch === 2 ? enabled : false }
          : employee
      ),
    }));
  }, [updateCurrentWeek]);

  const handleUploadFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;

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
    toast.success(`${nextUploads.length} screenshots added.`);
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
      toast.info("Зураг уншуулахын өмнө долоо хоногийн түгжээг тайлна уу.");
      return;
    }

    if (uploads.length === 0) {
      toast.info("Эхлээд зургаа нэмнэ үү.");
      return;
    }

    setIsReadingUploads(true);
    try {
      const response = await fetch(`${API_BASE_URL}/parse-schedule-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekKey,
          weekStartIso: format(weekStart, "yyyy-MM-dd"),
          weekEndIso: format(weekEnd, "yyyy-MM-dd"),
          dayLabels: targetDayLabels,
          employeeNames: employees.map((employee) => employee.name),
          employeeDirectory: employees.map((employee) => ({
            name: employee.name,
            branch: employee.branch,
            canWorkBranch1: employee.canWorkBranch1 ?? false,
          })),
          dailyRequirements: requirements.map((item, index) => ({
            date: targetDayLabels[index],
            branch1: {
              morning: item.branch1.morning,
              evening: item.branch1.evening,
            },
            branch2: {
              morning: item.branch2.morning,
              evening: item.branch2.evening,
            },
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
        throw new Error(payload.error || "AI зураг уншиж чадсангүй.");
      }

      if (!payload.entries?.length) {
        throw new Error("Зурган дээрээс хуваарийн мэдээлэл олдсонгүй.");
      }

      applyImportedEntries(payload.entries);
      handleClearUploads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI зураг уншиж чадсангүй.");
    } finally {
      setIsReadingUploads(false);
    }
  }, [applyImportedEntries, employees, handleClearUploads, locked, requirements, targetDayLabels, uploads, weekEnd, weekKey, weekStart]);

  const handleWeekChange = useCallback((offset: number) => {
    const nextWeekStart = addDays(weekStart, offset);
    const nextWeekKey = getWeekKey(nextWeekStart);

    setSchedulesByWeek((prev) => {
      if (prev[nextWeekKey]) return prev;

      return {
        ...prev,
        [nextWeekKey]: {
          employees: employees.map((employee) => ({ ...employee })),
          grid: createInitialGrid(employees),
          requirements: requirements.map((item) => ({
            branch1: { ...item.branch1 },
            branch2: { ...item.branch2 },
          })),
          locked: false,
        },
      };
    });

    setWeekStart(nextWeekStart);
    syncWeekQuery(nextWeekStart);
  }, [employees, requirements, syncWeekQuery, weekStart]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Button
              variant="outline"
              size="icon-sm"
              asChild
              aria-label="Хуваарь руу буцах"
              title="Хуваарь руу буцах"
            >
              <Link href={`/?week=${weekKey}`}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <h1 className="min-w-0 text-base font-bold tracking-tight sm:text-lg">Хүний нөөц ба зургууд</h1>
          </div>
          <div className="w-full sm:w-auto">
            <WeekSelector
              weekStart={weekStart}
              onPrev={() => handleWeekChange(-7)}
              onNext={() => handleWeekChange(7)}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-6">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">Зураг оруулах</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => fileInputRef.current?.click()}
                disabled={locked}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Зураг нэмэх
              </Button>
              <Button
                size="sm"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => void handleAnalyzeUploads()}
                disabled={uploads.length === 0 || isReadingUploads || locked}
              >
                {isReadingUploads ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="h-3.5 w-3.5" />
                )}
                Уншуулах
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 sm:w-auto"
                onClick={handleClearUploads}
                disabled={uploads.length === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Цэвэрлэх
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {uploads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                Одоогоор нэмсэн зураг алга.
              </div>
            ) : (
              uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{upload.name}</p>
                    <p className="text-xs text-muted-foreground">{upload.mimeType}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveUpload(upload.id)}
                    aria-label={`${upload.name} зургийг хасах`}
                    title={`${upload.name} зургийг хасах`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">2-р салбарын 1-р салбарт ажиллаж болох хүмүүс</h2>
            <p className="text-sm text-muted-foreground">
              AI шаардлагатай үед зөвхөн энд асаасан 2-р салбарын хүмүүсийг 1-р салбарын дутагдалд тооцно.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {branch2Employees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                2-р салбарт ажилтан алга.
              </div>
            ) : (
              branch2Employees.map((employee) => {
                const enabled = Boolean(employee.canWorkBranch1);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-left transition-colors sm:px-4 ${
                      enabled
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/50"
                    }`}
                    onClick={() => !locked && handleBranchSupportToggle(employee.id, !enabled)}
                    disabled={locked}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{employee.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {enabled ? "1-р салбар руу тооцож болно" : "Зөвхөн 2-р салбартаа тооцно"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          enabled
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {enabled ? "Асаалттай" : "Унтраалттай"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
            <h2 className="text-base font-semibold sm:text-lg">Өдрийн ажиллах хүчний хэрэгцээ</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:grid-cols-2 sm:gap-4 sm:px-6 sm:py-5 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                1-р салбар өглөө
              </p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{totalMorningRequirementBranch1}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                1-р салбар орой
              </p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{totalEveningRequirementBranch1}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                2-р салбар өглөө
              </p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{totalMorningRequirementBranch2}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                2-р салбар орой
              </p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{totalEveningRequirementBranch2}</p>
            </div>
          </div>
          <div className="space-y-3 px-4 py-4 sm:hidden">
            {requirements.map((requirement, index) => (
              <div
                key={targetDayLabels[index]}
                className="rounded-2xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="mb-3">
                  <p className="text-base font-semibold">{DAYS[index]}</p>
                  <p className="text-sm text-muted-foreground">{targetDayLabels[index]}</p>
                </div>
                <div className="grid gap-3">
                  <label className="grid gap-1.5 text-xs">
                    <span className="font-medium text-muted-foreground">1-Ñ€ ÑÐ°Ð»Ð±Ð°Ñ€ Ó©Ð³Ð»Ó©Ó©</span>
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch1.morning}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch1", "morning", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs">
                    <span className="font-medium text-muted-foreground">1-Ñ€ ÑÐ°Ð»Ð±Ð°Ñ€ Ð¾Ñ€Ð¾Ð¹</span>
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch1.evening}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch1", "evening", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs">
                    <span className="font-medium text-muted-foreground">2-Ñ€ ÑÐ°Ð»Ð±Ð°Ñ€ Ó©Ð³Ð»Ó©Ó©</span>
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch2.morning}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch2", "morning", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs">
                    <span className="font-medium text-muted-foreground">2-Ñ€ ÑÐ°Ð»Ð±Ð°Ñ€ Ð¾Ñ€Ð¾Ð¹</span>
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch2.evening}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch2", "evening", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto px-6 py-6 sm:block">
            <div className="min-w-[54rem]">
              <div className="grid grid-cols-[minmax(10rem,1.2fr)_repeat(4,minmax(8rem,1fr))] gap-4 px-1 pb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Өдөр
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  1-р салбар өглөө
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  1-р салбар орой
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  2-р салбар өглөө
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  2-р салбар орой
                </p>
              </div>
              <div className="space-y-4">
                {requirements.map((requirement, index) => (
                  <div
                    key={targetDayLabels[index]}
                    className="grid grid-cols-[minmax(10rem,1.2fr)_repeat(4,minmax(8rem,1fr))] items-end gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm"
                  >
                    <div>
                      <p className="text-lg font-semibold">{DAYS[index]}</p>
                      <p className="text-sm text-muted-foreground">{targetDayLabels[index]}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch1.morning}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch1", "morning", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch1.evening}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch1", "evening", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch2.morning}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch2", "morning", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={requirement.branch2.evening}
                      disabled={locked || isLoadingSchedules}
                      onChange={(event) =>
                        handleRequirementChange(index, "branch2", "evening", Number(event.target.value))
                      }
                      inputMode="numeric"
                      className="h-11 bg-background text-right font-medium text-foreground"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground sm:px-6">
            {locked ? "Энэ долоо хоног үндсэн хуудас дээр түгжигдсэн байна." : "Өөрчлөлтүүд автоматаар хадгалагдана."}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function StaffingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <StaffingPageClient />
    </Suspense>
  );
}
