import { readSchedules } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stored = await readSchedules();
    return Response.json(stored);
  } catch (error) {
    return Response.json(
      {
        schedulesByWeek: {},
        error: error instanceof Error ? error.message : "Failed to load schedules.",
      },
      { status: 500 }
    );
  }
}
