"use client";

import { SHIFT_LABELS, SHIFT_ORDER, getShiftClass } from "@/lib/schedule-data";

export function ShiftLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {SHIFT_ORDER.map((code) => (
        <div key={code} className="flex items-center gap-1.5">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${getShiftClass(code)}`}>
            {code}
          </div>
          <span className="text-xs text-muted-foreground">{SHIFT_LABELS[code]}</span>
        </div>
      ))}
    </div>
  );
}
