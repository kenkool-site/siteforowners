import { isInvitationMediaOrphan } from "./media";

function parseReferenceSnapshot(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Unable to load a valid invitation media reference snapshot");
  }
  const paths = (value as { paths?: unknown }).paths;
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string" && path.length > 0)) {
    throw new Error("Unable to load a valid invitation media reference snapshot");
  }
  return paths;
}

export async function cleanupInvitationMedia(input: {
  now?: Date;
  listObjects(): Promise<Array<{ path: string; createdAt: string }>>;
  loadReferenceSnapshot(): Promise<unknown>;
  removeObject(path: string): Promise<void>;
}): Promise<{ scanned: number; deleted: number; failed: number }> {
  // Resolve and validate the database snapshot before the first delete. The
  // RPC aggregates paths in one statement, so row caps and page churn cannot
  // omit a live reference.
  const [objects, snapshot] = await Promise.all([
    input.listObjects(),
    input.loadReferenceSnapshot(),
  ]);
  const referenced = new Set(parseReferenceSnapshot(snapshot));

  let deleted = 0;
  let failed = 0;
  for (const object of objects) {
    if (!isInvitationMediaOrphan({
      createdAt: object.createdAt,
      referenced: referenced.has(object.path),
    }, input.now)) continue;
    try {
      await input.removeObject(object.path);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: objects.length, deleted, failed };
}
