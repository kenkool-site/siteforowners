import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — SiteForOwners",
  description: "Privacy Policy for SiteForOwners.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-800">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: April 21, 2026</p>

      <section className="mt-10 space-y-6 leading-relaxed">
        <p>
          This Privacy Policy describes how SiteForOwners (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) collects, uses, and shares information when you use our
          service.
        </p>

        <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
        <p>We collect:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Business information</strong> you provide: business name,
            address, phone, services, photos, owner name, email.
          </li>
          <li>
            <strong>Account information:</strong> email address and
            authentication credentials.
          </li>
          <li>
            <strong>Payment information:</strong> processed and stored by
            Stripe. We do not store full card numbers on our servers. Stripe is
            PCI-DSS Level 1 certified.
          </li>
          <li>
            <strong>Usage data:</strong> aggregated, anonymized website traffic
            via Plausible Analytics (no cookies, no personal identifiers).
          </li>
          <li>
            <strong>Communications:</strong> emails or messages you send us.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold">2. How We Use Information</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>To build, host, and maintain your website</li>
          <li>To process payments and manage your subscription</li>
          <li>To send service-related notifications (billing, updates)</li>
          <li>To generate website copy using AI (see Section 4)</li>
          <li>To provide support</li>
        </ul>

        <h2 className="text-2xl font-semibold">3. Service Providers We Share With</h2>
        <p>
          We share limited information with the following providers to operate
          the service:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Stripe</strong> — payment processing
          </li>
          <li>
            <strong>Supabase</strong> — database and file storage
          </li>
          <li>
            <strong>Vercel</strong> — website hosting
          </li>
          <li>
            <strong>Cloudflare</strong> — DNS and domain services
          </li>
          <li>
            <strong>Anthropic</strong> — AI-generated website copy (business
            info is sent to Claude to generate your site content; conversations
            are not used for training per Anthropic&rsquo;s API terms)
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery
          </li>
          <li>
            <strong>Plausible</strong> — privacy-friendly analytics
          </li>
        </ul>
        <p>
          We do not sell your personal information to third parties.
        </p>

        <h2 className="text-2xl font-semibold">4. AI-Generated Content</h2>
        <p>
          Your business information is sent to Anthropic&rsquo;s Claude API to
          generate website copy. Per Anthropic&rsquo;s API terms, inputs and outputs
          are not used to train models. You can request regeneration or manual
          editing of any AI-generated content at any time.
        </p>

        <h2 className="text-2xl font-semibold">5. Data Retention</h2>
        <p>
          We retain your data while your subscription is active. After
          cancellation, we retain your content for 30 days to allow for export
          or reactivation. After that period, content is permanently deleted.
          Billing records may be retained longer for tax and accounting
          purposes.
        </p>

        <h2 className="text-2xl font-semibold">6. Your Rights</h2>
        <p>You may request to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Access the data we hold about you</li>
          <li>Correct inaccurate data</li>
          <li>Export your content</li>
          <li>Delete your account and data</li>
        </ul>
        <p>
          Email{" "}
          <a
            href="mailto:afolabi.kenneth@gmail.com"
            className="text-blue-600 hover:underline"
          >
            afolabi.kenneth@gmail.com
          </a>{" "}
          with any request. We will respond within 30 days.
        </p>

        <h2 className="text-2xl font-semibold">7. Security</h2>
        <p>
          We use industry-standard measures: encryption in transit (HTTPS),
          encryption at rest (Supabase, Stripe), role-based access control, and
          row-level security in our database. No system is perfectly secure; if
          a breach affects your data, we will notify you within 72 hours of
          discovery.
        </p>

        <h2 className="text-2xl font-semibold">8. Cookies</h2>
        <p>
          We use essential cookies for authentication and admin sessions. We do
          not use advertising or tracking cookies. Our analytics provider
          (Plausible) operates without cookies.
        </p>

        <h2 className="text-2xl font-semibold">9. Children</h2>
        <p>
          Our service is intended for business owners and is not directed at
          anyone under 18. We do not knowingly collect information from
          children.
        </p>

        <h2 className="text-2xl font-semibold">10. Changes to This Policy</h2>
        <p>
          We may update this Policy. Material changes will be communicated via
          email or on the website at least 14 days before they take effect.
        </p>

        <h2 className="text-2xl font-semibold">11. Contact</h2>
        <p>
          Questions? Email{" "}
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
