import { process } from "./processing-provider";

interface Env {
  MEMORIES_BUCKET: R2Bucket;
  MEMORIES_INTERNAL_SECRET: string;
  MEMORIES_APP_BASE_URL: string; // e.g. https://siteforowners.com
}

interface R2EventNotification {
  object: { key: string };
}

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export default {
  async queue(batch: MessageBatch<R2EventNotification>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleOne(message.body, env, ctx);
        message.ack();
      } catch (err) {
        console.error("memories-processing: failed to process", message.body.object.key, err);
        message.retry();
      }
    }
  },
};

async function handleOne(event: R2EventNotification, env: Env, ctx: ExecutionContext): Promise<void> {
  const objectKey = event.object.key;
  const match = objectKey.match(/^originals\/([^/]+)\/([^./]+)\.([^.]+)$/);
  if (!match) return; // not a Memories original — should never happen given the notification's prefix filter
  const [, eventId, mediaId, ext] = match;
  const extension = ext.toLowerCase();

  // Skip processing for non-image formats (e.g., videos); they will be marked ready without derivatives
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    await markProcessingComplete(mediaId, eventId, env);
    return;
  }

  const original = await env.MEMORIES_BUCKET.get(objectKey);
  if (!original) return; // object already gone — nothing to do

  const bytes = new Uint8Array(await original.arrayBuffer());
  const { displayBytes, thumbnailBytes, moderationBytes } = await process(bytes);

  // Key construction here MUST stay identical to `deriveObjectKeys` in
  // src/lib/invitations/memories/processing-provider.ts — the Worker can't import
  // that file directly (separate project/runtime target), and processing-complete
  // independently re-derives the same keys rather than trusting whatever this
  // payload claims, so a drift between the two would surface as a real bug, not
  // a silent mismatch. If you change one, change the other.
  const displayKey = `display/${eventId}/${mediaId}.webp`;
  const thumbnailKey = `thumbnails/${eventId}/${mediaId}.webp`;
  const moderationKey = `moderation/${eventId}/${mediaId}.jpg`;
  await env.MEMORIES_BUCKET.put(displayKey, displayBytes);
  await env.MEMORIES_BUCKET.put(thumbnailKey, thumbnailBytes);
  await env.MEMORIES_BUCKET.put(moderationKey, moderationBytes);

  const res = await fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/processing-complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId, eventId, hasDerivatives: true }),
  });

  if (!res.ok) {
    throw new Error(`processing-complete returned ${res.status}: ${await res.text()}`);
  }

  // Fire-and-forget moderation trigger — deliberately NOT awaited on the critical
  // path and deliberately NOT calling Rekognition from inside the Worker itself
  // (spec 1's constraint: never call an AI/vision API synchronously in this path).
  // Use ctx.waitUntil to ensure the fetch completes even after this handler returns.
  ctx.waitUntil(
    fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
      body: JSON.stringify({ mediaId }),
    })
      .then(async (moderationRes) => {
        // A non-2xx here leaves the row at moderation_status='pending' with nothing
        // to retry it. Retry infrastructure for moderation is a known follow-up;
        // until then, at least make the failure visible in Worker logs rather than
        // letting it vanish into a fire-and-forget promise.
        if (!moderationRes.ok) {
          console.error(
            "memories-processing: moderation trigger failed",
            mediaId,
            moderationRes.status,
            await moderationRes.text().catch(() => "<unreadable body>")
          );
        }
      })
      .catch((err) => console.error("memories-processing: failed to trigger moderation", mediaId, err))
  );
}

async function markProcessingComplete(mediaId: string, eventId: string, env: Env): Promise<void> {
  const res = await fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/processing-complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId, eventId, hasDerivatives: false }),
  });

  if (!res.ok) {
    throw new Error(`processing-complete returned ${res.status}: ${await res.text()}`);
  }
}
