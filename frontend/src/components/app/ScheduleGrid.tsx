"use client";

import { useState, useMemo } from "react";
import {
  countsTowardShift,
  Employee,
  ScheduleGrid as GridType,
  DAYS,
  DAYS_FULL,
  ShiftCode,
  WeekRequirements,
  countShifts,
} from "@/lib/schedule-data";
import { ShiftCell } from "./ShiftCell";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  employees: Employee[];
  grid: GridType;
  requirements: WeekRequirements;
  onCellChange: (empId: string, dayIndex: number, shift: ShiftCode) => void;
  onNameChange: (empId: string, newName: string) => void;
  onAddEmployee: (branch: 1 | 2) => void;
  onMoveEmployee: (empId: string, direction: "up" | "down") => void;
  onRemoveEmployee: (empId: string) => void;
  locked?: boolean;
}

const MIN_SHIFTS = 4;

export function ScheduleGridComponent({ employees, grid, requirements, onCellChange, onNameChange, onAddEmployee, onMoveEmployee, onRemoveEmployee, locked = false }: Props) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const branch1 = employees.filter((e) => e.branch === 1);
  const branch2 = employees.filter((e) => e.branch === 2);

  const shiftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((emp) => {
      counts[emp.id] = grid[emp.id] ? countShifts(grid[emp.id]) : 0;
    });
    return counts;
  }, [employees, grid]);

  const shortagesByBranch = useMemo(() => {
    return {
      1: requirements.map((requirement, dayIndex) => {
        let assignedMorning = 0;
        let assignedEvening = 0;

        employees.forEach((employee) => {
          const cell = grid[employee.id]?.[dayIndex];
          if (!cell) return;

          const effectiveBranch = cell.coverageBranch ?? employee.branch;
          if (effectiveBranch !== 1) return;

          if (countsTowardShift(cell, "morning")) assignedMorning += 1;
          if (countsTowardShift(cell, "evening")) assignedEvening += 1;
        });

        return {
          dayLabel: DAYS[dayIndex],
          morning: Math.max(0, requirement.branch1.morning - assignedMorning),
          evening: Math.max(0, requirement.branch1.evening - assignedEvening),
        };
      }),
      2: requirements.map((requirement, dayIndex) => {
        let assignedMorning = 0;
        let assignedEvening = 0;

        employees.forEach((employee) => {
          const cell = grid[employee.id]?.[dayIndex];
          if (!cell) return;

          const effectiveBranch = cell.coverageBranch ?? employee.branch;
          if (effectiveBranch !== 2) return;

          if (countsTowardShift(cell, "morning")) assignedMorning += 1;
          if (countsTowardShift(cell, "evening")) assignedEvening += 1;
        });

        return {
          dayLabel: DAYS[dayIndex],
          morning: Math.max(0, requirement.branch2.morning - assignedMorning),
          evening: Math.max(0, requirement.branch2.evening - assignedEvening),
        };
      }),
    } as const;
  }, [employees, grid, requirements]);

  const renderShortages = (branch: 1 | 2) => {
    const items = shortagesByBranch[branch].flatMap((day) => {
      const results: string[] = [];
      if (day.morning > 0) {
        results.push(`${day.dayLabel} өглөө ${day.morning}`);
      }
      if (day.evening > 0) {
        results.push(`${day.dayLabel} орой ${day.evening}`);
      }
      return results;
    });

    return (
      <div className="border-t border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Дутуу байгаа ээлж
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {items.length > 0 ? (
            items.map((item) => (
              <span
                key={`${branch}-${item}`}
                className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900"
              >
                {item}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Одоогоор дутуу ээлж алга.</span>
          )}
        </div>
      </div>
    );
  };

  const renderRow = (emp: Employee, empIdx: number, branchEmployees: Employee[]) => {
    const count = shiftCounts[emp.id];
    const branchIndex = branchEmployees.findIndex((employee) => employee.id === emp.id);
    const canMoveUp = branchIndex > 0;
    const canMoveDown = branchIndex >= 0 && branchIndex < branchEmployees.length - 1;
    return (
      <div
        key={emp.id}
        className={cn(
          "group grid grid-cols-[160px_repeat(7,minmax(2.75rem,1fr))_48px] border-b border-border last:border-b-0 sm:grid-cols-[220px_repeat(7,1fr)_60px]",
          "animate-fade-in"
        )}
        style={{ animationDelay: `${empIdx * 40}ms`, animationFillMode: "backwards" }}
      >
        {/* Name - editable */}
        <div className="sticky left-0 z-10 flex items-start gap-1 border-r border-border bg-card p-2 sm:p-3">
          {!locked && editingName === emp.id ? (
            <input
              autoFocus
              className="w-full border-b border-primary bg-transparent text-xs font-medium outline-none sm:text-sm"
              defaultValue={emp.name}
              onBlur={(e) => {
                onNameChange(emp.id, e.target.value || emp.name);
                setEditingName(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onNameChange(emp.id, (e.target as HTMLInputElement).value || emp.name);
                  setEditingName(null);
                }
              }}
            />
          ) : (
            <>
              <span
                className={cn(
                  "flex-1 break-words text-xs leading-snug whitespace-normal font-medium transition-colors sm:text-sm",
                  !locked && "cursor-pointer hover:text-primary"
                )}
                onClick={() => !locked && setEditingName(emp.id)}
                title={locked ? undefined : "Нэр засах"}
              >
                {emp.name}
              </span>
              {!locked && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onMoveEmployee(emp.id, "up")}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    title="Дээш зөөх"
                    disabled={!canMoveUp}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onMoveEmployee(emp.id, "down")}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    title="Доош зөөх"
                    disabled={!canMoveDown}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(emp)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    title="Устгах"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Cells */}
        {(grid[emp.id] || []).map((cell, dayIdx) => {
          return (
            <div key={`${emp.id}-${dayIdx}`} className="p-1 sm:p-1.5">
              <ShiftCell
                data={cell}
                disabled={locked}
                onChange={(shift) => onCellChange(emp.id, dayIdx, shift)}
              />
            </div>
          );
        })}

        {/* Shift count */}
        <div className="flex items-center justify-center p-2 sm:p-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground sm:h-8 sm:w-8 sm:text-sm">
            {count}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Branch 1 */}
      <div className="overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-[40rem] sm:min-w-[48rem]">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 1</span>
          </div>
          {/* Header */}
          <div className="sticky top-0 z-20 grid grid-cols-[160px_repeat(7,minmax(2.75rem,1fr))_48px] border-b border-border bg-card sm:grid-cols-[220px_repeat(7,1fr)_60px]">
            <div className="sticky left-0 z-30 flex items-center bg-card p-2 text-xs font-semibold text-muted-foreground sm:p-3 sm:text-sm">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-2 text-center text-xs font-semibold text-muted-foreground sm:p-3 sm:text-sm">
                    {d}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{DAYS_FULL[i]}</TooltipContent>
              </Tooltip>
            ))}
            <div className="p-2 text-center text-[10px] font-semibold text-muted-foreground sm:p-3 sm:text-xs">
              Ээлж
            </div>
          </div>
          {branch1.map((emp, i) => renderRow(emp, i, branch1))}
          {!locked && (
            <div className="p-1.5 flex justify-center">
              <button
                onClick={() => onAddEmployee(1)}
                className="w-7 h-7 rounded-full border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {renderShortages(1)}
        </div>
      </div>

      {/* Branch 2 */}
      <div className="overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-[40rem] sm:min-w-[48rem]">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 2</span>
          </div>
          <div className="sticky top-0 z-20 grid grid-cols-[160px_repeat(7,minmax(2.75rem,1fr))_48px] border-b border-border bg-card sm:grid-cols-[220px_repeat(7,1fr)_60px]">
            <div className="sticky left-0 z-30 flex items-center bg-card p-2 text-xs font-semibold text-muted-foreground sm:p-3 sm:text-sm">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-2 text-center text-xs font-semibold text-muted-foreground sm:p-3 sm:text-sm">
                    {d}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{DAYS_FULL[i]}</TooltipContent>
              </Tooltip>
            ))}
            <div className="p-2 text-center text-[10px] font-semibold text-muted-foreground sm:p-3 sm:text-xs">
              Ээлж
            </div>
          </div>
          {branch2.map((emp, i) => renderRow(emp, branch1.length + i, branch2))}
          {!locked && (
            <div className="p-1.5 flex justify-center">
              <button
                onClick={() => onAddEmployee(2)}
                className="w-7 h-7 rounded-full border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {renderShortages(2)}
        </div>
      </div>

      <AlertDialog open={!locked && !!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ажилтан устгах</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>-г жагсаалтаас устгахдаа итгэлтэй байна уу?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Болих</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) onRemoveEmployee(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Устгах
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
