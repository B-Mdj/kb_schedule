import fs from "node:fs";
import path from "node:path";
import { StoredSchedules } from "./types";

const dataDir = path.join(__dirname, "..", "data");
const schedulesPath = path.join(dataDir, "schedules.json");

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(schedulesPath)) {
    fs.writeFileSync(schedulesPath, JSON.stringify({ schedulesByWeek: {} }, null, 2));
  }
}

export function readSchedules(): StoredSchedules {
  ensureStorage();
  const raw = fs.readFileSync(schedulesPath, "utf8");
  const parsed = JSON.parse(raw) as StoredSchedules;
  return parsed && typeof parsed === "object" ? parsed : { schedulesByWeek: {} };
}

export function writeSchedules(data: StoredSchedules) {
  ensureStorage();
  fs.writeFileSync(schedulesPath, JSON.stringify(data, null, 2));
}
