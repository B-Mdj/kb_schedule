import "server-only";

import { ParsedSchedulePayload, UploadedImagePayload } from "./types";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const REST_SHIFT = "\u0410";
const MORNING_SHIFT = "\u04E8";
const EVENING_SHIFT = "\u041E";
const FULL_DAY_SHIFT = "\u0411";

const NARANSOLONGO = "\u041D\u0430\u0440\u0430\u043D\u0441\u043E\u043B\u043E\u043D\u0433\u043E";
const MYAGMARNOROV = "\u041C\u044F\u0433\u043C\u0430\u0440\u043D\u043E\u0440\u043E\u0432";
const MYAGMARDORJ = "\u041C\u044F\u0433\u043C\u0430\u0440\u0434\u043E\u0440\u0436";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type RequestShift = "morning" | "evening" | "full_day" | "rest";

type RequestDay = {
  shift: RequestShift;
  start_time?: string | null;
};

type ExtractedRequest = {
  employee_name: string;
  matched_from: string;
  confidence: number;
  branch?: "1" | "2" | "null";
  days: Record<string, RequestDay>;
};

type ExtractionResult = {
  requests?: ExtractedRequest[];
  review?: Array<{
    type: string;
    raw: string;
    possible?: string[];
  }>;
};

type SchedulingShift =
  | typeof REST_SHIFT
  | typeof MORNING_SHIFT
  | typeof EVENING_SHIFT
  | typeof FULL_DAY_SHIFT;

type SchedulingResult = {
  assignments?: Array<{
    employee_name?: string;
    date?: string;
    shift?: SchedulingShift;
    start_time?: string | null;
    coverage_branch?: 1 | 2 | "1" | "2" | null;
  }>;
  summary?: {
    total_assigned_per_employee?: Record<string, number>;
  };
  review?: Array<{
    type?: string;
    message?: string;
    employee_name?: string;
    date?: string;
  }>;
};

type FinalAssignment = {
  employee_name: string;
  date: string;
  shift: SchedulingShift;
  start_time: string | null;
  coverage_branch: 1 | 2 | null;
};

function extractGeminiText(response: GeminiResponse) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = Array.isArray(candidates[0]?.content?.parts)
    ? candidates[0].content?.parts ?? []
    : [];

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function extractJsonFromModelText(rawText: string) {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function parseJsonSafely<T>(rawText: string): T {
  const normalized = extractJsonFromModelText(rawText)
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .trim();

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = normalized.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced) as T;
    }
    throw new Error("Model returned malformed JSON.");
  }
}

function normalizeBranch(value: unknown): 1 | 2 | null {
  if (value === 1 || value === 2) return value;
  if (value === "1") return 1;
  if (value === "2") return 2;
  return null;
}

function normalizeStartTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/[.]/g, ":")
    .replace(/\s+/g, "")
    .replace(/[сc]$/i, "");

  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const hourOnlyMatch = normalized.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hours = Number(hourOnlyMatch[1]);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, "0")}:00`;
    }
  }

  return trimmed;
}

async function callGeminiJson<T>({
  apiKey,
  prompt,
  responseSchema,
  imageParts = [],
}: {
  apiKey: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  imageParts?: Array<Record<string, unknown>>;
}): Promise<T> {
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const result = (await response.json()) as GeminiResponse;
  const outputText = extractGeminiText(result);

  try {
    return parseJsonSafely<T>(outputText);
  } catch (error) {
    const preview = outputText.slice(0, 500);
    throw new Error(
      error instanceof Error
        ? `${error.message} Response preview: ${preview}`
        : `Model returned malformed JSON. Response preview: ${preview}`
    );
  }
}

function buildImageParts(images: UploadedImagePayload[]) {
  return images.map((image) => {
    const [, base64Data = ""] = String(image.dataUrl || "").split(",", 2);

    return {
      inline_data: {
        mime_type: image.mimeType || "image/png",
        data: base64Data,
      },
    };
  });
}

function normalizeExtractionRequests(
  requests: ExtractedRequest[] | undefined,
  dayLabels: string[]
) {
  return Array.isArray(requests)
    ? requests.map((request) => ({
        employee_name: request.employee_name,
        matched_from: request.matched_from,
        confidence:
          typeof request.confidence === "number"
            ? Math.max(0, Math.min(1, request.confidence))
            : 0,
        branch: request.branch === "1" || request.branch === "2" ? request.branch : "null",
        days: Object.fromEntries(
          dayLabels.map((day) => {
            const value = request.days?.[day];
            return [
              day,
              {
                shift: value?.shift ?? "rest",
                start_time: value?.start_time ?? null,
              },
            ];
          })
        ) as Record<string, RequestDay>,
      }))
    : [];
}

function summarizeRequestedShiftCounts(requests: Array<{ employee_name: string; days: Record<string, RequestDay> }>) {
  return Object.fromEntries(
    requests.map((request) => {
      const total = Object.values(request.days ?? {}).reduce((count, day) => {
        if (day.shift === "full_day") return count + 2;
        if (day.shift === "morning" || day.shift === "evening") return count + 1;
        return count;
      }, 0);

      return [request.employee_name, total];
    })
  );
}

function normalizeInstructionText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getInstructionMentionedEmployees(
  aiInstructions: string | undefined,
  employeeDirectory: Array<{ name: string }>
) {
  const normalizedInstructions = normalizeInstructionText(aiInstructions ?? "");
  if (!normalizedInstructions) {
    return new Set<string>();
  }

  return new Set(
    employeeDirectory
      .map((employee) => employee.name)
      .filter((name) => normalizedInstructions.includes(normalizeInstructionText(name)))
  );
}

function countsToward(shift: SchedulingShift, shiftType: "morning" | "evening") {
  if (shiftType === "morning") {
    return shift === MORNING_SHIFT || shift === FULL_DAY_SHIFT;
  }

  return shift === EVENING_SHIFT || shift === FULL_DAY_SHIFT;
}

function adjustAssignmentForOverage(
  assignment: FinalAssignment,
  shiftType: "morning" | "evening"
): FinalAssignment {
  if (assignment.shift === FULL_DAY_SHIFT) {
    return {
      ...assignment,
      shift: shiftType === "morning" ? EVENING_SHIFT : MORNING_SHIFT,
    };
  }

  return {
    ...assignment,
    shift: REST_SHIFT,
    start_time: null,
    coverage_branch: null,
  };
}

function enforceStrictStaffingRequirements(
  assignments: FinalAssignment[],
  options: {
    dayLabels: string[];
    employeeDirectory: Array<{
      name: string;
      branch: 1 | 2;
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
    extractedRequests: Array<{
      employee_name: string;
      days: Record<string, RequestDay>;
    }>;
    requestedShiftCounts: Record<string, number>;
    aiInstructions?: string;
  }
) {
  const requirementsByDate = new Map(
    (options.dailyRequirements ?? []).map((item) => [item.date, item])
  );
  const branchByEmployee = new Map(
    options.employeeDirectory.map((employee) => [employee.name, employee.branch])
  );
  const requestByEmployee = new Map(
    options.extractedRequests.map((request) => [request.employee_name, request.days])
  );
  const instructionMentionedEmployees = getInstructionMentionedEmployees(
    options.aiInstructions,
    options.employeeDirectory
  );
  const nextAssignments = assignments.map((assignment) => ({ ...assignment }));

  const buildAssignedCounts = () => {
    const counts = new Map<string, number>();
    nextAssignments.forEach((assignment) => {
      const increment =
        assignment.shift === FULL_DAY_SHIFT
          ? 2
          : assignment.shift === MORNING_SHIFT || assignment.shift === EVENING_SHIFT
            ? 1
            : 0;
      counts.set(assignment.employee_name, (counts.get(assignment.employee_name) ?? 0) + increment);
    });
    return counts;
  };

  for (const day of options.dayLabels) {
    const requirement = requirementsByDate.get(day);
    if (!requirement) {
      continue;
    }

    for (const branch of [1, 2] as const) {
      for (const shiftType of ["morning", "evening"] as const) {
        const requiredCount =
          branch === 1 ? requirement.branch1[shiftType] : requirement.branch2[shiftType];

        while (true) {
          const matchingIndexes = nextAssignments
            .map((assignment, index) => ({ assignment, index }))
            .filter(({ assignment }) => {
              if (assignment.date !== day || !countsToward(assignment.shift, shiftType)) {
                return false;
              }

              const effectiveBranch =
                assignment.coverage_branch ?? branchByEmployee.get(assignment.employee_name) ?? branch;
              return effectiveBranch === branch;
            });

          if (matchingIndexes.length <= requiredCount) {
            break;
          }

          const assignedCounts = buildAssignedCounts();
          matchingIndexes.sort((left, right) => {
            const leftRequest = requestByEmployee.get(left.assignment.employee_name)?.[day];
            const rightRequest = requestByEmployee.get(right.assignment.employee_name)?.[day];
            const leftRequested =
              leftRequest &&
              ((shiftType === "morning" &&
                (leftRequest.shift === "morning" || leftRequest.shift === "full_day")) ||
                (shiftType === "evening" &&
                  (leftRequest.shift === "evening" || leftRequest.shift === "full_day")));
            const rightRequested =
              rightRequest &&
              ((shiftType === "morning" &&
                (rightRequest.shift === "morning" || rightRequest.shift === "full_day")) ||
                (shiftType === "evening" &&
                  (rightRequest.shift === "evening" || rightRequest.shift === "full_day")));

            if (leftRequested !== rightRequested) {
              return leftRequested ? 1 : -1;
            }

            const leftMentioned = instructionMentionedEmployees.has(left.assignment.employee_name);
            const rightMentioned = instructionMentionedEmployees.has(right.assignment.employee_name);
            if (leftMentioned !== rightMentioned) {
              return leftMentioned ? 1 : -1;
            }

            const leftRequestedTotal = options.requestedShiftCounts[left.assignment.employee_name] ?? 0;
            const rightRequestedTotal = options.requestedShiftCounts[right.assignment.employee_name] ?? 0;
            if (leftRequestedTotal !== rightRequestedTotal) {
              return rightRequestedTotal - leftRequestedTotal;
            }

            const leftAssigned = assignedCounts.get(left.assignment.employee_name) ?? 0;
            const rightAssigned = assignedCounts.get(right.assignment.employee_name) ?? 0;
            return rightAssigned - leftAssigned;
          });

          const candidate = matchingIndexes[0];
          nextAssignments[candidate.index] = adjustAssignmentForOverage(candidate.assignment, shiftType);
        }
      }
    }
  }

  return nextAssignments;
}

function buildEmptyScheduleMaps(employeeNames: string[], dayLabels: string[]) {
  return {
    finalSchedule: Object.fromEntries(
      employeeNames.map((name) => [name, Object.fromEntries(dayLabels.map((day) => [day, REST_SHIFT]))])
    ) as Record<string, Record<string, SchedulingShift>>,
    startTimes: Object.fromEntries(
      employeeNames.map((name) => [name, Object.fromEntries(dayLabels.map((day) => [day, null]))])
    ) as Record<string, Record<string, string | null>>,
    coverageBranches: Object.fromEntries(
      employeeNames.map((name) => [name, Object.fromEntries(dayLabels.map((day) => [day, null]))])
    ) as Record<string, Record<string, 1 | 2 | null>>,
  };
}

export async function parseScheduleImages(
  images: UploadedImagePayload[],
  options: {
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
    aiInstructions?: string;
  } = {}
): Promise<ParsedSchedulePayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const dayLabels = options.dayLabels ?? [];
  const employeeDirectory = options.employeeDirectory ?? [];
  const imageParts = buildImageParts(images);

  const extractionPrompt = [
    "You are an AI assistant that reads Facebook Messenger screenshots and extracts staff shift requests for a specific target week.",
    "Your ONLY job is to extract what each person requested.",
    "Do NOT create a final schedule.",
    "Do NOT apply staffing limits.",
    "Do NOT remove or adjust shifts.",
    options.weekStartIso ? `target_week_start: ${options.weekStartIso}` : "",
    options.weekEndIso ? `target_week_end: ${options.weekEndIso}` : "",
    dayLabels.length ? `target_week_dates: ${dayLabels.join(", ")}` : "",
    options.employeeNames?.length ? `list_of_employees: ${options.employeeNames.join(", ")}` : "",
    employeeDirectory.length
      ? `employee_directory_with_branches: ${employeeDirectory
          .map(
            (employee) =>
              `${employee.name} (branch ${employee.branch}, can_work_branch1: ${employee.canWorkBranch1 ? "true" : "false"}, can_work_branch2: ${employee.canWorkBranch2 ? "true" : "false"})`
          )
          .join(", ")}`
      : "",
    options.aiInstructions?.trim()
      ? `planner_notes_from_manager: ${options.aiInstructions.trim()}`
      : "",
    "SHIFT TYPES",
    `- "\u04E9\u0433\u043B\u04E9\u04E9", "\u04E9\u0433", "\u04E9\u0433\u043B", "${MORNING_SHIFT}", "\u04E9" -> "morning"`,
    `- "\u043E\u0440\u043E\u0439", "\u043E\u0440", "${EVENING_SHIFT}", "\u043E" -> "evening"`,
    '- "\u0431\u04AF\u0442\u044D\u043D" -> "full_day"',
    '- "amrah" or missing -> "rest"',
    "CRITICAL CHARACTER RULE",
    `Cyrillic "${MORNING_SHIFT}/\u04E9" and Cyrillic "${EVENING_SHIFT}/\u043E" are different letters.`,
    `If the screenshot shows "${MORNING_SHIFT}" or "\u04E9", that is ALWAYS morning, never evening.`,
    `Only "${EVENING_SHIFT}" or "\u043E" means evening.`,
    `Do not normalize or collapse "${MORNING_SHIFT}" into "${EVENING_SHIFT}".`,
    'Numeric shorthand: "-4" -> "evening", "-9" -> "full_day".',
    "IMPORTANT: full_day means the person can work both morning and evening, but do NOT split it here.",
    "If someone says they can start later, such as 11:00 or 13:00, keep the requested shift type and capture the late start in start_time using 24-hour HH:mm format.",
    'Examples: "бүтэн-11с", "Б 11с", "Бүтэн 11:00-аас" all mean shift="full_day" with start_time="11:00".',
    'Examples: "өглөө 13:00-аас" means shift="morning" with start_time="13:00"; "орой 15с" means shift="evening" with start_time="15:00".',
    "Late-start times can apply to morning or evening shifts. Do not invent a time unless the message states one.",
    "DATE RULES",
    "Extract only dates that fall within the target week.",
    "If one shift word appears after a list of dates, apply that shift to all those dates.",
    "If only day numbers are written, resolve them within the target week.",
    'Examples: "1buten" = Monday full_day, "2uglu" = Tuesday morning, "3oroi" = Wednesday evening.',
    'Common shorthand examples: "1dh" = Monday, "2dh" = Tuesday, "3dh" = Wednesday, "4dh" = Thursday, "5dh" = Friday.',
    'Common Mongolian chat shorthand can also name weekdays directly, for example "hgsnd" or similar Saturday shorthand means Saturday.',
    'Example: "1dh Б 2dh о hgsnd Б" means Monday full_day, Tuesday evening, Saturday full_day.',
    'If a message alternates day tokens and shift tokens, pair each day token with the shift token that immediately follows it.',
    'If a date is not mentioned, mark it as "rest".',
    "NAME MATCHING",
    "Messenger names may be in English letters while schedule names are Mongolian.",
    "Match sender to the closest existing employee name.",
    `Known nickname mapping: "Miga" should match "${MYAGMARNOROV}", not "${MYAGMARDORJ}".`,
    `Known nickname mapping: "Migaman" should match "${MYAGMARNOROV}", not "${MYAGMARDORJ}".`,
    "The exact employee label in the grid is the source of truth.",
    "If two employees share the same base name, use initials, suffixes, branch info, or any distinguishing text already present in the grid to keep them separate.",
    "Treat initials added in the grid as part of the employee identity and preserve them exactly in employee_name.",
    "Do NOT collapse two different grid names into one person just because the base name looks the same.",
    "MUST match to an existing employee and NEVER create a new employee.",
    "If unsure which duplicate-name employee it is, flag for review instead of guessing.",
    "MESSAGE LOGIC",
    "Later messages override earlier ones if they conflict.",
    "Combine multiple messages from the same sender.",
    "Handle typos and mixed language.",
    "If planner_notes_from_manager describes usual patterns, use it only to interpret ambiguous screenshot text during extraction.",
    "If planner_notes_from_manager says someone usually has a constant shift, do NOT create that shift during extraction unless the screenshots also support it.",
    "If planner_notes_from_manager mentions a late-start morning such as 'Tuesday morning 10:30', treat that as a flexible morning/full-day preference with start_time 10:30 unless the manager explicitly says morning only.",
    "OUTPUT FORMAT",
    "Each day must be an object with shift and start_time. Use start_time: null when no time was specified.",
    `Return JSON only in the shape: {"requests":[{"employee_name":"${NARANSOLONGO}","matched_from":"Naso Ily","confidence":0.9,"branch":"1","days":{"2026-04-06":{"shift":"rest","start_time":null}}}],"review":[{"type":"ambiguous_name","raw":"Miga","possible":["${MYAGMARNOROV}"]}]}.`,
    "STRICT RULES",
    "Do NOT assign shifts beyond what the user requested.",
    "Do NOT optimize schedule.",
    "Do NOT enforce staffing counts.",
    "Always fill all 7 days with rest if missing.",
    "Be robust to messy, informal input.",
  ]
    .filter(Boolean)
    .join("\n");

  const extractionSchema = {
    type: "OBJECT",
    properties: {
      requests: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            employee_name: { type: "STRING" },
            matched_from: { type: "STRING" },
            confidence: { type: "NUMBER" },
            branch: { type: "STRING", enum: ["1", "2", "null"] },
            days: {
              type: "OBJECT",
              properties: Object.fromEntries(
                dayLabels.map((day) => [
                  day,
                  {
                    type: "OBJECT",
                    properties: {
                      shift: {
                        type: "STRING",
                        enum: ["morning", "evening", "full_day", "rest"],
                      },
                      start_time: { type: "STRING", nullable: true },
                    },
                    required: ["shift", "start_time"],
                  },
                ])
              ),
              required: dayLabels,
            },
          },
          required: ["employee_name", "matched_from", "confidence", "branch", "days"],
        },
      },
      review: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            raw: { type: "STRING" },
            possible: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["type", "raw"],
        },
      },
    },
    required: ["requests", "review"],
  };

  const extracted = await callGeminiJson<ExtractionResult>({
    apiKey,
    prompt: extractionPrompt,
    responseSchema: extractionSchema,
    imageParts,
  });

  const normalizedRequests = normalizeExtractionRequests(extracted.requests, dayLabels);
  const requestedShiftCounts = summarizeRequestedShiftCounts(normalizedRequests);
  const branchByName = new Map(employeeDirectory.map((employee) => [employee.name, employee.branch]));

  const schedulerPrompt = [
    "You are an AI scheduling assistant.",
    "Your job is to convert staff shift requests into a final weekly schedule.",
    "You MUST follow staffing requirements and fairness rules.",
    options.weekStartIso && options.weekEndIso
      ? `target_week: ${options.weekStartIso} to ${options.weekEndIso}`
      : "",
    dayLabels.length ? `target_week_dates: ${dayLabels.join(", ")}` : "",
    employeeDirectory.length
      ? `employees: ${employeeDirectory
          .map(
            (employee) =>
              `${employee.name} (branch ${employee.branch}, can_work_branch1: ${employee.canWorkBranch1 ? "true" : "false"}, can_work_branch2: ${employee.canWorkBranch2 ? "true" : "false"})`
          )
          .join(", ")}`
      : options.employeeNames?.length
        ? `employees: ${options.employeeNames.join(", ")}`
        : "",
    options.aiInstructions?.trim()
      ? `planner_notes_from_manager: ${options.aiInstructions.trim()}`
      : "",
    `allow_assignment_without_request: ${options.allowFallbackAssignment ? "true" : "false"}`,
    `extracted_requests: ${JSON.stringify({
      requests: normalizedRequests,
      review: extracted.review ?? [],
    })}`,
    `requested_shift_totals_from_chat: ${JSON.stringify(requestedShiftCounts)}`,
    `staffing_requirements: ${JSON.stringify(
      Object.fromEntries(
        (options.dailyRequirements ?? []).map((item) => [
          item.date,
          {
            branch1: {
              morning_required: item.branch1.morning,
              evening_required: item.branch1.evening,
            },
            branch2: {
              morning_required: item.branch2.morning,
              evening_required: item.branch2.evening,
            },
          },
        ])
      )
    )}`,
    "SHIFT RULES",
    `morning = "${MORNING_SHIFT}"`,
    `evening = "${EVENING_SHIFT}"`,
    `full_day = "${FULL_DAY_SHIFT}"`,
    `rest = "${REST_SHIFT}"`,
    "CRITICAL CHARACTER RULE",
    `Cyrillic "${MORNING_SHIFT}" means morning and must never be converted to "${EVENING_SHIFT}".`,
    `Cyrillic "${EVENING_SHIFT}" means evening.`,
    "IMPORTANT: full_day means the employee can work both shifts.",
    "ONLY assign both if they requested full_day.",
    "Never assign double shift otherwise.",
    "If a request includes a late start time such as 11:00 or 13:00, preserve that time on the final assigned shift for that day.",
    'If the extracted request contains shorthand like "11с", normalize it to "11:00".',
    "Do not invent times. If no time was requested, use null.",
    "CORE GOAL",
    "Create a valid schedule that meets staffing requirements per day, respects requests as much as possible, and distributes shifts fairly.",
    "Use planner_notes_from_manager as manager-provided guidance for recurring shifts, employees who work around others, and people who may not send chat messages.",
    "Treat planner_notes_from_manager as strong fallback scheduling guidance when chat requests are missing, incomplete, or ambiguous.",
    "Interpret manager notes like 'Tuesday morning 10:30' as: the person may be assigned either morning or full_day on Tuesday, but if assigned they should start at 10:30.",
    "Only treat that kind of note as morning-only when the manager explicitly says it must be morning only.",
    "Employee names in extracted_requests are already resolved identities. Preserve them exactly, including initials or other distinguishing suffixes from the grid.",
    "If two employees have the same base name, treat them as different people if their extracted employee_name strings differ.",
    "ASSIGNMENT PRIORITY",
    "1. Prefer employees who requested that shift.",
    "2. If too many people requested shifts for the week, remove or trim shifts from the people with the highest requested_shift_totals_from_chat first.",
    "3. Among tied people, prefer keeping the shifts of people with fewer total assigned shifts that week.",
    "4. Keep distribution balanced across all employees.",
    "5. Avoid overworking the same people.",
    "6. Do NOT assign shifts on days marked as rest.",
    "CONSTRAINTS",
    "The final schedule must strictly respect staffing_requirements. Never exceed the required number of people on any branch/day/shift.",
    "Do NOT exceed required workers per shift.",
    "Do NOT assign shifts to people who did not request unless necessary and allowed.",
    "Do NOT assign both shifts unless full_day.",
    "If planner_notes_from_manager says someone has a constant shift pattern, you may use that as fallback guidance when chat requests are missing or incomplete.",
    "If planner_notes_from_manager says someone usually works around another person, keep that relationship in mind when filling remaining required shifts and prefer schedules that place them alongside that person when feasible.",
    "When explicit chat requests conflict with planner_notes_from_manager, explicit chat requests win unless they would break the staffing requirements.",
    "If planner_notes_from_manager gives a recurring weekly pattern for someone who did not message, prefer that pattern before making arbitrary fallback assignments.",
    "Try to minimize rejected requests.",
    "Use branch-specific staffing requirements.",
    "Branch 1 employees only count toward branch 1.",
    "Branch 2 employees normally count toward branch 2.",
    "If a branch 2 employee has can_work_branch1: true, you may assign them to cover branch 1 on specific days when needed.",
    "When that happens, keep their employee name the same and record coverage_branch as 1 for that date.",
    "If a branch 1 employee has can_work_branch2: true, you may assign them to cover branch 2 on specific days when needed.",
    "When that happens, keep their employee name the same and record coverage_branch as 2 for that date.",
    "STRICT RULES",
    "This is NOT extraction. Do NOT reinterpret raw screenshot text.",
    "Only use the structured requests provided.",
    "Always satisfy staffing requirements first, then optimize fairness.",
    "OUTPUT FORMAT",
    "Return an assignments array with one item per employee per date.",
    "Each assignment item must include employee_name, date, shift, start_time, and coverage_branch.",
    `Return JSON only like {"assignments":[{"employee_name":"${NARANSOLONGO}","date":"2026-04-06","shift":"${REST_SHIFT}","start_time":null,"coverage_branch":null}],"summary":{"total_assigned_per_employee":{"${NARANSOLONGO}":3}},"review":[]}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const schedulerSchema = {
    type: "OBJECT",
    properties: {
      assignments: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            employee_name: { type: "STRING" },
            date: { type: "STRING" },
            shift: {
              type: "STRING",
              enum: [REST_SHIFT, MORNING_SHIFT, EVENING_SHIFT, FULL_DAY_SHIFT],
            },
            start_time: { type: "STRING", nullable: true },
            coverage_branch: { type: "STRING", enum: ["1", "2"], nullable: true },
          },
          required: ["employee_name", "date", "shift", "start_time", "coverage_branch"],
        },
      },
      summary: {
        type: "OBJECT",
        properties: {
          total_assigned_per_employee: {
            type: "OBJECT",
          },
        },
        required: ["total_assigned_per_employee"],
      },
      review: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            message: { type: "STRING" },
            employee_name: { type: "STRING" },
            date: { type: "STRING" },
          },
          required: [],
        },
      },
    },
    required: ["assignments", "summary", "review"],
  };

  const scheduled = await callGeminiJson<SchedulingResult>({
    apiKey,
    prompt: schedulerPrompt,
    responseSchema: schedulerSchema,
  });

  const strictAssignments = enforceStrictStaffingRequirements(
    (scheduled.assignments ?? [])
      .filter(
        (assignment): assignment is Required<Pick<FinalAssignment, "employee_name" | "date" | "shift">> &
          Omit<FinalAssignment, "employee_name" | "date" | "shift"> =>
          typeof assignment.employee_name === "string" &&
          typeof assignment.date === "string" &&
          (assignment.shift === REST_SHIFT ||
            assignment.shift === MORNING_SHIFT ||
            assignment.shift === EVENING_SHIFT ||
            assignment.shift === FULL_DAY_SHIFT)
      )
      .map((assignment) => ({
        employee_name: assignment.employee_name,
        date: assignment.date,
        shift: assignment.shift,
        start_time: normalizeStartTime(assignment.start_time),
        coverage_branch: normalizeBranch(assignment.coverage_branch),
      })),
    {
      dayLabels,
      employeeDirectory,
      dailyRequirements: options.dailyRequirements,
      extractedRequests: normalizedRequests,
      requestedShiftCounts,
      aiInstructions: options.aiInstructions,
    }
  );

  const reviewNotes = [
    ...(extracted.review ?? []).map((item) => `${item.type}: ${item.raw}`),
    ...(scheduled.review ?? []).map((item) => item.message ?? item.type ?? "review"),
  ].filter(Boolean);

  const employeeNames = options.employeeNames ?? employeeDirectory.map((employee) => employee.name);
  const scheduleMaps = buildEmptyScheduleMaps(employeeNames, dayLabels);

  for (const assignment of strictAssignments) {
    const employeeName = assignment.employee_name;
    const day = assignment.date;
    const shift = assignment.shift;

    if (!employeeName || !day || !dayLabels.includes(day)) {
      continue;
    }

    if (!scheduleMaps.finalSchedule[employeeName]) {
      scheduleMaps.finalSchedule[employeeName] = Object.fromEntries(
        dayLabels.map((label) => [label, REST_SHIFT])
      ) as Record<string, SchedulingShift>;
      scheduleMaps.startTimes[employeeName] = Object.fromEntries(
        dayLabels.map((label) => [label, null])
      ) as Record<string, string | null>;
      scheduleMaps.coverageBranches[employeeName] = Object.fromEntries(
        dayLabels.map((label) => [label, null])
      ) as Record<string, 1 | 2 | null>;
    }

    if (
      shift === REST_SHIFT ||
      shift === MORNING_SHIFT ||
      shift === EVENING_SHIFT ||
      shift === FULL_DAY_SHIFT
    ) {
      scheduleMaps.finalSchedule[employeeName][day] = shift;
    }

    scheduleMaps.startTimes[employeeName][day] = assignment.start_time;
    scheduleMaps.coverageBranches[employeeName][day] = assignment.coverage_branch;
  }

  return {
    entries: Object.entries(scheduleMaps.finalSchedule).map(([employeeName, days]) => {
      const extractedRequest = normalizedRequests.find((request) => request.employee_name === employeeName);
      const branch = branchByName.get(employeeName) ?? normalizeBranch(extractedRequest?.branch) ?? null;

      return {
        employeeName,
        times: dayLabels.map((day) => scheduleMaps.startTimes?.[employeeName]?.[day] ?? undefined),
        coverageBranches: dayLabels.map((day) => {
          const value = scheduleMaps.coverageBranches?.[employeeName]?.[day];
          const normalizedCoverageBranch = normalizeBranch(value);
          return normalizedCoverageBranch ?? undefined;
        }),
        branch,
        shifts: dayLabels.map((day) => days?.[day] ?? REST_SHIFT),
        notes: reviewNotes.join(" | ") || "Two-stage AI pipeline completed.",
        confidence:
          extractedRequest && extractedRequest.confidence >= 0.85
            ? "high"
            : extractedRequest && extractedRequest.confidence >= 0.6
              ? "medium"
              : "low",
      };
    }),
  };
}
