// FAQ #5 ("What happens after the free month?") needs verification against
// the real Stripe trial flow before merge — see Task 11 of the redesign plan
// at docs/superpowers/plans/2026-05-01-marketing-page-redesign.md. The current
// answer is the conservative honest framing ("we let you know before charging")
// and avoids product-behavior claims that haven't been confirmed.
const FAQS = [
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
  {
    q: "What happens after the free month?",
    a: "We let you know before charging. If you don't continue, your site pauses — your settings stay in your account so you can restart later.",
  },
] as const;

export function FAQ() {
  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-serif text-3xl font-semibold text-warm-text md:text-4xl">
          Questions?
        </h2>
        <div className="mt-10 space-y-4">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl bg-white p-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-warm-text">
                {faq.q}
                <span
                  aria-hidden="true"
                  className="ml-4 text-warm-eyebrow transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-warm-textMuted">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
