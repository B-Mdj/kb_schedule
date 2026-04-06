"use client";

import { useState, useMemo } from "react";
import {
  Employee,
  ScheduleGrid as GridType,
  DAYS,
  DAYS_FULL,
  ShiftCode,
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
  onCellChange: (empId: string, dayIndex: number, shift: ShiftCode) => void;
  onNameChange: (empId: string, newName: string) => void;
  onAddEmployee: (branch: 1 | 2) => void;
  onMoveEmployee: (empId: string, direction: "up" | "down") => void;
  onRemoveEmployee: (empId: string) => void;
  locked?: boolean;
}

const MIN_SHIFTS = 4;

export function ScheduleGridComponent({ employees, grid, onCellChange, onNameChange, onAddEmployee, onMoveEmployee, onRemoveEmployee, locked = false }: Props) {
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

  const renderRow = (emp: Employee, empIdx: number, branchEmployees: Employee[]) => {
    const count = shiftCounts[emp.id];
    const branchIndex = branchEmployees.findIndex((employee) => employee.id === emp.id);
    const canMoveUp = branchIndex > 0;
    const canMoveDown = branchIndex >= 0 && branchIndex < branchEmployees.length - 1;
    return (
      <div
        key={emp.id}
        className={cn(
          "group grid grid-cols-[220px_repeat(7,1fr)_60px] border-b border-border last:border-b-0",
          "animate-fade-in"
        )}
        style={{ animationDelay: `${empIdx * 40}ms`, animationFillMode: "backwards" }}
      >
        {/* Name - editable */}
        <div className="p-3 flex items-start gap-1 sticky left-0 bg-card z-10 border-r border-border">
          {!locked && editingName === emp.id ? (
            <input
              autoFocus
              className="font-medium text-sm w-full bg-transparent border-b border-primary outline-none"
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
                  "font-medium text-sm leading-snug whitespace-normal break-words flex-1 transition-colors",
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
            <div key={`${emp.id}-${dayIdx}`} className="p-1.5">
              <ShiftCell
                data={cell}
                disabled={locked}
                onChange={(shift) => onCellChange(emp.id, dayIdx, shift)}
              />
            </div>
          );
        })}

        {/* Shift count */}
        <div className="p-3 flex items-center justify-center">
          <span className="text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center bg-accent text-accent-foreground">
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
        <div className="min-w-175">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 1</span>
          </div>
          {/* Header */}
          <div className="grid grid-cols-[220px_repeat(7,1fr)_60px] sticky top-0 z-20 bg-card border-b border-border">
            <div className="p-3 font-semibold text-sm text-muted-foreground sticky left-0 bg-card z-30 flex items-center">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-3 text-center font-semibold text-sm text-muted-foreground">
                    {d}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{DAYS_FULL[i]}</TooltipContent>
              </Tooltip>
            ))}
            <div className="p-3 text-center font-semibold text-xs text-muted-foreground">
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
        </div>
      </div>

      {/* Branch 2 */}
      <div className="overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <div className="min-w-175">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-semibold text-muted-foreground">Салбар 2</span>
          </div>
          <div className="grid grid-cols-[220px_repeat(7,1fr)_60px] sticky top-0 z-20 bg-card border-b border-border">
            <div className="p-3 font-semibold text-sm text-muted-foreground sticky left-0 bg-card z-30 flex items-center">
              Ажилтан
            </div>
            {DAYS.map((d, i) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <div className="p-3 text-center font-semibold text-sm text-muted-foreground">
                    {d}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{DAYS_FULL[i]}</TooltipContent>
              </Tooltip>
            ))}
            <div className="p-3 text-center font-semibold text-xs text-muted-foreground">
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
