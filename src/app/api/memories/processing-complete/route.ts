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

  // Build the update object conditionally based on whether derivatives were generated.
  // `upload_status: "uploaded"` is set here too: this route only fires because the R2
  // event notification proved the object was actually written, which is stronger
  // evidence than the guest's own /upload/complete callback (that call never arrives
  // if their browser closes mid-upload). Setting it here self-heals a row otherwise
  // stuck at upload_status='pending' forever.
  const mediaUpdate: Record<string, unknown> = { processing_status: "ready", upload_status: "uploaded" };
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

  // Upsert rather than a conditional update: this route and /upload/complete (which
  // creates the job row via upsert in markMemoryMediaUploaded) are unordered. If the
  // Worker wins the race, a `.update(...).eq("status","pending")` would match zero
  // rows — no error, silently a no-op — and the later /upload/complete upsert would
  // then insert a fresh `pending` row that its own ignoreDuplicates keeps anyone from
  // ever closing. Upserting on the same (media_id, job_type, attempt) key makes
  // whichever side runs second converge on the terminal state either way.
  const { error: jobError } = await client.from("memory_processing_jobs").upsert(
    {
      media_id: body.mediaId,
      job_type: "derivative",
      attempt: 1,
      status: "succeeded",
      finished_at: new Date().toISOString(),
    },
    { onConflict: "media_id,job_type,attempt" },
  );
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
