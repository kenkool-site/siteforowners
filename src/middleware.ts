import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const activeStatuses = ["active", "trialing"];

  // Owner admin needs to work even when the site is unpublished or the
  // subscription has lapsed — so owners can reach Billing and fix it.
  // Public site still requires both gates.
  const publicGated =
    !tenant ||
    !tenant.site_published ||
    !tenant.preview_slug ||
    !activeStatuses.includes(tenant.subscription_status);

  if (isAdminPath) {
    if (!tenant || !tenant.preview_slug) {
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  } else if (publicGated) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  const url = new URL(
    `/site/${tenant!.preview_slug}${pathname === "/" ? "" : pathname}`,
    request.url
  );
  // Expose original pathname via request headers so server components (e.g. the
  // admin layout) can highlight the current nav tab. Setting it on the response
  // does NOT propagate — it has to be on the forwarded request.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", pathname);
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
