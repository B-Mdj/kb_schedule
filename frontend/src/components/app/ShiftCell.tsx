"use client";

import { useState, useCallback, useEffect } from "react";
import { SHIFT_LABELS, getShiftClass, CellData } from "@/lib/schedule-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ShiftCellProps {
  data: CellData;
  options?: CellData[];
  onChange: (nextCell: CellData) => void;
  disabled?: boolean;
}

function getCellOptionKey(value: CellData) {
  return `${value.prefix ?? ""}|${value.shift}|${value.coverageBranch ?? ""}`;
}

export function ShiftCell({ data, options = [data], onChange, disabled = false }: ShiftCellProps) {
  const [animating, setAnimating] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateTooltipSupport = () => setShowTooltip(mediaQuery.matches);

    updateTooltipSupport();
    mediaQuery.addEventListener("change", updateTooltipSupport);

    return () => {
      mediaQuery.removeEventListener("change", updateTooltipSupport);
    };
  }, []);

  const cycleShift = useCallback(() => {
    if (options.length === 0) return;

    const currentIndex = options.findIndex((option) => getCellOptionKey(option) === getCellOptionKey(data));
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const next = options[(safeIndex + 1) % options.length] ?? options[0] ?? data;
    setAnimating(true);
    onChange(next);
    setTimeout(() => setAnimating(false), 250);
  }, [data, onChange, options]);

  const handleClick = () => {
    if (disabled) return;
    cycleShift();
  };

  const displayText = data.prefix ? `${data.prefix}${data.shift}` : data.shift;
  const button = (
    <button
      type="button"
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
      <span className="text-base font-bold sm:text-lg">{displayText}</span>
      {data.time && (
        <span className="text-[10px] font-normal opacity-70 mt-0.5">{data.time}</span>
      )}
    </button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {SHIFT_LABELS[data.shift]}
        {data.coverageBranch === 2 && " · 2-р салбар"}
        {data.coverageBranch === 1 && " · 1-р салбар"}
        {data.time && ` · ${data.time}`}
      </TooltipContent>
    </Tooltip>
  );
}
