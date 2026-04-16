import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  // Check if this is a subdomain request
  // e.g., letstrylocs.siteforowners.com → subdomain = "letstrylocs"
  const isRootDomain = ROOT_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`:${d.split(":")[1] || ""}`)
  );

  if (isRootDomain) {
    return NextResponse.next();
  }

  // Extract subdomain
  // hostname could be "letstrylocs.siteforowners.com" or "letstrylocs.localhost:3000"
  const subdomain = hostname.split(".")[0];

  if (!subdomain) {
    return NextResponse.next();
  }

  // Look up the tenant by subdomain
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug, site_published")
    .eq("subdomain", subdomain)
    .single();

  if (!tenant || !tenant.site_published || !tenant.preview_slug) {
    // Subdomain not found or not published — show 404
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  // Rewrite to the site route with the preview slug
  const url = new URL(`/site/${tenant.preview_slug}${pathname === "/" ? "" : pathname}`, request.url);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Match all paths except static files and API
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
