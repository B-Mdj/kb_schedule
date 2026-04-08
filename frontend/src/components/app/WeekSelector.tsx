"use client";

import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export function WeekSelector({ weekStart, onPrev, onNext, disabled = false }: Props) {
  const weekEnd = addDays(weekStart, 6);
  const label = `${format(weekStart, "M.dd")} - ${format(weekEnd, "M.dd")}`;

  return (
    <div className="flex w-full min-w-0 max-w-[19rem] items-center justify-between gap-1 rounded-full border border-border/70 bg-background/80 px-1.5 py-1 sm:w-auto sm:max-w-none sm:shrink-0 sm:justify-start sm:gap-2">
      <Button variant="ghost" size="icon" onClick={onPrev} className="h-8 w-8 shrink-0" disabled={disabled}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-0 flex-1 whitespace-nowrap px-2 text-center text-sm font-semibold tabular-nums">
        {label}
      </span>
      <Button variant="ghost" size="icon" onClick={onNext} className="h-8 w-8 shrink-0" disabled={disabled}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
