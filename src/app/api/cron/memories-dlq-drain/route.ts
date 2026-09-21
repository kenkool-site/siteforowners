import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DLQ_PULL_URL_TEMPLATE =
  "https://api.cloudflare.com/client/v4/accounts/{accountId}/queues/{queueId}/messages/pull";
const DLQ_ACK_URL_TEMPLATE =
  "https://api.cloudflare.com/client/v4/accounts/{accountId}/queues/{queueId}/messages/ack";

interface PulledMessage {
  id: string;
  attempts: number;
  body: string;
  lease_id: string;
  metadata: unknown;
  timestamp_ms: number;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const queueId = requireEnv("MEMORIES_DLQ_ID");
  const queuesToken = requireEnv("CLOUDFLARE_QUEUES_API_TOKEN");
  const pullUrl = DLQ_PULL_URL_TEMPLATE.replace("{accountId}", accountId).replace("{queueId}", queueId);

  const response = await fetch(pullUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${queuesToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ visibility_timeout_ms: 30_000, batch_size: 25 }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `queue pull failed: ${response.status}` }, { status: 502 });
  }

  const payload = (await response.json()) as {
    result: { messages: PulledMessage[] };
  };

  const client = createAdminClient();
  let drained = 0;
  const ackedLeaseIds: string[] = [];

  for (const message of payload.result.messages ?? []) {
    // `body` is the raw JSON string of the R2 event notification, not a parsed
    // object — https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/pull/
    let objectKey: string | undefined;
    try {
      const parsedBody = JSON.parse(message.body) as { object?: { key?: string } };
      objectKey = parsedBody.object?.key;
    } catch (parseError) {
      console.error("[cron/memories-dlq-drain] malformed message body, skipping", {
        messageId: message.id,
        parseError,
      });
      continue;
    }
    if (!objectKey) continue;

    const match = objectKey.match(/^originals\/[^/]+\/([^./]+)\.[^.]+$/);
    if (!match) continue;
    const [, mediaId] = match;

    const { error: mediaError } = await client
      .from("memory_media")
      .update({ processing_status: "processing_failed" })
      .eq("id", mediaId)
      .neq("processing_status", "ready"); // don't regress a row the host already recovered
    if (mediaError) {
      console.error("[cron/memories-dlq-drain] memory_media update failed", { mediaId, mediaError });
      continue;
    }

    const { error: jobError } = await client
      .from("memory_processing_jobs")
      .update({ status: "dead_letter", finished_at: new Date().toISOString() })
      .eq("media_id", mediaId)
      .eq("job_type", "derivative")
      .in("status", ["pending", "running"]); // don't clobber an already-terminal/retried job
    if (jobError) {
      console.error("[cron/memories-dlq-drain] memory_processing_jobs update failed", { mediaId, jobError });
      continue;
    }

    drained += 1;
    ackedLeaseIds.push(message.lease_id);
  }

  // Only ack what we actually finished processing — anything skipped (malformed
  // body, no key match, or a failed update) is left unacked so Cloudflare Queues
  // redelivers it on the next pull instead of losing it silently.
  if (ackedLeaseIds.length > 0) {
    const ackUrl = DLQ_ACK_URL_TEMPLATE.replace("{accountId}", accountId).replace("{queueId}", queueId);
    const ackResponse = await fetch(ackUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${queuesToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ acks: ackedLeaseIds.map((lease_id) => ({ lease_id })) }),
    });
    if (!ackResponse.ok) {
      console.error("[cron/memories-dlq-drain] ack failed", { status: ackResponse.status });
    }
  }

  return NextResponse.json({ drained });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
