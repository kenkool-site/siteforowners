import type { Metadata } from "next";
import Link from "next/link";
import { NicheGuide } from "../_components/NicheGuide";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

const guide = MARKETING_GUIDES[0];

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: guide.path },
  openGraph: { title: guide.title, description: guide.description, url: guide.path },
};

export default function WebsiteForHairBraidersPage() {
  return (
    <NicheGuide
      eyebrow="For braiders"
      title="Website for hair braiders"
      lede="A braider’s website has one job: show the work, list what you actually offer, and let someone book without a week of messages. Instagram can introduce you. It is a poor place to keep the menu."
    >
      <section>
        <h2 className="font-serif text-2xl font-semibold">What belongs on the page</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-warm-textMuted">
          <li>
            Service names clients use: knotless braids, box braids, stitch braids, boho styles, kids’ braids, and loc maintenance if you do it. When the price depends on size or length, say so on the service — not in a caption that disappears.
          </li>
          <li>Photos of your work. A few clear photos are more useful than a grid of blurry ones. Skip stock hair.</li>
          <li>
            Prices, or a clear starting price when length changes the total. Hidden prices are why people DM “how much?”
          </li>
          <li>Hours, where you work (a shop address or the area you travel), and a phone number.</li>
          <li>One next step. If the only button says “DM me,” the site is a flyer.</li>
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What a link in your bio does not do</h2>
        <p className="mt-3 text-warm-textMuted">
          People find braiders on Instagram and TikTok. Those apps bury prices in a highlight, and a new client still has to ask which days are open. A website keeps the menu and the booking path in one place they can reopen later, including on a phone at 375 pixels wide. That is the whole layout test: if it does not work on a phone, it does not work.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What we build</h2>
        <p className="mt-3 text-warm-textMuted">
          You send the business name, services, photos, and hours. The site is ready in 24 hours. You look it over. Want a change before it goes live? Text us — those approval edits are done the same day. After you are live, text or WhatsApp what you need. We usually make those updates within 48 hours. You do not touch hosting, code, or the domain registrar.
        </p>
        <p className="mt-3 text-warm-textMuted">
          The subscription includes the site, online booking, an owner dashboard (visitors, bookings, leads, and billing), hosting, a domain registered in your name, and those updates. Customers book on the site. You get a text.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What it costs</h2>
        <p className="mt-3 text-warm-textMuted">
          The first month is free. After that it is $50 a month, billed in advance. There is no card up front when you request the site. You can cancel anytime — no contract and no cancellation fee. If you leave, the domain stays yours. We register it in your name and transfer control to you.
        </p>
        <p className="mt-3 text-warm-textMuted">
          If you do not continue after the free month, we let you know before charging. The site pauses. Your settings stay in the account so you can restart later.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What to gather before you request it</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-warm-textMuted">
          <li>The name clients already know you by, and the city or neighborhood.</li>
          <li>A phone number you actually answer.</li>
          <li>The services you want listed, with prices or starting prices.</li>
          <li>A handful of photos you are proud of. Phone photos are fine if the style is clear.</li>
          <li>Hours, and whether clients come to you or you go to them.</li>
        </ol>
        <p className="mt-3 text-warm-textMuted">
          That is the same short request as the form. You get a private preview link to approve, ask for changes, or walk away. Nothing is published until you say so.
        </p>
        <p className="mt-3 text-warm-textMuted">
          If the part you care about is the calendar rather than the portfolio, read the{" "}
          <Link href="/booking-website-for-braiders" className="font-semibold underline decoration-pop-pink underline-offset-4">
            booking website for braiders
          </Link>
          . If you cut and color as well as braid, the{" "}
          <Link href="/hair-stylist-website-builder" className="font-semibold underline decoration-pop-pink underline-offset-4">
            hair stylist website builder
          </Link>{" "}
          page is the same service described for stylists.
        </p>
      </section>
    </NicheGuide>
  );
}
