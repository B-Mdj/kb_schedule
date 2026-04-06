import "dotenv/config";
import cors from "cors";
import express, { Request, Response } from "express";
import { parseScheduleImages } from "./gemini";
import { readSchedules, writeSchedules } from "./storage";
import {
  ParseScheduleImagesRequest,
  StoredSchedules,
  WeekSchedule,
} from "./types";

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  })
);
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/schedules", (_req: Request, res: Response<StoredSchedules>) => {
  const stored = readSchedules();
  res.json(stored);
});

app.put(
  "/api/schedules/:weekKey",
  (req: Request<{ weekKey: string }, { ok?: boolean; weekKey?: string; error?: string }, WeekSchedule>, res: Response) => {
    const { weekKey } = req.params;
    const schedule = req.body;

    if (!schedule || typeof schedule !== "object") {
      res.status(400).json({ error: "A schedule payload is required." });
      return;
    }

    const stored = readSchedules();
    const next: StoredSchedules = {
      ...stored,
      schedulesByWeek: {
        ...(stored.schedulesByWeek || {}),
        [weekKey]: schedule,
      },
    };

    writeSchedules(next);
    res.json({ ok: true, weekKey });
  }
);

app.post(
  "/api/parse-schedule-images",
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
