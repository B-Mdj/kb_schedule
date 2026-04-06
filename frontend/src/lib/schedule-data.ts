export const DAYS = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"] as const;

export const DAYS_FULL = [
  "Даваа",
  "Мягмар",
  "Лхагва",
  "Пүрэв",
  "Баасан",
  "Бямба",
  "Ням",
] as const;

export const SHIFT_ORDER = ["А", "Ө", "О", "Б"] as const;

export type ShiftCode = (typeof SHIFT_ORDER)[number];

export type CellData = {
  shift: ShiftCode;
  prefix?: string;
  time?: string;
  coverageBranch?: 1 | 2;
};

export type Employee = {
  id: string;
  name: string;
  branch: 1 | 2;
  canWorkBranch1?: boolean;
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

export type LegacyDailyRequirement = {
  morning: number;
  evening: number;
};

export type WeekRequirements = DailyRequirement[];

export const SHIFT_LABELS: Record<ShiftCode, string> = {
  А: "Амрах",
  Ө: "Өглөө",
  О: "Орой",
  Б: "Бүтэн",
};

const SHIFT_CLASSES: Record<ShiftCode, string> = {
  А: "bg-slate-100 text-slate-700",
  Ө: "bg-sky-100 text-sky-900",
  О: "bg-amber-100 text-amber-900",
  Б: "bg-emerald-100 text-emerald-900",
};

export const INITIAL_EMPLOYEES: Employee[] = [
  { id: "b1-1", name: "Ану", branch: 1 },
  { id: "b1-2", name: "Бат", branch: 1 },
  { id: "b2-1", name: "Сараа", branch: 2 },
  { id: "b2-2", name: "Төгс", branch: 2 },
];

function createInitialRow(branch: 1 | 2): CellData[] {
  return Array.from({ length: 7 }, () => ({
    shift: "А",
    prefix: branch === 2 ? "19" : undefined,
  }));
}

export function createInitialGrid(employees: Employee[]): ScheduleGrid {
  return Object.fromEntries(
    employees.map((employee) => [employee.id, createInitialRow(employee.branch)])
  );
}

export function normalizeEmployees(employees?: Employee[] | null): Employee[] {
  return (employees ?? []).map((employee) => ({
    ...employee,
    canWorkBranch1: employee.branch === 2 ? Boolean(employee.canWorkBranch1) : false,
  }));
}

export function createDefaultRequirements(): WeekRequirements {
  return Array.from({ length: 7 }, () => ({
    branch1: {
      morning: 2,
      evening: 2,
    },
    branch2: {
      morning: 2,
      evening: 2,
    },
  }));
}

export function normalizeWeekRequirements(
  requirements?: Array<DailyRequirement | LegacyDailyRequirement> | null
): WeekRequirements {
  return Array.from({ length: 7 }, (_, index) => {
    const requirement = requirements?.[index];

    if (
      requirement &&
      "branch1" in requirement &&
      "branch2" in requirement &&
      requirement.branch1 &&
      requirement.branch2
    ) {
      return {
        branch1: {
          morning: Math.max(0, Number(requirement.branch1.morning) || 0),
          evening: Math.max(0, Number(requirement.branch1.evening) || 0),
        },
        branch2: {
          morning: Math.max(0, Number(requirement.branch2.morning) || 0),
          evening: Math.max(0, Number(requirement.branch2.evening) || 0),
        },
      };
    }

    if (requirement && "morning" in requirement && "evening" in requirement) {
      return {
        branch1: {
          morning: Math.max(0, Number(requirement.morning) || 0),
          evening: Math.max(0, Number(requirement.evening) || 0),
        },
        branch2: {
          morning: Math.max(0, Number(requirement.morning) || 0),
          evening: Math.max(0, Number(requirement.evening) || 0),
        },
      };
    }

    return createDefaultRequirements()[index];
  });
}

export function countShifts(cells: CellData[]): number {
  return cells.reduce((total, cell) => {
    if (cell.shift === "А") return total;
    if (cell.shift === "Б") return total + 2;
    return total + 1;
  }, 0);
}

export function countsTowardShift(cell: CellData, shiftType: "morning" | "evening") {
  const morningShift = SHIFT_ORDER[1];
  const eveningShift = SHIFT_ORDER[2];
  const fullDayShift = SHIFT_ORDER[3];

  if (shiftType === "morning") {
    return cell.shift === morningShift || cell.shift === fullDayShift;
  }

  return cell.shift === eveningShift || cell.shift === fullDayShift;
}

export function getShiftClass(shift: ShiftCode): string {
  return SHIFT_CLASSES[shift];
}
