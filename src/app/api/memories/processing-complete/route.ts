import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";

export async function POST(request: NextRequest) {
  if (request.headers.get("x-memories-internal-secret") !== process.env.MEMORIES_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { mediaId: string; eventId: string; hasDerivatives?: boolean };
  const hasDerivatives = body.hasDerivatives !== false; // default to true for backward compat

  const client = createAdminClient();

  // Build the update object conditionally based on whether derivatives were generated
  const mediaUpdate: Record<string, unknown> = { processing_status: "ready" };
  if (hasDerivatives) {
    // Object keys are fully deterministic from (eventId, mediaId) — derive them
    // server-side rather than trusting the Worker's payload for something that
    // doesn't need to travel over the wire at all.
    const { display, thumbnail } = deriveObjectKeys(body.eventId, body.mediaId);
    mediaUpdate.object_key_display = display;
    mediaUpdate.object_key_thumbnail = thumbnail;
  }
  // When hasDerivatives is false, leave object_key_display and object_key_thumbnail as null (DB default)

  const { error } = await client
    .from("memory_media")
    .update(mediaUpdate)
    .eq("id", body.mediaId)
    .neq("processing_status", "ready"); // idempotent against redelivery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: jobError } = await client
    .from("memory_processing_jobs")
    .update({ status: "succeeded", finished_at: new Date().toISOString() })
    .eq("media_id", body.mediaId)
    .eq("job_type", "derivative")
    .eq("status", "pending"); // idempotent: a redelivered completion can't flip an already-terminal job
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
