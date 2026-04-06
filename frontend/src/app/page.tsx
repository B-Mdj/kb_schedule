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
import {
  createDefaultRequirements,
  INITIAL_EMPLOYEES,
  createInitialGrid,
  normalizeEmployees,
  normalizeWeekRequirements,
  ShiftCode,
  ScheduleGrid,
  Employee,
  WeekRequirements,
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:4000";

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
        const response = await fetch(`${API_BASE_URL}/api/schedules`);
        const payload = (await response.json()) as {
          schedulesByWeek?: Record<string, WeekSchedule>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load schedules.");
        }

        if (!cancelled && payload.schedulesByWeek && Object.keys(payload.schedulesByWeek).length > 0) {
          setSchedulesByWeek(payload.schedulesByWeek);
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

    const response = await fetch(`${API_BASE_URL}/api/schedules/${targetWeekKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });

    if (!response.ok) {
      throw new Error("Failed to save schedule.");
    }
  }, []);

  useEffect(() => {
    if (isLoadingSchedules) return;

    const timeoutId = window.setTimeout(() => {
      void persistSchedule(weekKey, currentSchedule).catch(() => {
        toast.error("Failed to save schedule to the backend.");
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentSchedule, isLoadingSchedules, persistSchedule, weekKey]);

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

  const handleCellChange = useCallback((empId: string, dayIndex: number, shift: ShiftCode) => {
    updateCurrentWeek((schedule) => {
      const updated = { ...schedule.grid };
      const row = [...updated[empId]];
      const existing = row[dayIndex];
      row[dayIndex] = { ...existing, shift, time: undefined, coverageBranch: undefined };
      updated[empId] = row;

      return { ...schedule, grid: updated };
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

      if (branchIndex === -1) return schedule;

      const swapIndex = direction === "up" ? branchIndex - 1 : branchIndex + 1;
      if (swapIndex < 0 || swapIndex >= branchEmployees.length) return schedule;

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

      return { ...schedule, employees: nextEmployees };
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

  const handleLockToggle = useCallback(() => {
    updateCurrentWeek((schedule) => ({
      ...schedule,
      locked: !schedule.locked,
    }));
    toast.success(locked ? "Week unlocked." : "Week locked.");
  }, [locked, updateCurrentWeek]);

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

    setSchedulesByWeek((prev) => {
      if (prev[nextWeekKey]) return prev;

      return {
        ...prev,
        [nextWeekKey]: {
          employees: employees.map((employee) => ({ ...employee })),
          grid: createInitialGrid(employees),
          requirements: createDefaultRequirements(),
          locked: false,
        },
      };
    });

    setWeekStart(nextWeekStart);
    syncWeekQuery(nextWeekStart);
  }, [employees, syncWeekQuery, weekStart]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="text-lg font-bold tracking-tight">🐨 KB Хуваарь</h1>
            <WeekSelector
              weekStart={weekStart}
              onPrev={() => handleWeekChange(-7)}
              onNext={() => handleWeekChange(7)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
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
        <div ref={scheduleExportRef} className="rounded-2xl bg-background px-1 py-1">
          <div className="mb-4 flex items-end justify-between gap-4">
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
              onMoveEmployee={handleMoveEmployee}
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
