import Link from "next/link";

export const metadata = {
  title: "Terms of Service — SiteForOwners",
  description: "Terms of Service for SiteForOwners website subscription.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-800">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: April 21, 2026</p>

      <section className="mt-10 space-y-6 leading-relaxed">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the website
          subscription service provided by SiteForOwners (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          By subscribing to or using our service, you agree to these Terms.
        </p>

        <h2 className="text-2xl font-semibold">1. Service Description</h2>
        <p>
          SiteForOwners provides a done-for-you website subscription for small
          businesses. Your subscription includes website hosting, a domain
          name, mobile-responsive design, content updates (as described at
          checkout), and technical support. Features included with your
          subscription may evolve over time; we will not reduce core features
          without reasonable notice.
        </p>

        <h2 className="text-2xl font-semibold">2. Subscription &amp; Billing</h2>
        <p>
          Our service is a recurring monthly subscription. The standard price
          is $50 per month, billed in advance through Stripe. Promotional or
          discounted pricing may apply if a valid promotion code is used at
          checkout; the discount remains for the lifetime of the subscription
          unless otherwise stated. You authorize us to charge your payment
          method on file each month until you cancel.
        </p>

        <h2 className="text-2xl font-semibold">3. Cancellation &amp; Refunds</h2>
        <p>
          You may cancel your subscription at any time via the Customer Portal
          or by contacting us. Cancellation takes effect at the end of your
          current billing period; you retain access to your site until that
          date. We do not offer pro-rated refunds for partial months. If you
          believe you were charged in error, contact us within 30 days and we
          will review in good faith.
        </p>

        <h2 className="text-2xl font-semibold">4. Content Ownership</h2>
        <p>
          You retain full ownership of any text, images, logos, and other
          content you provide. By using the service, you grant us a limited
          license to host, display, and modify your content solely to operate
          your website. We claim no ownership of your business content. If you
          cancel, you may request an export of your content within 30 days of
          cancellation.
        </p>

        <h2 className="text-2xl font-semibold">5. Acceptable Use</h2>
        <p>
          You agree not to use the service to host content that is unlawful,
          infringing, fraudulent, defamatory, or harmful. We reserve the right
          to suspend or terminate accounts that violate this policy, with
          reasonable notice where possible.
        </p>

        <h2 className="text-2xl font-semibold">6. Service Availability</h2>
        <p>
          We aim for high availability but do not guarantee uninterrupted
          service. Scheduled maintenance, third-party outages (hosting,
          payment, domain registrars), and force majeure events may cause
          downtime. We are not liable for losses resulting from such
          interruptions.
        </p>

        <h2 className="text-2xl font-semibold">7. Failed Payments</h2>
        <p>
          If a payment fails, Stripe will automatically retry. If payment
          remains unresolved, your site may be taken offline until the account
          is restored. Repeated payment failures may result in subscription
          cancellation.
        </p>

        <h2 className="text-2xl font-semibold">8. Disclaimer of Warranties</h2>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
          of any kind, express or implied, including merchantability, fitness
          for a particular purpose, and non-infringement.
        </p>

        <h2 className="text-2xl font-semibold">9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, SiteForOwners shall not be
          liable for any indirect, incidental, special, or consequential
          damages arising out of your use of the service. Our total liability
          for any claim shall not exceed the amount you paid us in the three
          months preceding the claim.
        </p>

        <h2 className="text-2xl font-semibold">10. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will
          be communicated via email or on the website at least 14 days before
          they take effect. Continued use after that date constitutes
          acceptance of the updated Terms.
        </p>

        <h2 className="text-2xl font-semibold">11. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of New York,
          without regard to conflict-of-laws principles. Any dispute shall be
          resolved in the state or federal courts located in Kings County, New
          York.
        </p>

        <h2 className="text-2xl font-semibold">12. Contact</h2>
        <p>
          Questions? Contact us at{" "}
          <a
            href="mailto:afolabi.kenneth@gmail.com"
            className="text-blue-600 hover:underline"
          >
            afolabi.kenneth@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
