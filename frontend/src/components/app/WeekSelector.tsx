"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addDays } from "date-fns";

interface Props {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export function WeekSelector({ weekStart, onPrev, onNext, disabled = false }: Props) {
  const weekEnd = addDays(weekStart, 6);
  const label = `${format(weekStart, "M.dd")} – ${format(weekEnd, "M.dd")}`;

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onPrev} className="h-8 w-8" disabled={disabled}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm font-semibold min-w-27.5 text-center">{label}</span>
      <Button variant="ghost" size="icon" onClick={onNext} className="h-8 w-8" disabled={disabled}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
