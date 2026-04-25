import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { recordVisit } from "@/lib/admin-visits";
import {
  checkRateLimit,
  hashIp,
  getClientIp,
  trackBucket,
} from "@/lib/api-rate-limit";

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

const TRACK_WINDOW_SECONDS = 60;
const TRACK_MAX_REQUESTS = 60;

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent");
  const host = request.headers.get("host") || "";
  const ip = getClientIp(request.headers);
  const ipHashShort = hashIp(ip).slice(0, 8);

  if (isBot(ua)) {
    console.log("[api/track] bot-filtered", { host, ipHashShort, ua });
    return NextResponse.json({ ok: true });
  }

  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    console.log("[api/track] no-tenant", { host, ipHashShort });
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const ipHash = hashIp(ip);
  const allowed = await checkRateLimit(
    trackBucket(tenant.id, ipHash),
    TRACK_WINDOW_SECONDS,
    TRACK_MAX_REQUESTS
  );
  if (!allowed) {
    console.log("[api/track] rate-limited", { tenantId: tenant.id, ipHashShort });
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  await recordVisit(tenant.id);
  console.log("[api/track] recorded", { tenantId: tenant.id, ipHashShort });
  return NextResponse.json({ ok: true });
}
