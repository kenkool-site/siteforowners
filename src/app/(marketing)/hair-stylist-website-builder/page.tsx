import type { Metadata } from "next";
import Link from "next/link";
import { NicheGuide } from "../_components/NicheGuide";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

const guide = MARKETING_GUIDES[2];

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: guide.path },
  openGraph: { title: guide.title, description: guide.description, url: guide.path },
};

export default function HairStylistWebsiteBuilderPage() {
  return (
    <NicheGuide
      eyebrow="For stylists"
      title="Hair stylist website builder"
      lede="Most “website builders” hand you an empty page and a pile of blocks. This one is the other way around. You describe the shop. We build the site, connect booking, and you run the day from a dashboard and a text thread."
    >
      <section>
        <h2 className="font-serif text-2xl font-semibold">What “builder” means here</h2>
        <p className="mt-3 text-warm-textMuted">
          You do not drag sections around, pick a theme, or learn a new editor before a client can find your prices. You send services, prices, photos, hours, and where you work. We put up a mobile site with a portfolio, a service list, and booking. It is ready in 24 hours. You approve it. Text us if something is wrong — those changes are done the same day.
        </p>
        <p className="mt-3 text-warm-textMuted">
          After it is live, you can add a service, change a price, and set a deposit policy from the owner dashboard, and it saves to the live site. A new photo or a rewritten sentence is a text or WhatsApp. We usually make those updates within 48 hours. Hosting is included. You never touch code.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What a stylist site still has to say</h2>
        <p className="mt-3 text-warm-textMuted">
          A template does not know the difference between a silk press and a color correction. The page has to:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-warm-textMuted">
          <li>Say what you do and where, in the first screen, not a slogan that could belong to any salon.</li>
          <li>List services with prices, so two very different appointments are not the same “contact us” button.</li>
          <li>Show photos of your work.</li>
          <li>Let someone book without waiting for you to be in your messages. You get a text when they do.</li>
          <li>Give you one place for visitors, bookings, leads, and billing.</li>
        </ul>
        <p className="mt-3 text-warm-textMuted">
          That is the same product as the homepage: done-for-you websites and booking, live in 24 hours, for stylists, salons, braiders, and barbers.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">Price, domain, and leaving</h2>
        <p className="mt-3 text-warm-textMuted">
          Free for one month. Then $50 a month. No card up front. Cancel anytime, no cancellation fee. The domain is registered in your name. If you ever leave, it is yours to keep and we transfer full control. We tell you before the first charge. If you pause, your settings stay in the account.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">Who it is for</h2>
        <p className="mt-3 text-warm-textMuted">
          Stylists who want the site handled. If you would rather design every pixel yourself, a self-serve builder is a different product, and this page is not pretending to be that. Braiders who want the service menu spelled out can start with{" "}
          <Link href="/website-for-hair-braiders" className="font-semibold underline decoration-pop-pink underline-offset-4">
            website for hair braiders
          </Link>{" "}
          or the{" "}
          <Link href="/booking-website-for-braiders" className="font-semibold underline decoration-pop-pink underline-offset-4">
            booking website for braiders
          </Link>
          . The request form is the same either way: business name, what you do, and a private preview to review before anything goes live.
        </p>
      </section>
    </NicheGuide>
  );
}
