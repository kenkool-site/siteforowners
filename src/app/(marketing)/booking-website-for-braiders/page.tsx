import type { Metadata } from "next";
import Link from "next/link";
import { NicheGuide } from "../_components/NicheGuide";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

const guide = MARKETING_GUIDES[1];

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: guide.path },
  openGraph: { title: guide.title, description: guide.description, url: guide.path },
};

export default function BookingWebsiteForBraidersPage() {
  return (
    <NicheGuide
      eyebrow="Booking"
      title="Booking website for braiders"
      lede="The slow part of braiding is often not the style. It is the thread before the appointment: which length, which day, is a deposit required, can you do 2pm. A booking website answers that before you pick up the phone."
    >
      <section>
        <h2 className="font-serif text-2xl font-semibold">The messages a booking page replaces</h2>
        <p className="mt-3 text-warm-textMuted">
          A useful page lists the service, how long it takes, and the price or the starting price. The client picks one and a time you actually have open. You get a text. You are not reconstructing the appointment from five voice notes the night before.
        </p>
        <p className="mt-3 text-warm-textMuted">
          That only works if the menu is specific. “Braids” is not a service a client can book. “Knotless braids, mid-back, starts at …” is. If length changes the price, say what “starts at” includes so the booking is not a surprise at the chair.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What you see after they book</h2>
        <p className="mt-3 text-warm-textMuted">
          The owner dashboard is the day: schedule, services, leads, visitors, and billing, in one place, in your brand color. You can add a service, change a price, and set a deposit policy, and it saves to the live site. A new photo, a rewritten paragraph, or a holiday closure is a text to us. Approval changes are done the same day. Later updates are usually done within 48 hours.
        </p>
        <p className="mt-3 text-warm-textMuted">
          You do not need a separate login for “the website person.” Hosting is included. The domain is registered in your name, and it stays yours if you cancel.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">What this is not</h2>
        <p className="mt-3 text-warm-textMuted">
          It is not a marketplace that sends you strangers, and it is not a blank page builder you have to design yourself. We build the site, connect booking, and host it. The public promise on the homepage is simple: customers book directly, and you get a text. There is no claim here about how many people will find you. A booking page does not replace word of mouth. It stops the back-and-forth once someone already wants the chair.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">Price</h2>
        <p className="mt-3 text-warm-textMuted">
          Free for one month, then $50 a month. No card up front to request it. Cancel anytime, with no cancellation fee. We let you know before the first charge. If you do not continue, the site pauses and your settings stay so you can restart later. The same $50 is the standard price in the terms. Promotional pricing only applies if a promotion code is used at checkout.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl font-semibold">How to start</h2>
        <p className="mt-3 text-warm-textMuted">
          Send the services you want bookable, with times and prices, plus a few photos and your hours. The site is ready to review in 24 hours, on a private link. Approve it, ask for a change, or walk away.
        </p>
        <p className="mt-3 text-warm-textMuted">
          The rest of the site — photos, the service menu, the address — is covered on{" "}
          <Link href="/website-for-hair-braiders" className="font-semibold underline decoration-pop-pink underline-offset-4">
            website for hair braiders
          </Link>
          . Stylists who also want the portfolio and the dashboard described together can read{" "}
          <Link href="/hair-stylist-website-builder" className="font-semibold underline decoration-pop-pink underline-offset-4">
            hair stylist website builder
          </Link>
          .
        </p>
      </section>
    </NicheGuide>
  );
}
