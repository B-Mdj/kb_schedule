"use client";

import { useState, useCallback } from "react";
import { ShiftCode, SHIFT_ORDER, SHIFT_LABELS, getShiftClass, CellData } from "@/lib/schedule-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ShiftCellProps {
  data: CellData;
  onChange: (shift: ShiftCode) => void;
  disabled?: boolean;
}

export function ShiftCell({ data, onChange, disabled = false }: ShiftCellProps) {
  const [animating, setAnimating] = useState(false);

  const cycleShift = useCallback(() => {
    const idx = SHIFT_ORDER.indexOf(data.shift);
    const next = SHIFT_ORDER[(idx + 1) % SHIFT_ORDER.length];
    setAnimating(true);
    onChange(next);
    setTimeout(() => setAnimating(false), 250);
  }, [data.shift, onChange]);

  const handleClick = () => {
    if (disabled) return;
    cycleShift();
  };

  const displayText = data.prefix ? `${data.prefix}${data.shift}` : data.shift;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            "shift-cell relative flex h-full min-h-12 w-full flex-col items-center justify-center rounded-lg font-semibold text-sm transition-transform transition-shadow duration-150 sm:min-h-14 sm:text-base",
            getShiftClass(data.shift),
            !disabled && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
            disabled && "cursor-default",
            animating && "animate-cell-pop"
          )}
        >
          {data.coverageBranch && (
            <span className="absolute left-1.5 top-1.5 rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
              S{data.coverageBranch}
            </span>
          )}
          <span className="text-base font-bold sm:text-lg">{displayText}</span>
          {data.time && (
            <span className="text-[10px] font-normal opacity-70 mt-0.5">{data.time}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {SHIFT_LABELS[data.shift]}
        {data.time && ` · ${data.time}`}
      </TooltipContent>
    </Tooltip>
  );
}
