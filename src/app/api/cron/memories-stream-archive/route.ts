import { NextRequest, NextResponse } from "next/server";
import { listStreamCopiesToArchive, updateMemoryMediaStream } from "@/lib/invitations/memories/repository";
import { deleteStreamVideo, getStreamConfig } from "@/lib/invitations/memories/stream";
import { archiveCutoffIso } from "@/lib/invitations/memories/stream-archive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Stream bills every stored minute every month, so old events' Stream copies
// can be deleted here. The R2 originals stay, and those videos go back to
// playing from them. Off until MEMORIES_STREAM_ARCHIVE_AFTER_DAYS is set (for
// example 120 to archive events about four months after they started).
const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getStreamConfig();
  const cutoff = archiveCutoffIso(process.env.MEMORIES_STREAM_ARCHIVE_AFTER_DAYS);
  if (!config || !cutoff) return NextResponse.json({ skipped: true, archived: 0 });

  const copies = await listStreamCopiesToArchive(cutoff, BATCH_SIZE);
  let archived = 0;
  for (const copy of copies) {
    try {
      if (!(await deleteStreamVideo(config, copy.streamUid))) continue;
      await updateMemoryMediaStream(copy.id, { streamUid: null, streamStatus: "archived", streamHlsUrl: null });
      archived += 1;
    } catch (error) {
      console.error("[cron/memories-stream-archive] failed to archive a Stream copy", { mediaId: copy.id, error });
    }
  }
  return NextResponse.json({ skipped: false, archived, remaining: copies.length === BATCH_SIZE });
}
