// src/app/api/cron/memories-highlights/route.ts
//
// Periodic worker for the AI Highlight Grouping pipeline (see
// src/lib/invitations/memories/highlight-service.ts). The actual worker
// logic (queued-generation processing plus bounded descriptor backfill) lives
// in the sibling memories-highlights-cron.ts, not here — a route.ts file may
// only export the recognized HTTP handlers and a small set of config fields;
// Next.js's typed-routes build step rejects anything else (see that file's
// header comment for the failure this used to cause).
//
// Follows this codebase's established cron pattern (see
// src/app/api/cron/memories-dlq-drain/route.ts): Bearer CRON_SECRET auth
// first, force-dynamic, a per-item try/catch inside the worker so one
// failure never stops the batch, and a small JSON summary as the response.
import { NextRequest, NextResponse } from "next/server";
import { runMemoriesHighlightsCron } from "./memories-highlights-cron";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runMemoriesHighlightsCron();
  return NextResponse.json(result);
}
