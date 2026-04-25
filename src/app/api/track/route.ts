import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { recordVisit } from "@/lib/admin-visits";

// Minimal substring-based bot filter. Undercounting is acceptable —
// the visitor stat is feel-good, not fraud-grade.
const BOT_UA_SUBSTRINGS = [
  "bot", "spider", "crawler", "crawl", "headless", "slurp",
  "facebookexternalhit", "preview", "monitor", "lighthouse",
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((s) => ua.includes(s));
}

export async function POST(request: NextRequest) {
  if (isBot(request.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true });
  }

  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await recordVisit(tenant.id);
  return NextResponse.json({ ok: true });
}
