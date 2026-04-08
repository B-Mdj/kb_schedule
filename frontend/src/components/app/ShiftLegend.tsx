"use client";

import { SHIFT_LABELS, SHIFT_ORDER, getShiftClass } from "@/lib/schedule-data";

export function ShiftLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {SHIFT_ORDER.map((code) => (
        <div key={code} className="flex items-center gap-1.5">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${getShiftClass(code)}`}>
            {code}
          </div>
          <span className="text-xs text-muted-foreground">{SHIFT_LABELS[code]}</span>
        </div>
      ))}
    </div>
  );
}
