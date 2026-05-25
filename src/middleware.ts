import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPublicSiteLive, isOwnerAdminReachable } from "@/lib/tenant-access";

// Admin routes that require authentication
const ADMIN_ROUTES = ["/prospects", "/clients", "/previews", "/onboard"];

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
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminRoute && pathname !== "/login") {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionCookie = request.cookies.get("admin_session")?.value;

    if (adminPassword && sessionCookie !== adminPassword) {
      // Not authenticated — redirect to login
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Normalize hostname: drop :port and any leading www. so apex and www.
  // variants of a custom domain route to the same tenant.
  const normalizedHost = hostname.split(":")[0].replace(/^www\./, "");

  // Check if this is a root-domain request (no tenant subdomain).
  // - *.vercel.app preview deployments are always root
  // - "siteforowners.com" and bare "localhost" (any port) are root
  // - Tenant subdomains look like "letstrylocs.localhost" or "letstrylocs.com"
  const isVercelPreview = hostname.endsWith(".vercel.app");
  const isRootDomain =
    isVercelPreview ||
    normalizedHost === "siteforowners.com" ||
    normalizedHost === "localhost";

  if (isRootDomain) {
    return NextResponse.next();
  }

  const subdomain = normalizedHost.split(".")[0];

  if (!subdomain) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Prefer custom_domain — the full hostname is authoritative for mapped
  // domains. Fall back to subdomain for *.siteforowners.com tenants.
  let { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug, site_published, subscription_status")
    .eq("custom_domain", normalizedHost)
    .single();

  if (!tenant) {
    const result = await supabase
      .from("tenants")
      .select("preview_slug, site_published, subscription_status")
      .eq("subdomain", subdomain)
      .single();
    tenant = result.data;
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
