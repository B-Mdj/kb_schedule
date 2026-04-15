import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { StoredSchedules, WeekSchedule } from "./types";

const EMPTY_SCHEDULES: StoredSchedules = { schedulesByWeek: {} };
const blobPath = process.env.SCHEDULES_BLOB_PATH || "kb-schedule/schedules.json";
const hasBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const tmpSchedulesPath = path.join(os.tmpdir(), "kb-schedule", "schedules.json");

type StoredSchedulesSnapshot = {
  data: StoredSchedules;
  etag?: string;
};

function resolveLocalSchedulesPath() {
  const candidates = [
    path.join(process.cwd(), "backend", "data", "schedules.json"),
    path.join(process.cwd(), "..", "backend", "data", "schedules.json"),
    path.join(process.cwd(), "data", "schedules.json"),
  ];

  if (!process.env.VERCEL) {
    const repoPath = candidates.find((candidate) => fs.existsSync(path.dirname(candidate)));
    if (repoPath) {
      return repoPath;
    }
  }

  return tmpSchedulesPath;
}

const localSchedulesPath = resolveLocalSchedulesPath();

function ensureLocalStorage() {
  const dataDir = path.dirname(localSchedulesPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(localSchedulesPath)) {
    fs.writeFileSync(localSchedulesPath, JSON.stringify(EMPTY_SCHEDULES, null, 2));
  }
}

function normalizeStoredSchedules(value: unknown): StoredSchedules {
  if (!value || typeof value !== "object" || !("schedulesByWeek" in value)) {
    return EMPTY_SCHEDULES;
  }

  const schedulesByWeek = (value as StoredSchedules).schedulesByWeek;
  return {
    schedulesByWeek:
      schedulesByWeek && typeof schedulesByWeek === "object" ? schedulesByWeek : {},
  };
}

function readLocalSchedules(): StoredSchedules {
  ensureLocalStorage();
  const raw = fs.readFileSync(localSchedulesPath, "utf8");
  return normalizeStoredSchedules(JSON.parse(raw));
}

function writeLocalSchedules(data: StoredSchedules) {
  ensureLocalStorage();
  fs.writeFileSync(localSchedulesPath, JSON.stringify(data, null, 2));
}

function localSchedulesContainData(data: StoredSchedules) {
  return Object.keys(data.schedulesByWeek || {}).length > 0;
}

async function readBlobSchedules(): Promise<StoredSchedulesSnapshot | null> {
  const result = await get(blobPath, { access: "private" });
  if (!result || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();

  return {
    data: normalizeStoredSchedules(JSON.parse(raw)),
    etag: result.blob.etag,
  };
}

async function writeBlobSchedules(data: StoredSchedules, etag?: string) {
  const result = await put(blobPath, JSON.stringify(data, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    ifMatch: etag,
  });

  return result.etag;
}

function isBlobPreconditionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const combined = `${error.name} ${error.message}`.toLowerCase();
  return combined.includes("precondition") || combined.includes("etag");
}

async function readBlobSchedulesWithSeed(): Promise<StoredSchedulesSnapshot> {
  const existing = await readBlobSchedules();
  if (existing) {
    return existing;
  }

  const localSeed = readLocalSchedules();
  if (!localSchedulesContainData(localSeed)) {
    const etag = await writeBlobSchedules(EMPTY_SCHEDULES);
    return { data: EMPTY_SCHEDULES, etag };
  }

  const etag = await writeBlobSchedules(localSeed);
  return { data: localSeed, etag };
}

export async function readSchedules(): Promise<StoredSchedules> {
  if (!hasBlobStorage) {
    return readLocalSchedules();
  }

  return (await readBlobSchedulesWithSeed()).data;
}

export async function upsertWeekSchedule(
  weekKey: string,
  schedule: WeekSchedule
): Promise<StoredSchedules> {
  if (!hasBlobStorage) {
    const stored = readLocalSchedules();
    const next: StoredSchedules = {
      ...stored,
      schedulesByWeek: {
        ...(stored.schedulesByWeek || {}),
        [weekKey]: schedule,
      },
    };

    writeLocalSchedules(next);
    return next;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await readBlobSchedulesWithSeed();
    const next: StoredSchedules = {
      ...stored.data,
      schedulesByWeek: {
        ...(stored.data.schedulesByWeek || {}),
        [weekKey]: schedule,
      },
    };

    try {
      await writeBlobSchedules(next, stored.etag);
      return next;
    } catch (error) {
      if (attempt < 2 && isBlobPreconditionError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to persist schedule after multiple retries.");
}
