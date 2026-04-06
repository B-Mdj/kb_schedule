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
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-1.5 py-1">
      <Button variant="ghost" size="icon" onClick={onPrev} className="h-8 w-8" disabled={disabled}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-28 whitespace-nowrap text-center text-sm font-semibold tabular-nums">
        {label}
      </span>
      <Button variant="ghost" size="icon" onClick={onNext} className="h-8 w-8" disabled={disabled}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
