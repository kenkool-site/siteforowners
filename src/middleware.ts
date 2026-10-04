import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { isPublicSiteLive, isOwnerAdminReachable } from "@/lib/tenant-access";
import { classifyHost, invitationRewritePath, isLegacySiteforownersApex } from "@/lib/host-routing";
// Imported from ./passcode-session directly, not from ./auth: ./auth has a
// top-level `node:crypto` import (used by its unrelated owner-session/
// edit-token functions) that webpack refuses to bundle into this Edge
// Runtime middleware at all - see the comment atop passcode-session.ts.
import { getInvitationPasscodeCookieName, verifyInvitationPasscodeSession } from "@/lib/invitations/passcode-session";
import { invitationMemoriesUrl, invitationPublicUrl } from "@/lib/invitations/public-url";

// Admin routes that require authentication
const ADMIN_ROUTES = [
  "/admin/invitations",
  "/prospects",
  "/clients",
  "/previews",
  "/requests",
  "/invitespot-leads",
  "/onboard",
];

function getMiddlewareSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function invitationLockedRewrite(request: NextRequest, slug: string, pathname: string): NextResponse {
  const lockedUrl = new URL(`/invite/${encodeURIComponent(slug)}/locked`, request.url);
  // pathname alone drops any query string the original request carried (e.g.
  // /invite/{slug}/memories?photo=xyz) - the exact bug class this whole
  // effort started by fixing for the invitespot-root rewrite. Fold the
  // original request's own query string into the destination path before
  // setting it as `next`, so PasscodeGate's post-success redirect lands on
  // the guest's actual original destination, not a path that silently lost
  // its query string.
  const destination = new URL(pathname, request.url);
  destination.search = request.nextUrl.search;
  lockedUrl.searchParams.set("next", `${destination.pathname}${destination.search}`);
  const rewritten = NextResponse.rewrite(lockedUrl);
  rewritten.headers.set("Cache-Control", "no-store, must-revalidate");
  return rewritten;
}

