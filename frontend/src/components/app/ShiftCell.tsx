"use client";

import { useState, useCallback, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { SHIFT_LABELS, getShiftClass, CellData } from "@/lib/schedule-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
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

function getDisplayText(data: CellData) {
  const shiftText = data.prefix ? `${data.prefix}${data.shift}` : data.shift;
  return data.time ? `${shiftText}(${data.time})` : shiftText;
}

export function ShiftCell({ data, options = [data], onChange, disabled = false }: ShiftCellProps) {
  const [animating, setAnimating] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [draftTime, setDraftTime] = useState(data.time ?? "");
  const [touchLongPressTriggered, setTouchLongPressTriggered] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);

  useEffect(() => {
    if (!isEditingTime) {
      setDraftTime(data.time ?? "");
    }
  }, [data.time, isEditingTime]);

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
    if (disabled || touchLongPressTriggered) {
      if (touchLongPressTriggered) {
        setTouchLongPressTriggered(false);
      }
      return;
    }
    cycleShift();
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsEditingTime(true);
  };

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || event.pointerType !== "touch") return;

    const timer = window.setTimeout(() => {
      setTouchLongPressTriggered(true);
      setIsEditingTime(true);
      setLongPressTimer(null);
    }, 450);

    setLongPressTimer(timer);
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
  };

  const commitTime = useCallback(() => {
    const normalized = draftTime.trim();
    onChange({
      ...data,
      time: normalized || undefined,
    });
    setIsEditingTime(false);
  }, [data, draftTime, onChange]);

  const displayText = getDisplayText(data);
  if (isEditingTime && !disabled) {
    return (
      <div
        className={cn(
          "flex h-full min-h-12 w-full items-center justify-center rounded-lg p-1 sm:min-h-14",
          getShiftClass(data.shift)
        )}
      >
        <Input
          autoFocus
          value={draftTime}
          onChange={(event) => setDraftTime(event.target.value)}
          onBlur={commitTime}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitTime();
            }
            if (event.key === "Escape") {
              setDraftTime(data.time ?? "");
              setIsEditingTime(false);
            }
          }}
          placeholder="11:00"
          className="h-7 border-white/50 bg-white/85 px-2 text-center text-xs font-semibold text-foreground"
        />
      </div>
    );
  }

  const button = (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      disabled={disabled}
      className={cn(
        "shift-cell relative flex h-full min-h-12 w-full flex-col items-center justify-center rounded-lg px-1 font-semibold text-sm transition-transform transition-shadow duration-150 sm:min-h-14 sm:text-base",
        getShiftClass(data.shift),
        !disabled && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        disabled && "cursor-default",
        animating && "animate-cell-pop"
      )}
    >
      <span className="text-center text-[11px] font-bold leading-tight sm:text-sm">{displayText}</span>
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
