import { isWeekSchedulePayload } from "@/server/request-normalizers";
import { upsertWeekSchedule } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    weekKey: string;
  }>;
};

export async function PUT(req: Request, context: RouteContext) {
  const { weekKey } = await context.params;
  let schedule: unknown;

  try {
    schedule = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isWeekSchedulePayload(schedule)) {
    return Response.json({ error: "A schedule payload is required." }, { status: 400 });
  }

  try {
    await upsertWeekSchedule(weekKey, schedule);
    return Response.json({ ok: true, weekKey });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to save schedule.",
      },
      { status: 500 }
    );
  }
}
