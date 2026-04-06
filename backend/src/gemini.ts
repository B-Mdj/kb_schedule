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

function normalizeBranch(value: unknown): 1 | 2 | null {
  if (value === 1 || value === 2) return value;
  if (value === "1") return 1;
  if (value === "2") return 2;
  return null;
}

export async function parseScheduleImages(
  images: UploadedImagePayload[],
  options: {
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
  } = {}
): Promise<ParsedSchedulePayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const imageParts = images.map((image) => {
    const [, base64Data = ""] = String(image.dataUrl || "").split(",", 2);

    return {
      inline_data: {
        mime_type: image.mimeType || "image/png",
        data: base64Data,
      },
    };
  });

  const weekContext = [
    options.weekKey ? `Target week key: ${options.weekKey}.` : "",
    options.weekStartIso && options.weekEndIso
      ? `Only extract shifts for the exact week from ${options.weekStartIso} to ${options.weekEndIso} inclusive.`
      : "",
    options.dayLabels?.length
      ? `The seven target days in order are: ${options.dayLabels.join(", ")}.`
      : "",
    options.employeeNames?.length
      ? `The existing employee names already present in the schedule grid are: ${options.employeeNames.join(", ")}.`
      : "",
    options.dailyRequirements?.length
      ? `Daily staffing requirements are: ${options.dailyRequirements
          .map((item) => `${item.date} morning=${item.morning}, evening=${item.evening}`)
          .join("; ")}.`
      : "",
    `Fallback assignment is ${options.allowFallbackAssignment ? "allowed" : "not allowed"} for people who did not request a day.`,
    "Do not create a new employee row. Match the screenshot sender to the closest existing employee name from the grid.",
    "If matching is ambiguous, choose the closest existing employee conservatively and explain the ambiguity in notes.",
  ]
    .filter(Boolean)
    .join(" ");

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
            {
              text:
                "You are an AI assistant that reads Facebook Messenger screenshots of cafe staff shift requests and updates a weekly schedule grid. " +
                "Your job has 2 phases: first extract each staff member's requested shifts from screenshots, then convert those requests into the final weekly schedule based on staffing requirements and fairness rules. " +
                "The target schedule is for one specific week, provided by the app. Staff usually send their requests during the weekend before that week. " +
                "For example, if the target week is 2026.04.06 to 2026.04.12, messages sent on 2026.04.04 or 2026.04.05 are still requests for that target week. " +
                "The screenshots are Facebook Messenger conversations. The Messenger display name may be written in English letters, but the schedule grid contains staff names in Mongolian. You must match the Messenger sender to the correct staff member in the grid. " +
                "Interpret shift words and shorthand as follows: 'өглөө' or 'ө' means morning, 'орой' or 'о' means evening, 'бүтэн' means full day, 'амрах' or a missing day means rest. " +
                "Numeric shorthand: '-4' means evening, '-9' means full day. Full day means the person can work both morning and evening on that same day, and they may only work both if they explicitly requested full day. " +
                "Requests may be written in many informal ways such as '4.9 өглөө 4.10 орой 4.12 бүтэн', '3.23 26 27 28 өглөө', '1-buten 2-buten(11-s) 5dhd oroi', or '2dah udur -4 3dah udur -4 Hagas Sain 9 Buten Sain -9'. " +
                "If one shift word appears after a list of dates, apply that shift to all listed dates. Dates may appear as M.D, D only, weekday-style text, or mixed informal Mongolian wording. Resolve dates relative to the target week supplied by the app. Only extract shifts that belong to the target week. Ignore unrelated dates outside the target week unless needed to understand the pattern. " +
                "Name matching rules: do not write the Messenger display name directly into the schedule. Match the sender's English-letter Messenger name to the correct Mongolian employee name already present in the schedule grid. Use nickname and phonetic matching when needed. Prioritize the closest existing employee name already in the grid. Never create a new employee row. " +
                "For each matched employee, produce a request for each date in the target week using one of morning, evening, full_day, or rest. Treat corrections in later messages as newer than older messages if they clearly replace earlier requests. " +
                "Scheduling rules: requested shifts are preferences, not guarantees. However, if daily staffing requirements are not provided by the app for this request, use the extracted requests themselves as the final assigned weekly schedule. " +
                "If staffing requirements are available, prefer employees who requested that shift, keep the result fair and balanced, only assign both morning and evening on the same day when the person explicitly requested full day, do not exceed required staffing counts, and minimize unnecessary rejection of requested shifts. " +
                "If fallback assignment is not allowed, do not assign an employee to a day they did not request. " +
                "Grid update rules: update only the existing grid rows for that week, use the Mongolian employee names already written in the grid, and fill cells with the exact site codes: А=rest, Ө=morning, О=evening, Б=full day. " +
                'Return JSON only in this exact shape: {"entries":[{"employeeName":"EXISTING_GRID_NAME","branch":"1","shifts":["А","Ө","О","Б","А","Ө","О"],"notes":"brief reasoning and any ambiguity","confidence":"high"}]}. ' +
                "For every employee in the existing grid who can be matched confidently enough, return exactly 7 final assigned shift codes for the target week in Monday-to-Sunday order. " +
                "If a day is not mentioned for that person, default it to А. Be robust to typos, shorthand, mixed formatting, and incomplete human messages. " +
                weekContext,
            },
            ...imageParts,
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            entries: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  employeeName: { type: "STRING" },
                  branch: { type: "STRING", enum: ["1", "2", "null"] },
                  shifts: {
                    type: "ARRAY",
                    minItems: 7,
                    maxItems: 7,
                    items: { type: "STRING", enum: ["А", "Ө", "О", "Б"] },
                  },
                  notes: { type: "STRING" },
                  confidence: {
                    type: "STRING",
                    enum: ["high", "medium", "low"],
                  },
                },
                required: ["employeeName", "branch", "shifts", "notes", "confidence"],
              },
            },
          },
          required: ["entries"],
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const result = (await response.json()) as GeminiResponse;
  const outputText = extractGeminiText(result);
  const parsed = JSON.parse(extractJsonFromModelText(outputText)) as {
    entries?: Array<{
      employeeName: string;
      branch: unknown;
      shifts: ("А" | "Ө" | "О" | "Б")[];
      notes: string;
      confidence: "high" | "medium" | "low";
    }>;
  };

  return {
    entries: Array.isArray(parsed?.entries)
      ? parsed.entries.map((entry) => ({
          ...entry,
          branch: normalizeBranch(entry?.branch),
        }))
      : [],
  };
}
