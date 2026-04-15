import "server-only";

import {
  DailyRequirementInput,
  EmployeeDirectoryEntry,
  ParseScheduleImagesRequest,
  WeekSchedule,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isWeekSchedulePayload(value: unknown): value is WeekSchedule {
  return isRecord(value);
}

function normalizeDayLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmployeeNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmployeeDirectory(value: unknown): EmployeeDirectoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is EmployeeDirectoryEntry => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.name !== "string") return false;
      return item.branch === 1 || item.branch === 2;
    })
    .map((item) => ({
      name: item.name.trim(),
      branch: item.branch,
      canWorkBranch1: Boolean(item.canWorkBranch1),
      canWorkBranch2: Boolean(item.canWorkBranch2),
    }))
    .filter((item) => item.name.length > 0);
}

function normalizeDailyRequirements(value: unknown, dayLabels: string[]): DailyRequirementInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((item): item is DailyRequirementInput => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.date !== "string") return false;
      return Boolean(item.branch1 && item.branch2);
    })
    .map((item) => ({
      date: item.date.trim(),
      branch1: {
        morning: Math.max(0, Number(item.branch1?.morning ?? 0) || 0),
        evening: Math.max(0, Number(item.branch1?.evening ?? 0) || 0),
      },
      branch2: {
        morning: Math.max(0, Number(item.branch2?.morning ?? 0) || 0),
        evening: Math.max(0, Number(item.branch2?.evening ?? 0) || 0),
      },
    }))
    .filter((item) => item.date.length > 0);

  if (!dayLabels.length) {
    return normalized;
  }

  const allowedDates = new Set(dayLabels);
  return normalized.filter((item) => allowedDates.has(item.date));
}

export function normalizeParseRequest(body: ParseScheduleImagesRequest | undefined) {
  const dayLabels = normalizeDayLabels(body?.dayLabels);
  const employeeDirectory = normalizeEmployeeDirectory(body?.employeeDirectory);
  const employeeNames = normalizeEmployeeNames(body?.employeeNames);
  const effectiveEmployeeNames = employeeNames.length
    ? employeeNames
    : employeeDirectory.map((employee) => employee.name);

  return {
    weekKey: typeof body?.weekKey === "string" ? body.weekKey.trim() : undefined,
    weekStartIso: typeof body?.weekStartIso === "string" ? body.weekStartIso.trim() : undefined,
    weekEndIso: typeof body?.weekEndIso === "string" ? body.weekEndIso.trim() : undefined,
    dayLabels,
    employeeNames: effectiveEmployeeNames,
    employeeDirectory,
    dailyRequirements: normalizeDailyRequirements(body?.dailyRequirements, dayLabels),
    allowFallbackAssignment: false,
    aiInstructions: typeof body?.aiInstructions === "string" ? body.aiInstructions.trim() : "",
  };
}
