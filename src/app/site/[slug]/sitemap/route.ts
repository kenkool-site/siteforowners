import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { tenantUrl } from "@/lib/tenant-url";
import { listLandingPages } from "@/lib/seo-landing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createAdminClient();
  const [{ data: preview }, { data: tenant }] = await Promise.all([
    supabase.from("previews").select("*").eq("slug", params.slug).single(),
    supabase
      .from("tenants")
      .select("custom_domain, subdomain, preview_slug")
      .eq("preview_slug", params.slug)
      .maybeSingle(),
  ]);

  if (!preview) {
    return new Response("Not found", { status: 404 });
  }

  const hostFields = {
    custom_domain: (tenant?.custom_domain as string | null) ?? null,
    subdomain: (tenant?.subdomain as string | null) ?? null,
    preview_slug: params.slug,
  };

  const p = preview as PreviewData & { seo_locality?: string | null };

  const home = tenantUrl(APP_URL, hostFields, "/");
  const landingRows = listLandingPages(p).map((row) => ({
    url: tenantUrl(APP_URL, hostFields, `/l/${row.slug}`),
  }));

  const today = new Date().toISOString().slice(0, 10);

  const urlsXml = [{ url: home }, ...landingRows]
    .map(
      ({ url }) =>
        `  <url>\n    <loc>${xmlEscape(url)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`,
    )
    .join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
