import { parseScheduleImages } from "@/server/gemini";
import { normalizeParseRequest } from "@/server/request-normalizers";
import { ParseScheduleImagesRequest } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: ParseScheduleImagesRequest;

  try {
    body = (await req.json()) as ParseScheduleImagesRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const images = body?.images;

    if (!Array.isArray(images) || images.length === 0) {
      return Response.json({ error: "At least one image is required." }, { status: 400 });
    }

    const normalized = normalizeParseRequest(body);

    if (normalized.dayLabels.length !== 7) {
      return Response.json(
        {
          error: "dayLabels must contain exactly 7 ISO dates for the target week.",
        },
        { status: 400 }
      );
    }

    if (normalized.employeeDirectory.length === 0 && normalized.employeeNames.length === 0) {
      return Response.json(
        {
          error: "employeeDirectory or employeeNames must contain at least one employee.",
        },
        { status: 400 }
      );
    }

    const parsed = await parseScheduleImages(images, normalized);
    return Response.json(parsed);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to parse screenshots",
      },
      { status: 500 }
    );
  }
}
