import { process } from "./processing-provider";

interface Env {
  MEMORIES_BUCKET: R2Bucket;
  MEMORIES_INTERNAL_SECRET: string;
  MEMORIES_APP_BASE_URL: string; // e.g. https://siteforowners.com
}

interface R2EventNotification {
  object: { key: string };
}

export default {
  async queue(batch: MessageBatch<R2EventNotification>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleOne(message.body, env);
        message.ack();
      } catch (err) {
        console.error("memories-processing: failed to process", message.body.object.key, err);
        message.retry();
      }
    }
  },
};

async function handleOne(event: R2EventNotification, env: Env): Promise<void> {
  const objectKey = event.object.key;
  const match = objectKey.match(/^originals\/([^/]+)\/([^./]+)\.[^.]+$/);
  if (!match) return; // not a Memories original — should never happen given the notification's prefix filter
  const [, eventId, mediaId] = match;

  const original = await env.MEMORIES_BUCKET.get(objectKey);
  if (!original) return; // object already gone — nothing to do

  const bytes = new Uint8Array(await original.arrayBuffer());
  const { displayBytes, thumbnailBytes } = await process(bytes);

  // Key construction here MUST stay identical to `deriveObjectKeys` in
  // src/lib/invitations/memories/processing-provider.ts — the Worker can't import
  // that file directly (separate project/runtime target), and processing-complete
  // independently re-derives the same keys rather than trusting whatever this
  // payload claims, so a drift between the two would surface as a real bug, not
  // a silent mismatch. If you change one, change the other.
  const displayKey = `display/${eventId}/${mediaId}.webp`;
  const thumbnailKey = `thumbnails/${eventId}/${mediaId}.webp`;
  await env.MEMORIES_BUCKET.put(displayKey, displayBytes);
  await env.MEMORIES_BUCKET.put(thumbnailKey, thumbnailBytes);

  await fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/processing-complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId, eventId }),
  });

  // Fire-and-forget moderation trigger — deliberately NOT awaited on the critical
  // path and deliberately NOT calling Rekognition from inside the Worker itself
  // (spec 1's constraint: never call an AI/vision API synchronously in this path).
  void fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/moderate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId }),
  }).catch((err) => console.error("memories-processing: failed to trigger moderation", mediaId, err));
}
