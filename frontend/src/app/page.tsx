"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, isValid, parseISO } from "date-fns";
import { Download, Lock, Settings2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeekSelector } from "@/components/app/WeekSelector";
import { ScheduleGridComponent } from "@/components/app/ScheduleGrid";
import { ShiftLegend } from "@/components/app/ShiftLegend";
import { fetchApiJson } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-base-url";
import {
  createDefaultRequirements,
  INITIAL_EMPLOYEES,
  createInitialGrid,
  normalizeEmployees,
  normalizeWeekRequirements,
  CellData,
  ScheduleGrid,
  Employee,
  WeekRequirements,
  createEmptyCell,
} from "@/lib/schedule-data";
import { exportNodeAsPng } from "@/lib/export-as-image";
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

function createDefaultWeekSchedule(employees: Employee[]): WeekSchedule {
  return {
    employees,
    grid: createInitialGrid(employees),
    requirements: createDefaultRequirements(),
    locked: false,
  };
}

function syncRosterToWeek(sourceEmployees: Employee[], schedule?: WeekSchedule): WeekSchedule {
  const normalizedEmployees = normalizeEmployees(sourceEmployees);
  const baseSchedule = schedule ?? createDefaultWeekSchedule(normalizedEmployees);

  return {
    ...baseSchedule,
    employees: normalizedEmployees.map((employee) => ({ ...employee })),
    grid: Object.fromEntries(
      normalizedEmployees.map((employee) => [
        employee.id,
        baseSchedule.grid[employee.id] ?? createInitialGrid([employee])[employee.id],
      ])
    ),
  };
}

function SchedulePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [hasLoadedSchedules, setHasLoadedSchedules] = useState(false);
  const [pendingPersistWeekKeys, setPendingPersistWeekKeys] = useState<string[]>([]);
  const scheduleExportRef = useRef<HTMLDivElement>(null);

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

  const syncWeekQuery = useCallback(
    (date: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("week", getWeekKey(date));
      router.replace(`/?${params.toString()}`, { scroll: false });
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
          toast.error(error instanceof Error ? error.message : "Failed to load schedules.");
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

    await fetchApiJson(`${API_BASE_URL}/schedules/${targetWeekKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
  }, []);

  const queueWeekPersistence = useCallback((...keys: string[]) => {
    setPendingPersistWeekKeys((prev) => Array.from(new Set([...prev, ...keys])));
  }, []);

  useEffect(() => {
    if (isLoadingSchedules || !hasLoadedSchedules || pendingPersistWeekKeys.length === 0) return;

    const weekKeysToPersist = [...pendingPersistWeekKeys];
    const timeoutId = window.setTimeout(() => {
      void Promise.all(
        weekKeysToPersist.map(async (targetWeekKey) => {
          const schedule = schedulesByWeek[targetWeekKey];
          if (!schedule) return;
          await persistSchedule(targetWeekKey, schedule);
        })
      )
        .then(() => {
          setPendingPersistWeekKeys((prev) => prev.filter((key) => !weekKeysToPersist.includes(key)));
        })
        .catch(() => {
          toast.error("Failed to save schedule to the backend.");
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasLoadedSchedules, isLoadingSchedules, pendingPersistWeekKeys, persistSchedule, schedulesByWeek]);

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

  const updateCurrentAndNextWeekRoster = useCallback(
    (transformRoster: (employees: Employee[]) => Employee[]) => {
      const nextWeekKey = getWeekKey(addDays(weekStart, 7));

      setSchedulesByWeek((prev) => {
        const currentExisting = prev[weekKey] ?? createDefaultWeekSchedule(INITIAL_EMPLOYEES);
        const normalizedCurrent = {
          ...currentExisting,
          employees: normalizeEmployees(currentExisting.employees),
          requirements: normalizeWeekRequirements(currentExisting.requirements),
        };

        const nextRoster = normalizeEmployees(transformRoster(normalizedCurrent.employees));
        const nextCurrentSchedule = syncRosterToWeek(nextRoster, normalizedCurrent);
        const nextWeekSchedule = syncRosterToWeek(nextRoster, prev[nextWeekKey]);

        return {
          ...prev,
          [weekKey]: nextCurrentSchedule,
          [nextWeekKey]: nextWeekSchedule,
        };
      });

      queueWeekPersistence(weekKey, nextWeekKey);
    },
    [queueWeekPersistence, weekKey, weekStart]
  );

  const handleCellChange = useCallback((empId: string, dayIndex: number, nextCell: CellData) => {
    updateCurrentWeek((schedule) => {
      const updated = { ...schedule.grid };
      const employee = schedule.employees.find((item) => item.id === empId);
      const row = [...(updated[empId] ?? Array.from({ length: 7 }, () => createEmptyCell(employee?.branch ?? 1)))];
      const existing = row[dayIndex] ?? createEmptyCell(employee?.branch ?? 1);
      row[dayIndex] = { ...existing, ...nextCell, time: undefined };
      updated[empId] = row;

      return { ...schedule, grid: updated };
    });
    queueWeekPersistence(weekKey);
  }, [queueWeekPersistence, updateCurrentWeek, weekKey]);

  const handleNameChange = useCallback((empId: string, newName: string) => {
    updateCurrentAndNextWeekRoster((employees) =>
      employees.map((employee) =>
        employee.id === empId ? { ...employee, name: newName } : employee
      )
    );
  }, [updateCurrentAndNextWeekRoster]);

  const handleAddEmployee = useCallback((branch: 1 | 2) => {
    const id = crypto.randomUUID();
    const newEmp: Employee = { id, name: "Шинэ ажилтан", branch };
    updateCurrentAndNextWeekRoster((employees) => [...employees, newEmp]);
  }, [updateCurrentAndNextWeekRoster]);

  const handleReorderEmployee = useCallback((empId: string, targetEmpId: string, position: "before" | "after") => {
    updateCurrentAndNextWeekRoster((employees) => {
      const draggedEmployee = employees.find((employee) => employee.id === empId);
      const targetEmployee = employees.find((employee) => employee.id === targetEmpId);
      if (!draggedEmployee || !targetEmployee || draggedEmployee.branch !== targetEmployee.branch) return employees;

      const branchEmployees = employees.filter((employee) => employee.branch === draggedEmployee.branch);
      const fromIndex = branchEmployees.findIndex((employee) => employee.id === empId);
      const targetIndex = branchEmployees.findIndex((employee) => employee.id === targetEmpId);
      if (fromIndex === -1 || targetIndex === -1) return employees;

      const reorderedBranch = [...branchEmployees];
      const [movedEmployee] = reorderedBranch.splice(fromIndex, 1);
      const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
      reorderedBranch.splice(insertIndex, 0, movedEmployee);

      const unchangedOrder = reorderedBranch.every((employee, index) => employee.id === branchEmployees[index]?.id);
      if (unchangedOrder) return employees;

      const nextEmployees: Employee[] = [];
      let branchCursor = 0;

      employees.forEach((employee) => {
        if (employee.branch === draggedEmployee.branch) {
          nextEmployees.push(reorderedBranch[branchCursor]);
          branchCursor += 1;
        } else {
          nextEmployees.push(employee);
        }
      });

      return nextEmployees;
    });
  }, [updateCurrentAndNextWeekRoster]);

  const handleRemoveEmployee = useCallback((empId: string) => {
    updateCurrentAndNextWeekRoster((employees) =>
      employees.filter((employee) => employee.id !== empId)
    );
  }, [updateCurrentAndNextWeekRoster]);

  const handleLockToggle = useCallback(() => {
    updateCurrentWeek((schedule) => ({
      ...schedule,
      locked: !schedule.locked,
    }));
    queueWeekPersistence(weekKey);
    toast.success(locked ? "Week unlocked." : "Week locked.");
  }, [locked, queueWeekPersistence, updateCurrentWeek, weekKey]);

  const handleExport = useCallback(async () => {
    if (!scheduleExportRef.current) {
      toast.error("Could not find the schedule to export.");
      return;
    }

    setIsExporting(true);
    try {
      const filename = `schedule-${format(weekStart, "yyyy-MM-dd")}.png`;
      await exportNodeAsPng(scheduleExportRef.current, filename);
      toast.success("Schedule image downloaded.");
    } catch {
      toast.error("Failed to export schedule image.");
    } finally {
      setIsExporting(false);
    }
  }, [weekStart]);

  const handleWeekChange = useCallback((offset: number) => {
    const nextWeekStart = addDays(weekStart, offset);
    const nextWeekKey = getWeekKey(nextWeekStart);
    let createdNewWeek = false;

    setSchedulesByWeek((prev) => {
      if (prev[nextWeekKey]) return prev;
      createdNewWeek = true;

      return {
        ...prev,
        [nextWeekKey]: syncRosterToWeek(employees),
      };
    });

    if (createdNewWeek) {
      queueWeekPersistence(nextWeekKey);
    }

    setWeekStart(nextWeekStart);
    syncWeekQuery(nextWeekStart);
  }, [employees, queueWeekPersistence, syncWeekQuery, weekStart]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="text-base font-bold tracking-tight sm:text-lg">🐨 KB Хуваарь</h1>
            <div className="w-full sm:w-auto">
              <WeekSelector
                weekStart={weekStart}
                onPrev={() => handleWeekChange(-7)}
                onNext={() => handleWeekChange(7)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="icon-sm"
              asChild
              aria-label="Хүний нөөцийн хуудас"
              title="Хүний нөөцийн хуудас"
            >
              <Link href={`/staffing?week=${weekKey}`}>
                <Settings2 className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleExport}
              disabled={isExporting}
              aria-label={isExporting ? "Хуваарь экспортлож байна" : "Хуваарь экспортлох"}
              title={isExporting ? "Хуваарь экспортлож байна" : "Хуваарь экспортлох"}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={locked ? "default" : "outline"}
              size="icon-sm"
              onClick={handleLockToggle}
              aria-label={locked ? "Хуваарийн түгжээ тайлах" : "Хуваарь түгжих"}
              title={locked ? "Хуваарийн түгжээ тайлах" : "Хуваарь түгжих"}
            >
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <div ref={scheduleExportRef} className="min-w-0 rounded-2xl bg-background px-1 py-1">
          <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end sm:gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">KB Хуваарь</h2>
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
              requirements={requirements}
              locked={locked || isLoadingSchedules}
              onCellChange={handleCellChange}
              onNameChange={handleNameChange}
              onAddEmployee={handleAddEmployee}
              onReorderEmployee={handleReorderEmployee}
              onRemoveEmployee={handleRemoveEmployee}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Index() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SchedulePageClient />
    </Suspense>
  );
}
