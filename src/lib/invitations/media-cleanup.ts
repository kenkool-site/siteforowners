import { isInvitationMediaOrphan } from "./media";

export type ExactReferencePage<T> = {
  rows: T[];
  total: number | null;
};

type EventReferences = {
  designedInvitePath: string | null;
  coverImagePath: string | null;
  videoPath: string | null;
};

type GalleryReference = { storagePath: string };

async function collectExactPages<T>(
  readPage: (from: number, to: number) => Promise<ExactReferencePage<T>>,
  pageSize: number,
): Promise<T[]> {
  const collected: T[] = [];
  let expectedTotal: number | null = null;
  while (expectedTotal === null || collected.length < expectedTotal) {
    const from = collected.length;
    const page = await readPage(from, from + pageSize - 1);
    if (!Number.isSafeInteger(page.total) || page.total === null || page.total < 0) {
      throw new Error("Unable to prove complete invitation media references");
    }
    if (expectedTotal === null) expectedTotal = page.total;
    if (page.total !== expectedTotal) throw new Error("Unable to prove complete invitation media references");
    const expectedLength = Math.min(pageSize, expectedTotal - from);
    if (page.rows.length !== expectedLength) throw new Error("Unable to prove complete invitation media references");
    collected.push(...page.rows);
  }
  return collected;
}

export async function cleanupInvitationMedia(input: {
  now?: Date;
  listObjects(): Promise<Array<{ path: string; createdAt: string }>>;
  listEventReferences(from: number, to: number): Promise<ExactReferencePage<EventReferences>>;
  listGalleryReferences(from: number, to: number): Promise<ExactReferencePage<GalleryReference>>;
  removeObject(path: string): Promise<void>;
}): Promise<{ scanned: number; deleted: number; failed: number }> {
  const pageSize = 1_000;
  // Resolve every reference page before the first delete. Any query error or
  // ambiguous count rejects this promise and therefore fails closed.
  const [objects, events, gallery] = await Promise.all([
    input.listObjects(),
    collectExactPages(input.listEventReferences, pageSize),
    collectExactPages(input.listGalleryReferences, pageSize),
  ]);
  const referenced = new Set<string>();
  for (const event of events) {
    for (const path of [event.designedInvitePath, event.coverImagePath, event.videoPath]) {
      if (path) referenced.add(path);
    }
  }
  for (const row of gallery) referenced.add(row.storagePath);

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
