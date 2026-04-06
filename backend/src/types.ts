export type ShiftCode = "А" | "Ө" | "О" | "Б";

export type UploadedImagePayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type ParseScheduleImagesRequest = {
  images?: UploadedImagePayload[];
  weekKey?: string;
  weekStartIso?: string;
  weekEndIso?: string;
  dayLabels?: string[];
  employeeNames?: string[];
  dailyRequirements?: Array<{
    date: string;
    morning: number;
    evening: number;
  }>;
  allowFallbackAssignment?: boolean;
};

export type ParsedScheduleEntry = {
  employeeName: string;
  branch: 1 | 2 | null;
  shifts: ShiftCode[];
  notes: string;
  confidence: "high" | "medium" | "low";
};

export type ParsedSchedulePayload = {
  entries: ParsedScheduleEntry[];
};

export type Employee = {
  id: string;
  name: string;
  branch: 1 | 2;
};

export type CellData = {
  shift: ShiftCode;
  prefix?: string;
  time?: string;
};

export type ScheduleGrid = Record<string, CellData[]>;

export type WeekSchedule = {
  employees: Employee[];
  grid: ScheduleGrid;
  locked: boolean;
};

export type StoredSchedules = {
  schedulesByWeek: Record<string, WeekSchedule>;
};
