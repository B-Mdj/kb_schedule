import { ParsedSchedulePayload, UploadedImagePayload } from "./types";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

type SchedulingResult = {
  start_times?: Record<string, Record<string, string | null>>;
  coverage_branches?: Record<string, Record<string, 1 | 2 | null>>;
  final_schedule?: Record<string, Record<string, "А" | "Ө" | "О" | "Б">>;
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
          parts: [
            { text: prompt },
            ...imageParts,
          ],
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
    options.employeeNames?.length
      ? `list_of_employees: ${options.employeeNames.join(", ")}`
      : "",
    employeeDirectory.length
      ? `employee_directory_with_branches: ${employeeDirectory
          .map(
            (employee) =>
              `${employee.name} (branch ${employee.branch}, can_work_branch1: ${employee.canWorkBranch1 ? "true" : "false"})`
          )
          .join(", ")}`
      : "",
    "SHIFT TYPES",
    '- "өглөө", "ө" -> "morning"',
    '- "орой", "о" -> "evening"',
    '- "бүтэн" -> "full_day"',
    '- "amrah" or missing -> "rest"',
    'Numeric shorthand: "-4" -> "evening", "-9" -> "full_day".',
    "IMPORTANT: full_day means the person can work both morning and evening, but do NOT split it here.",
    "If someone says they can start later, such as 11:00 or 13:00, keep the requested shift type and capture the late start in start_time using 24-hour HH:mm format.",
    "Late-start times can apply to morning or evening shifts. Do not invent a time unless the message states one.",
    "DATE RULES",
    "Extract only dates that fall within the target week.",
    "If one shift word appears after a list of dates, apply that shift to all those dates.",
    "If only day numbers are written, resolve them within the target week.",
    'If a date is not mentioned, mark it as "rest".',
    "NAME MATCHING",
    "Messenger names may be in English letters while schedule names are Mongolian.",
    "Match sender to the closest existing employee name.",
    'Known nickname mapping: "Miga" should match "Мягмарноров", not "Мягмардорж".',
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
    "OUTPUT FORMAT",
    "Each day must be an object with shift and start_time. Use start_time: null when no time was specified.",
    'Return JSON only in the shape: {"requests":[{"employee_name":"Нарансолонго","matched_from":"Naso Ily","confidence":0.9,"branch":"1","days":{"2026-04-06":"rest"}}],"review":[{"type":"ambiguous_name","raw":"Miga","possible":["Мягмарноров"]}]}.',
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
              `${employee.name} (branch ${employee.branch}, can_work_branch1: ${employee.canWorkBranch1 ? "true" : "false"})`
          )
          .join(", ")}`
      : options.employeeNames?.length
        ? `employees: ${options.employeeNames.join(", ")}`
        : "",
    `allow_assignment_without_request: ${options.allowFallbackAssignment ? "true" : "false"}`,
    `extracted_requests: ${JSON.stringify({ requests: normalizedRequests, review: extracted.review ?? [] })}`,
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
    'morning = "Ө"',
    'evening = "О"',
    'full_day = "Б"',
    'rest = "А"',
    "IMPORTANT: full_day means the employee can work both shifts.",
    "ONLY assign both if they requested full_day.",
    "Never assign double shift otherwise.",
    "If a request includes a late start time such as 11:00 or 13:00, preserve that time on the final assigned shift for that day.",
    "Do not invent times. If no time was requested, use null.",
    "CORE GOAL",
    "Create a valid schedule that meets staffing requirements per day, respects requests as much as possible, and distributes shifts fairly.",
    "Employee names in extracted_requests are already resolved identities. Preserve them exactly, including initials or other distinguishing suffixes from the grid.",
    "If two employees have the same base name, treat them as different people if their extracted employee_name strings differ.",
    "ASSIGNMENT PRIORITY",
    "1. Prefer employees who requested that shift.",
    "2. If too many requested, choose those with fewer total assigned shifts that week.",
    "3. Keep distribution balanced across all employees.",
    "4. Avoid overworking the same people.",
    "5. Do NOT assign shifts on days marked as rest.",
    "CONSTRAINTS",
    "Do NOT exceed required workers per shift.",
    "Do NOT assign shifts to people who did not request unless necessary and allowed.",
    "Do NOT assign both shifts unless full_day.",
    "Try to minimize rejected requests.",
    "Use branch-specific staffing requirements.",
    "Branch 1 employees only count toward branch 1.",
    "Branch 2 employees normally count toward branch 2.",
    "If a branch 2 employee has can_work_branch1: true, you may assign them to cover branch 1 on specific days when needed.",
    "When that happens, keep their employee name the same and record coverage_branch as 1 for that date.",
    "STRICT RULES",
    "This is NOT extraction. Do NOT reinterpret raw screenshot text.",
    "Only use the structured requests provided.",
    "Always satisfy staffing requirements first, then optimize fairness.",
    "OUTPUT FORMAT",
    "Return parallel maps for final_schedule, start_times, and coverage_branches using the same employee names and dates.",
    'Return JSON only like {"final_schedule":{"Нарансолонго":{"2026-04-06":"А"}},"summary":{"total_assigned_per_employee":{"Нарансолонго":3}},"review":[]}.',
  ]
    .filter(Boolean)
    .join("\n");

  const schedulerSchema = {
    type: "OBJECT",
    properties: {
      final_schedule: {
        type: "OBJECT",
        properties: Object.fromEntries(
          (options.employeeNames ?? employeeDirectory.map((employee) => employee.name)).map((name) => [
            name,
            {
              type: "OBJECT",
              properties: Object.fromEntries(
                dayLabels.map((day) => [day, { type: "STRING", enum: ["А", "Ө", "О", "Б"] }])
              ),
              required: dayLabels,
            },
          ])
        ),
      },
      start_times: {
        type: "OBJECT",
        properties: Object.fromEntries(
          (options.employeeNames ?? employeeDirectory.map((employee) => employee.name)).map((name) => [
            name,
            {
              type: "OBJECT",
              properties: Object.fromEntries(
                dayLabels.map((day) => [day, { type: "STRING", nullable: true }])
              ),
              required: dayLabels,
            },
          ])
        ),
      },
      coverage_branches: {
        type: "OBJECT",
        properties: Object.fromEntries(
          (options.employeeNames ?? employeeDirectory.map((employee) => employee.name)).map((name) => [
            name,
            {
              type: "OBJECT",
              properties: Object.fromEntries(
                dayLabels.map((day) => [
                  day,
                  { anyOf: [{ type: "INTEGER", enum: [1, 2] }, { type: "NULL" }] },
                ])
              ),
              required: dayLabels,
            },
          ])
        ),
      },
      summary: {
        type: "OBJECT",
        properties: {
          total_assigned_per_employee: {
            type: "OBJECT",
            properties: Object.fromEntries(
              (options.employeeNames ?? employeeDirectory.map((employee) => employee.name)).map((name) => [
                name,
                { type: "NUMBER" },
              ])
            ),
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
    required: ["final_schedule", "start_times", "coverage_branches", "summary", "review"],
  };

  const scheduled = await callGeminiJson<SchedulingResult>({
    apiKey,
    prompt: schedulerPrompt,
    responseSchema: schedulerSchema,
  });

  const reviewNotes = [
    ...(extracted.review ?? []).map((item) => `${item.type}: ${item.raw}`),
    ...(scheduled.review ?? []).map((item) => item.message ?? item.type ?? "review"),
  ].filter(Boolean);

  return {
    entries: Object.entries(scheduled.final_schedule ?? {}).map(([employeeName, days]) => {
      const extractedRequest = normalizedRequests.find((request) => request.employee_name === employeeName);
      const branch =
        branchByName.get(employeeName) ??
        normalizeBranch(extractedRequest?.branch) ??
        null;

      return {
        employeeName,
        times: dayLabels.map((day) => scheduled.start_times?.[employeeName]?.[day] ?? undefined),
        coverageBranches: dayLabels.map((day) => {
          const value = scheduled.coverage_branches?.[employeeName]?.[day];
          return value === 1 || value === 2 ? value : undefined;
        }),
        branch,
        shifts: dayLabels.map((day) => days?.[day] ?? "А"),
        notes: reviewNotes.join(" | ") || "Two-stage AI pipeline completed.",
        confidence: extractedRequest && extractedRequest.confidence >= 0.85
          ? "high"
          : extractedRequest && extractedRequest.confidence >= 0.6
            ? "medium"
            : "low",
      };
    }),
  };
}
