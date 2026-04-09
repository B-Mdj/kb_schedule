"use client";

import { DragEvent, useMemo, useState } from "react";
import {
  countsTowardShift,
  Employee,
  ScheduleGrid as GridType,
  DAYS,
  DAYS_FULL,
  CellData,
  WeekRequirements,
  countShifts,
  getAvailableCellStates,
} from "@/lib/schedule-data";
import { ShiftCell } from "./ShiftCell";
import { cn } from "@/lib/utils";
import { GripVertical, Plus, Trash2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  employees: Employee[];
  grid: GridType;
  requirements: WeekRequirements;
  onCellChange: (empId: string, dayIndex: number, nextCell: CellData) => void;
  onNameChange: (empId: string, newName: string) => void;
  onAddEmployee: (branch: 1 | 2) => void;
  onReorderEmployee: (empId: string, targetEmpId: string, position: "before" | "after") => void;
  onRemoveEmployee: (empId: string) => void;
  locked?: boolean;
}

export function ScheduleGridComponent({ employees, grid, requirements, onCellChange, onNameChange, onAddEmployee, onReorderEmployee, onRemoveEmployee, locked = false }: Props) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ empId: string; position: "before" | "after" } | null>(null);

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
      <div className="border-t border-border bg-muted/30 px-3 py-3 sm:px-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Дутуу байгаа ээлж
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {items.length > 0 ? (
            items.map((item) => (
              <span
                key={`${branch}-${item}`}
                className="min-w-0 rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-center text-[11px] font-medium text-amber-900 sm:px-2.5 sm:text-xs"
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

  const getDropPosition = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, employee: Employee) => {
    if (locked) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", employee.id);
    setDraggedEmployeeId(employee.id);
    setDropTarget({ empId: employee.id, position: "before" });
  };

  const handleDragEnd = () => {
    setDraggedEmployeeId(null);
    setDropTarget(null);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, employee: Employee) => {
    if (locked || !draggedEmployeeId || draggedEmployeeId === employee.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ empId: employee.id, position: getDropPosition(event) });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, employee: Employee) => {
    if (locked || !draggedEmployeeId || draggedEmployeeId === employee.id) return;
    event.preventDefault();
    const position = getDropPosition(event);
    onReorderEmployee(draggedEmployeeId, employee.id, position);
    setDraggedEmployeeId(null);
    setDropTarget(null);
  };

  const renderRow = (emp: Employee, empIdx: number, branchEmployees: Employee[]) => {
    const count = shiftCounts[emp.id];
    const isDragged = draggedEmployeeId === emp.id;
    const showDropBefore = dropTarget?.empId === emp.id && dropTarget.position === "before" && draggedEmployeeId !== emp.id;
    const showDropAfter = dropTarget?.empId === emp.id && dropTarget.position === "after" && draggedEmployeeId !== emp.id;
    return (
      <div
        key={emp.id}
        className={cn(
          "group relative grid grid-cols-[104px_repeat(7,minmax(2.5rem,1fr))_40px] border-b border-border last:border-b-0 sm:grid-cols-[220px_repeat(7,1fr)_60px]",
          isDragged && "opacity-45",
          "animate-fade-in"
        )}
        onDragOver={(event) => handleDragOver(event, emp)}
        onDrop={(event) => handleDrop(event, emp)}
        onDragEnd={handleDragEnd}
        style={{ animationDelay: `${empIdx * 40}ms`, animationFillMode: "backwards" }}
      >
        {showDropBefore && <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />}
        {showDropAfter && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
        {/* Name - editable */}
        <div className="sticky left-0 z-10 flex items-center justify-center gap-1 border-r border-border bg-card p-2 text-center sm:p-3">
          {!locked && editingName === emp.id ? (
            <input
              autoFocus
              className="w-full border-b border-primary bg-transparent text-center text-xs font-medium outline-none sm:text-sm"
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
              {!locked && (
                <button
                  draggable
                  onDragStart={(event) => handleDragStart(event, emp)}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
                  title="Чирж байр солих"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                className={cn(
                  "flex-1 wrap-break-word text-[11px] leading-snug whitespace-normal font-medium transition-colors sm:text-sm text-center",
                  !locked && "cursor-pointer hover:text-primary"
                )}
                onClick={() => !locked && setEditingName(emp.id)}
                title={locked ? undefined : "Нэр засах"}
              >
                {emp.name}
              </span>
              {!locked && (
                <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
            <div key={`${emp.id}-${dayIdx}`} className="p-0.5 sm:p-1.5">
              <ShiftCell
                data={cell}
                disabled={locked}
                options={getAvailableCellStates(emp)}
                onChange={(nextCell) => onCellChange(emp.id, dayIdx, nextCell)}
              />
            </div>
          );
        })}

        {/* Shift count */}
        <div className="flex items-center justify-center p-1.5 sm:p-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground sm:h-8 sm:w-8 sm:text-sm">
            {count}
          </span>
        </div>
      </div>
    );
  };

  return (
      <div className="space-y-4">
      {/* Branch 1 */}
      <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-106 sm:min-w-3xl">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 1</span>
          </div>
          {/* Header */}
          <div className="sticky top-0 z-20 grid grid-cols-[104px_repeat(7,minmax(2.5rem,1fr))_40px] border-b border-border bg-card sm:grid-cols-[220px_repeat(7,1fr)_60px]">
            <div className="sticky left-0 z-30 flex items-center bg-card p-2 text-[11px] font-semibold text-muted-foreground sm:p-3 sm:text-sm">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-2 text-center text-[11px] font-semibold text-muted-foreground sm:p-3 sm:text-sm">
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
      <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-106 sm:min-w-3xl">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 2</span>
          </div>
          <div className="sticky top-0 z-20 grid grid-cols-[104px_repeat(7,minmax(2.5rem,1fr))_40px] border-b border-border bg-card sm:grid-cols-[220px_repeat(7,1fr)_60px]">
            <div className="sticky left-0 z-30 flex items-center bg-card p-2 text-[11px] font-semibold text-muted-foreground sm:p-3 sm:text-sm">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-2 text-center text-[11px] font-semibold text-muted-foreground sm:p-3 sm:text-sm">
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
