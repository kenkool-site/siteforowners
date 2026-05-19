import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Script from "next/script";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { tenantUrl } from "@/lib/tenant-url";
import { findServiceForLandingSlug, listLandingPages } from "@/lib/seo-landing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

async function loadContext(slug: string) {
  const supabase = createAdminClient();
  const [{ data: preview }, { data: tenant }] = await Promise.all([
    supabase.from("previews").select("*").eq("slug", slug).single(),
    supabase
      .from("tenants")
      .select("business_name, phone, email, address, custom_domain, subdomain, preview_slug")
      .eq("preview_slug", slug)
      .maybeSingle(),
  ]);
  if (!preview) return null;

  const p = preview as PreviewData & { seo_locality?: string | null };
  const businessName =
    (tenant?.business_name as string | undefined)?.trim() || p.business_name || "Business";
  const hostFields = {
    custom_domain: (tenant?.custom_domain as string | null) ?? null,
    subdomain: (tenant?.subdomain as string | null) ?? null,
    preview_slug: slug,
  };

  const siteRoot = tenantUrl(APP_URL, hostFields, "/");
  const phone = ((tenant?.phone as string | null) ?? null) || p.phone || "";

  return {
    preview: p,
    businessName,
    hostFields,
    siteRoot,
    tenantAddress: (tenant?.address as string | null) || p.address || "",
    phone,
  };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string; landing: string };
}): Promise<Metadata> {
  const ctx = await loadContext(params.slug);
  if (!ctx) return { title: "Not found" };

  const { preview, businessName } = ctx;
  const locality = preview.seo_locality?.trim();
  const serviceName = locality ? findServiceForLandingSlug(preview, params.landing) : null;

  if (!locality || !serviceName) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const title = `${serviceName} in ${locality} | ${businessName}`;
  const desc = `${businessName} offers ${serviceName} in ${locality}. View services and book online.`;
  const canonical = tenantUrl(APP_URL, ctx.hostFields, `/l/${params.landing}`);
  const image = preview.images?.[0];

  return {
    title,
    description: desc.slice(0, 160),
    alternates: { canonical },
    openGraph: {
      title,
      description: desc.slice(0, 160),
      type: "website",
      siteName: businessName,
      url: canonical,
      ...(image ? { images: [{ url: image, alt: businessName }] } : {}),
    },
    twitter: {
      card: image ? ("summary_large_image" as const) : ("summary" as const),
      title,
      description: desc.slice(0, 160),
      ...(image ? { images: [image] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export const revalidate = 0;

export default async function SeoLandingPage({
  params,
}: {
  params: { slug: string; landing: string };
}) {
  const ctx = await loadContext(params.slug);
  if (!ctx) notFound();

  const locality = ctx.preview.seo_locality?.trim();
  const serviceName = locality ? findServiceForLandingSlug(ctx.preview, params.landing) : null;
  if (!locality || !serviceName) notFound();

  const bookingUrl = `${ctx.siteRoot}#booking`;

  const siblings = listLandingPages(ctx.preview).filter((x) => x.slug !== params.landing);

  const price =
    ctx.preview.services?.find((s) => s.name.trim() === serviceName)?.price?.trim() || "";

  const sitemapHref = tenantUrl(APP_URL, ctx.hostFields, "/sitemap");

  return (
    <>
      <Script src="/track.js" strategy="afterInteractive" />
      <main className="min-h-screen bg-stone-50 text-stone-900">
        <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
          <nav className="mb-8 text-sm text-stone-500">
            <Link href={ctx.siteRoot} className="underline hover:text-stone-800">
              {ctx.businessName}
            </Link>
            <span className="mx-2">/</span>
            <span>{locality}</span>
          </nav>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            {serviceName} in {locality}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-stone-700">
            {ctx.businessName} welcomes clients looking for <strong>{serviceName}</strong> in{" "}
            <strong>{locality}</strong>
            .
            {price ? (
              <>
                {" "}
                Services from our menu start around <strong>{price}</strong> — see the full booking page for exact
                options and add-ons.
              </>
            ) : (
              <> Browse our full menu and book a time that works for you.</>
            )}
          </p>
          <p className="mt-4 text-stone-700 leading-relaxed">
            Book online with {ctx.businessName} to reserve your appointment without the back-and-forth. You can switch
            services or times from the booking flow anytime before you confirm.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={bookingUrl}
              className="inline-flex items-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
            >
              Book {serviceName}
            </a>
            <Link
              href={ctx.siteRoot}
              className="inline-flex items-center rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium hover:bg-stone-100"
            >
              Full site &amp; gallery
            </Link>
          </div>
          {siblings.length > 0 ? (
            <section className="mt-16 border-t border-stone-200 pt-10">
              <h2 className="text-lg font-semibold text-stone-900">Other services in {locality}</h2>
              <ul className="mt-4 space-y-2">
                {siblings.slice(0, 24).map((row) => (
                  <li key={row.slug}>
                    <Link
                      href={`/l/${row.slug}`}
                      className="text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
                    >
                      {row.serviceName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <footer className="mt-16 text-xs text-stone-400">
            <a href={sitemapHref} className="underline hover:text-stone-600">
              XML sitemap
            </a>{" "}
            for this site (search engines).
          </footer>
        </article>
      </main>
    </>
  );
}
