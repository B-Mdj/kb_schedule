import { CellData, Employee, ScheduleGrid } from "@/lib/schedule-data";

export type ParsedScheduleEntry = {
  employeeName: string;
  branch: 1 | 2 | null;
  shifts: CellData["shift"][];
  times?: Array<string | undefined>;
  coverageBranches?: Array<1 | 2 | undefined>;
  notes?: string;
  confidence?: "high" | "medium" | "low";
  sourceImageName?: string;
};

export type ParsedSchedulePayload = {
  entries: ParsedScheduleEntry[];
};

export type UploadImagePayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function createWeekRow(
  branch: 1 | 2,
  shifts: ParsedScheduleEntry["shifts"],
  times?: ParsedScheduleEntry["times"],
  coverageBranches?: ParsedScheduleEntry["coverageBranches"]
) {
  return Array.from({ length: 7 }, (_, index) => ({
    shift: shifts[index] ?? "А",
    prefix: branch === 2 || coverageBranches?.[index] === 2 ? "19" : undefined,
    time: times?.[index],
    coverageBranch: coverageBranches?.[index],
  }));
}

export function applyParsedEntriesToSchedule(
  employees: Employee[],
  grid: ScheduleGrid,
  entries: ParsedScheduleEntry[]
) {
  const nextEmployees = [...employees];
  const nextGrid: ScheduleGrid = { ...grid };
  const usedEmployeeIds = new Set<string>();
  let updatedCount = 0;
  let reviewCount = 0;

  entries.forEach((entry) => {
    const normalizedTarget = normalizeName(entry.employeeName);
    if (!normalizedTarget || entry.shifts.length === 0) {
      return;
    }

    const matchedEmployee = nextEmployees.find(
      (employee) =>
        !usedEmployeeIds.has(employee.id) &&
        normalizeName(employee.name) === normalizedTarget
    );

    if (matchedEmployee) {
      nextGrid[matchedEmployee.id] = createWeekRow(
        matchedEmployee.branch,
        entry.shifts,
        entry.times,
        entry.coverageBranches
      );
      usedEmployeeIds.add(matchedEmployee.id);
      updatedCount += 1;
      return;
    }

    const branch = entry.branch ?? 1;
    const reusableEmployee = nextEmployees.find(
      (employee) =>
        !usedEmployeeIds.has(employee.id) &&
        (entry.branch == null || employee.branch === branch)
    );

    if (reusableEmployee) {
      reusableEmployee.name = entry.employeeName.trim();
      if (entry.branch != null) {
        reusableEmployee.branch = branch;
      }
      nextGrid[reusableEmployee.id] = createWeekRow(
        reusableEmployee.branch,
        entry.shifts,
        entry.times,
        entry.coverageBranches
      );
      usedEmployeeIds.add(reusableEmployee.id);
      updatedCount += 1;
      return;
    }
    reviewCount += 1;
  });

  return {
    employees: nextEmployees,
    grid: nextGrid,
    updatedCount,
    reviewCount,
  };
}

export function extractJsonFromModelText(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty model response");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}
