import "dotenv/config";
import cors from "cors";
import express, { Request, Response } from "express";
import { parseScheduleImages } from "./gemini";
import { readSchedules, upsertWeekSchedule } from "./storage";
import {
  DailyRequirementInput,
  EmployeeDirectoryEntry,
  ParseScheduleImagesRequest,
  StoredSchedules,
  WeekSchedule,
} from "./types";

const app = express();
const port = Number(process.env.PORT || 4000);
const rawHost = process.env.HOST || "0.0.0.0";
const configuredHosts = rawHost
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const host = configuredHosts[0] || "0.0.0.0";
const configuredOrigins = process.env.FRONTEND_ORIGIN;
const allowedOrigins = (configuredOrigins || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const hasConfiguredOrigins = Boolean(configuredOrigins?.trim());
const isLocalHost =
  host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0";
const localDevelopmentOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const effectiveAllowedOrigins = Array.from(
  new Set(isLocalHost ? [...allowedOrigins, ...localDevelopmentOrigins] : allowedOrigins)
);

if (!hasConfiguredOrigins) {
  console.warn(
    "FRONTEND_ORIGIN is not configured. Allowing browser origins until an explicit allowlist is set."
  );
}

if (configuredHosts.length > 1) {
  console.warn(`HOST contains multiple values (${rawHost}). Using ${host}.`);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn(
    "BLOB_READ_WRITE_TOKEN is not configured. Schedule data will use local file storage and will not be durable across Vercel instances."
  );
}

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY is not configured. /parse-schedule-images will return 500 until it is set."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !hasConfiguredOrigins || effectiveAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  })
);
app.use(express.json({ limit: "50mb" }));

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

function normalizeParseRequest(body: ParseScheduleImagesRequest | undefined) {
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

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/schedules", async (_req: Request, res: Response<StoredSchedules>) => {
  try {
    const stored = await readSchedules();
    res.json(stored);
  } catch (error) {
    res.status(500).json({
      schedulesByWeek: {},
      error: error instanceof Error ? error.message : "Failed to load schedules.",
    } as StoredSchedules & { error: string });
  }
});

app.put(
  "/schedules/:weekKey",
  async (
    req: Request<{ weekKey: string }, { ok?: boolean; weekKey?: string; error?: string }, WeekSchedule>,
    res: Response
  ) => {
    const { weekKey } = req.params;
    const schedule = req.body;

    if (!schedule || typeof schedule !== "object") {
      res.status(400).json({ error: "A schedule payload is required." });
      return;
    }

    try {
      await upsertWeekSchedule(weekKey, schedule);
      res.json({ ok: true, weekKey });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save schedule.",
      });
    }
  }
);

app.post(
  "/parse-schedule-images",
  async (
    req: Request<{}, {}, ParseScheduleImagesRequest>,
    res: Response
  ) => {
    try {
      const images = req.body?.images;
      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: "At least one image is required." });
        return;
      }

      const normalized = normalizeParseRequest(req.body);

      if (normalized.dayLabels.length !== 7) {
        res.status(400).json({
          error: "dayLabels must contain exactly 7 ISO dates for the target week.",
        });
        return;
      }

      if (normalized.employeeDirectory.length === 0 && normalized.employeeNames.length === 0) {
        res.status(400).json({
          error: "employeeDirectory or employeeNames must contain at least one employee.",
        });
        return;
      }

      const parsed = await parseScheduleImages(images, normalized);
      res.json(parsed);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to parse screenshots",
      });
    }
  }
);

app.listen(port, host, () => {
  console.log(`KB schedule backend listening on http://${host}:${port}`);
});