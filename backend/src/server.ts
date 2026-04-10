import "dotenv/config";
import cors from "cors";
import express, { Request, Response } from "express";
import { parseScheduleImages } from "./gemini";
import { readSchedules, upsertWeekSchedule } from "./storage";
import {
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
      if (!origin || !hasConfiguredOrigins || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  })
);
app.use(express.json({ limit: "50mb" }));

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

      const parsed = await parseScheduleImages(images, {
        weekKey: req.body?.weekKey,
        weekStartIso: req.body?.weekStartIso,
        weekEndIso: req.body?.weekEndIso,
        dayLabels: req.body?.dayLabels,
        employeeNames: req.body?.employeeNames,
        employeeDirectory: req.body?.employeeDirectory,
        dailyRequirements: req.body?.dailyRequirements,
        allowFallbackAssignment: req.body?.allowFallbackAssignment,
      });
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
