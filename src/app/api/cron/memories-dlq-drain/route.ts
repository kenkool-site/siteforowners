import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DLQ_PULL_URL_TEMPLATE =
  "https://api.cloudflare.com/client/v4/accounts/{accountId}/queues/{queueId}/messages/pull";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const queueId = requireEnv("MEMORIES_DLQ_ID");
  const url = DLQ_PULL_URL_TEMPLATE.replace("{accountId}", accountId).replace("{queueId}", queueId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("CLOUDFLARE_QUEUES_API_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ visibility_timeout_ms: 30_000, batch_size: 25 }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `queue pull failed: ${response.status}` }, { status: 502 });
  }

  const payload = (await response.json()) as {
    result: { messages: Array<{ body: { object: { key: string } } }> };
  };

  const client = createAdminClient();
  let drained = 0;
  for (const message of payload.result.messages) {
    const match = message.body.object.key.match(/^originals\/[^/]+\/([^./]+)\.[^.]+$/);
    if (!match) continue;
    const [, mediaId] = match;
    await client.from("memory_media").update({ processing_status: "processing_failed" }).eq("id", mediaId);
    await client
      .from("memory_processing_jobs")
      .update({ status: "dead_letter", finished_at: new Date().toISOString() })
      .eq("media_id", mediaId)
      .eq("job_type", "derivative");
    drained += 1;
  }

  return NextResponse.json({ drained });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
