import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin routes that require authentication
const ADMIN_ROUTES = ["/prospects", "/clients", "/previews", "/onboard"];

// Domains that should NOT be treated as subdomains
const ROOT_DOMAINS = [
  "siteforowners.com",
  "www.siteforowners.com",
  "localhost",
  "localhost:3000",
];

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

  // Check if this is a subdomain request
  const isRootDomain = ROOT_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`:${d.split(":")[1] || ""}`)
  );

  if (isRootDomain) {
    return NextResponse.next();
  }

  // Normalize hostname: drop :port and any leading www. so apex and www.
  // variants of a custom domain route to the same tenant.
  const normalizedHost = hostname.split(":")[0].replace(/^www\./, "");
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

  const activeStatuses = ["active", "trialing"];
  if (
    !tenant ||
    !tenant.site_published ||
    !tenant.preview_slug ||
    !activeStatuses.includes(tenant.subscription_status)
  ) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  const url = new URL(`/site/${tenant.preview_slug}${pathname === "/" ? "" : pathname}`, request.url);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