async function hasInvitationPasscodeAccess(request: NextRequest, eventId: string): Promise<boolean> {
  const signed = request.cookies.get(getInvitationPasscodeCookieName(eventId))?.value;
  if (!signed) return false;
  try {
    return await verifyInvitationPasscodeSession(signed, eventId);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Skip for API routes, static files, and Next.js internals
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if this is an admin route that needs auth
  const isFounderInvitationRoute = pathname === "/admin/invitations" || pathname.startsWith("/admin/invitations/");
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminRoute && pathname !== "/login") {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionCookie = request.cookies.get("admin_session")?.value;

    if (
      (isFounderInvitationRoute && !hasFounderInvitationSession(adminPassword, sessionCookie)) ||
      (!isFounderInvitationRoute && adminPassword && sessionCookie !== adminPassword)
    ) {
      // Not authenticated — redirect to login
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const host = classifyHost(hostname);
  if (host.kind === "root") {
    if (!pathname.startsWith("/invite/")) {
      return NextResponse.next();
    }
    const slugMatch = pathname.match(/^\/invite\/([^/]+)/);
    const slug = slugMatch?.[1];
    const supabase = slug ? getMiddlewareSupabaseClient() : null;
    if (!slug || !supabase) return NextResponse.next();
    const eventResult = await supabase
      .from("invitation_events")
      .select("id, public_subdomain, passcode_hash")
      .eq("slug", slug)
      .maybeSingle();
    if (eventResult.error) {
      return invitationLockedRewrite(request, slug, pathname);
    }
    const publicSubdomain = eventResult.data?.public_subdomain as string | null | undefined;
    // Only bounce to invitespot.app on the real legacy siteforowners.com apex
    // — classifyHost's "root" bucket also covers localhost and *.vercel.app,
    // which must keep serving the content directly for local dev/preview,
    // not redirect out to a domain those environments can't reach.
    if (publicSubdomain && isLegacySiteforownersApex(hostname)) {
      const isMemories = pathname === `/invite/${encodeURIComponent(slug)}/memories`;
      const target = isMemories
        ? invitationMemoriesUrl({ slug, publicSubdomain })
        : invitationPublicUrl({ slug, publicSubdomain });
      const redirectUrl = new URL(target);
      redirectUrl.search = request.nextUrl.search;
      return NextResponse.redirect(redirectUrl, 301);
    }
    // Passcode gate applies regardless of which root host served this
    // request (apex, localhost, or a *.vercel.app preview) - every one of
    // them can render the real invitation page, so every one of them must
    // enforce it the same way the removed page-level check used to.
    const eventId = eventResult.data?.id as string | undefined;
    if (eventResult.data?.passcode_hash && eventId && !(await hasInvitationPasscodeAccess(request, eventId))) {
      return invitationLockedRewrite(request, slug, pathname);
    }
    return NextResponse.next();
  }

  if (host.kind === "invitespot-root") {
    if (pathname === "/") {
      // new URL(path, request.url) drops the query string, which would
      // silently strip ?from={slug} (the invitation footer's referral link)
      // and ?lang= before the page ever sees them — copy it over explicitly.
      const invitespotUrl = new URL("/invitespot", request.url);
      invitespotUrl.search = request.nextUrl.search;
      const rewritten = NextResponse.rewrite(invitespotUrl);
      // The page's rendered output varies per-visitor (?from= drives the
      // referral banner) — without this, an edge cache could serve one
      // guest's referral banner to another.
      rewritten.headers.set("Cache-Control", "no-store, must-revalidate");
      return rewritten;
    }
    if (pathname.startsWith("/invite/")) {
      const slugMatch = pathname.match(/^\/invite\/([^/]+)/);
      const slug = slugMatch?.[1];
      const supabase = slug ? getMiddlewareSupabaseClient() : null;
      if (!slug || !supabase) return NextResponse.next();
      const eventResult = await supabase
        .from("invitation_events")
        .select("id, passcode_hash")
        .eq("slug", slug)
        .maybeSingle();
      if (eventResult.error) {
        return invitationLockedRewrite(request, slug, pathname);
      }
      const event = eventResult.data;
      if (event?.passcode_hash && !(await hasInvitationPasscodeAccess(request, event.id as string))) {
        return invitationLockedRewrite(request, slug, pathname);
      }
      return NextResponse.next();
    }
    const notFound = NextResponse.rewrite(new URL("/not-found", request.url));
    notFound.headers.set("Cache-Control", "no-store, must-revalidate");
    return notFound;
  }

  const supabase = getMiddlewareSupabaseClient();
  if (!supabase) return NextResponse.next();

  let tenant: { preview_slug: string | null; site_published: boolean | null; subscription_status: string | null } | null = null;

  if (host.kind === "custom") {
    const result = await supabase
      .from("tenants")
      .select("preview_slug, site_published, subscription_status")
      .eq("custom_domain", host.hostname)
      .maybeSingle();
    tenant = result.error ? null : result.data;
  } else {
    const reservationResult = await supabase
      .from("platform_subdomains")
      .select("tenant_id,invitation_event_id")
      .eq("label", host.label)
      .maybeSingle();
    const reservation = reservationResult.error ? null : reservationResult.data;

    if (reservation?.invitation_event_id) {
      // Invitation events are moving to invitespot.app going forward — a
      // request for one on the old siteforowners.com platform domain
      // permanently redirects to its invitespot.app equivalent (path and
      // query preserved) instead of being served here. Only invitespot.app
      // itself (and local dev) serve invitation content directly. The
      // label alone is enough to build the redirect target, so this skips
      // the invitation_events lookup entirely for this case.
      if (host.apex === "siteforowners") {
        const redirectUrl = new URL(pathname, `https://${host.label}.invitespot.app`);
        redirectUrl.search = request.nextUrl.search;
        return NextResponse.redirect(redirectUrl, 301);
      }

      const eventResult = await supabase
        .from("invitation_events")
        .select("slug, passcode_hash")
        .eq("id", reservation.invitation_event_id)
        .maybeSingle();
      const eventSlug = eventResult.data?.slug as string | undefined;
      const rewritePath = eventSlug ? invitationRewritePath(eventSlug, pathname) : null;
      if (!rewritePath || !eventSlug) {
        const unavailable = NextResponse.rewrite(new URL("/not-found", request.url));
        unavailable.headers.set("Cache-Control", "no-store, must-revalidate");
        return unavailable;
      }
      if (
        eventResult.data?.passcode_hash
        && !(await hasInvitationPasscodeAccess(request, reservation.invitation_event_id as string))
      ) {
        return invitationLockedRewrite(request, eventSlug, rewritePath);
      }
      const invitationUrl = new URL(rewritePath, request.url);
      invitationUrl.search = request.nextUrl.search;
      return NextResponse.rewrite(invitationUrl);
    }

    if (reservation?.tenant_id) {
      // invitespot.app only ever serves invitation events, never a
      // SiteForOwners tenant business site — without this guard, a tenant
      // label requested under invitespot.app would render that tenant's
      // site under the wrong brand.
      if (host.apex === "invitespot") {
        const unavailable = NextResponse.rewrite(new URL("/not-found", request.url));
        unavailable.headers.set("Cache-Control", "no-store, must-revalidate");
        return unavailable;
      }

      const tenantResult = await supabase
        .from("tenants")
        .select("preview_slug, site_published, subscription_status")
        .eq("id", reservation.tenant_id)
        .maybeSingle();
      tenant = tenantResult.error ? null : tenantResult.data;
    }
  }

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // Gating policy lives in src/lib/tenant-access.ts (unit-tested). Owner admin
  // stays reachable while lapsed so owners can fix billing; the public site
  // also requires a live/grace subscription (past_due stays live during Stripe
  // dunning — see PUBLIC_LIVE_STATUSES).
  const gated = isAdminPath
    ? !isOwnerAdminReachable(tenant)
    : !isPublicSiteLive(tenant);

  if (gated) {
    // This 404 must NOT be edge-cached. Without no-store, Vercel caches the
    // /not-found render; when the tenant later reactivates (or a blocked
    // renewal recovers) the site would keep serving a stale 404 until a
    // redeploy. Same reason the /admin success path sets no-store below.
    const notFound = NextResponse.rewrite(new URL("/not-found", request.url));
    notFound.headers.set("Cache-Control", "no-store, must-revalidate");
    return notFound;
  }

  const url = new URL(
    `/site/${tenant!.preview_slug}${pathname === "/" ? "" : pathname}`,
    request.url
  );
  // Preserve the original search string. The URL constructor above only takes
  // the path; without this, `?tab=upcoming` etc. silently drops on rewrite and
  // server components receive an empty searchParams object.
  url.search = request.nextUrl.search;

  // Expose original pathname via request headers so server components (e.g. the
  // admin layout) can highlight the current nav tab. Setting it on the response
  // does NOT propagate — it has to be on the forwarded request.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", pathname);
  // Mirror the search string into a header. Next.js's searchParams prop has
  // been observed dropping `?tab=...` on rewritten admin paths in production
  // even when `url.search` is preserved on the rewrite target. The pathname
  // header pattern works reliably, so use the same channel for the query.
  forwardedHeaders.set("x-search", request.nextUrl.search);
  const response = NextResponse.rewrite(url, { request: { headers: forwardedHeaders } });

  // Force fresh render on every /admin request. Vercel's edge will cache
  // rewritten paths even with `force-dynamic` set on the route — admin
  // counters drift stale within minutes. Public site pages keep default
  // caching (they change rarely; cache helps perf).
  if (isAdminPath) {
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
