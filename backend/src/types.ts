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
  employeeDirectory?: Array<{
    name: string;
    branch: 1 | 2;
    canWorkBranch1?: boolean;
    canWorkBranch2?: boolean;
  }>;
  dailyRequirements?: Array<{
    date: string;
    branch1: {
      morning: number;
      evening: number;
    };
    branch2: {
      morning: number;
      evening: number;
    };
  }>;
  allowFallbackAssignment?: boolean;
};

export type ParsedScheduleEntry = {
  employeeName: string;
  branch: 1 | 2 | null;
  shifts: ShiftCode[];
  times?: Array<string | undefined>;
  coverageBranches?: Array<1 | 2 | undefined>;
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
  canWorkBranch1?: boolean;
  canWorkBranch2?: boolean;
};

export type CellData = {
  shift: ShiftCode;
  prefix?: string;
  time?: string;
  coverageBranch?: 1 | 2;
};

export type ScheduleGrid = Record<string, CellData[]>;

export type BranchRequirement = {
  morning: number;
  evening: number;
};

export type DailyRequirement = {
  branch1: BranchRequirement;
  branch2: BranchRequirement;
};

export type WeekSchedule = {
  employees: Employee[];
  grid: ScheduleGrid;
  requirements?: DailyRequirement[];
  locked: boolean;
};

export type StoredSchedules = {
  schedulesByWeek: Record<string, WeekSchedule>;
};
