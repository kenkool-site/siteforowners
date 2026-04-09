import Link from "next/link";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    num: "1",
    title: "Tell us about your business",
    desc: "Business name, services, a few photos — that's all we need.",
  },
  {
    num: "2",
    title: "AI builds your website",
    desc: "Our AI creates your professional website with custom content in minutes.",
  },
  {
    num: "3",
    title: "Go live for $65/month",
    desc: "Love it? We handle hosting, domain, updates — everything.",
  },
];

const VERTICALS = [
  { name: "Hair Salon", emoji: "💇‍♀️" },
  { name: "Barbershop", emoji: "💈" },
  { name: "Restaurant", emoji: "🍽️" },
  { name: "Nail Salon", emoji: "💅" },
  { name: "Braiding Salon", emoji: "✨" },
];

const PLANS = [
  {
    name: "Starter",
    price: "$65",
    features: [
      "Professional website",
      "Hosting & domain included",
      "Mobile-friendly design",
      "Contact form with notifications",
      "2 updates per month",
      "English + Spanish",
    ],
    popular: false,
  },
  {
    name: "Growth",
    price: "$99",
    features: [
      "Everything in Starter",
      "Google Business Profile setup",
      "Basic SEO optimization",
      "Monthly traffic report",
      "4 updates per month",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "$149",
    features: [
      "Everything in Growth",
      "Review management",
      "SMS notifications",
      "Booking integration",
      "Unlimited updates",
      "Dedicated support",
    ],
    popular: false,
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold text-gray-900">
          Site<span className="text-amber-600">ForOwners</span>
        </span>
        <Link href="/preview">
          <Button size="sm" className="rounded-full bg-gray-900 text-white hover:bg-gray-800">
            Build My Preview
          </Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 text-center md:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-6 text-4xl font-bold leading-tight text-gray-900 md:text-6xl">
            Your website,{" "}
            <span className="text-amber-600">built for you</span>
          </h1>
          <p className="mb-4 text-xl text-gray-600 md:text-2xl">
            See it free in 5 minutes
          </p>
          <p className="mb-10 text-base text-gray-500 md:text-lg">
            Professional websites for small businesses. $65/month. No setup fee.
            We handle everything.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/preview">
              <Button
                size="lg"
                className="rounded-full bg-amber-600 px-10 py-6 text-base font-semibold text-white hover:bg-amber-700"
              >
                Build My Preview — Free
              </Button>
            </Link>
            <a href="https://wa.me/1XXXXXXXXXX" target="_blank" rel="noopener noreferrer">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-10 py-6 text-base"
              >
                Text Us
              </Button>
            </a>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            {VERTICALS.map((v) => (
              <span
                key={v.name}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700"
              >
                {v.emoji} {v.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-16 text-center text-3xl font-bold text-gray-900 md:text-4xl">
            How It Works
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="text-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-xl font-bold text-white">
                  {step.num}
                </div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900">
                  {step.title}
                </h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-gray-900 md:text-4xl">
            Simple Pricing
          </h2>
          <p className="mb-16 text-center text-gray-600">
            No setup fees. No contracts. Cancel anytime. You own your domain.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-8 ${
                  plan.popular
                    ? "border-amber-600 ring-2 ring-amber-600"
                    : "border-gray-200"
                }`}
              >
                {plan.popular && (
                  <span className="mb-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start text-sm text-gray-700">
                      <svg
                        className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/preview">
                  <Button
                    className={`w-full rounded-full py-5 ${
                      plan.popular
                        ? "bg-amber-600 text-white hover:bg-amber-700"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    }`}
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / FAQ */}
      <section className="bg-gray-50 px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
            Questions?
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "Do I own my domain?",
                a: "Yes. We register the domain in your name. If you ever leave, it's yours to keep — we'll transfer full control to you.",
              },
              {
                q: "What if I need changes to my site?",
                a: "Just text or WhatsApp us what you need. We make the updates for you, usually within 48 hours.",
              },
              {
                q: "Do I need to do anything technical?",
                a: "Nothing. We handle hosting, updates, domain, email — everything. You just run your business.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. No contracts, no cancellation fees. Your domain stays yours.",
              },
            ].map((faq) => (
              <div key={faq.q} className="rounded-xl bg-white p-6">
                <h3 className="mb-2 font-semibold text-gray-900">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-3xl font-bold text-gray-900 md:text-4xl">
            Ready to see your website?
          </h2>
          <p className="mb-10 text-lg text-gray-600">
            Free preview. 5 minutes. No credit card needed.
          </p>
          <Link href="/preview">
            <Button
              size="lg"
              className="rounded-full bg-amber-600 px-12 py-6 text-lg font-semibold text-white hover:bg-amber-700"
            >
              Build My Preview
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white px-6 py-8 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} SiteForOwners. All rights reserved.
      </footer>
    </main>
  );
}
