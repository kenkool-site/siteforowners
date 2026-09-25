import { NextRequest, NextResponse } from "next/server";
import { moderateMedia } from "./moderate-media";

// Framework-facing entry point only — a route.ts file may only export the
// recognized HTTP handlers and a small set of config fields, so the actual
// moderation work (and its DI-free R2/Rekognition calls) lives in the
// sibling moderate-media.ts, callable directly from upload/complete/route.ts
// for video's independent moderation trigger. See moderate-media.ts's header
// comment for why that direct call exists at all.
export async function POST(request: NextRequest) {
  if (request.headers.get("x-memories-internal-secret") !== process.env.MEMORIES_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { mediaId } = (await request.json()) as { mediaId: string };
  const result = await moderateMedia(mediaId);
  return NextResponse.json(result.body, { status: result.status });
}
