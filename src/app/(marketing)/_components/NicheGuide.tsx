import Link from "next/link";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

export function NicheGuide({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-warm-cream2 text-warm-text">
      <Nav />
      <article className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight md:text-5xl">{title}</h1>
        <p className="mt-4 text-base leading-relaxed text-warm-textMuted md:text-lg">{lede}</p>
        <div className="mt-10 space-y-10 text-base leading-relaxed">{children}</div>
        <div className="mt-12 rounded-2xl border border-warm-cream1 bg-white p-6">
          <h2 className="font-serif text-2xl font-semibold">Request a private preview</h2>
          <p className="mt-2 text-sm leading-relaxed text-warm-textMuted">
            Free for one month, then $50 a month. No card up front. Cancel anytime. The domain is registered in your name.
          </p>
          <Link
            href="/request-site"
            className="mt-5 inline-flex rounded-full bg-pop-pink px-6 py-3 text-sm font-bold text-pop-cream hover:bg-pop-pink/90"
          >
            Request my site
          </Link>
        </div>
        <nav aria-label="Related guides" className="mt-10 border-t border-warm-cream1 pt-6">
          <h2 className="font-serif text-xl font-semibold">Related</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {MARKETING_GUIDES.map((guide) => (
              <li key={guide.path}>
                <Link href={guide.path} className="font-semibold underline decoration-pop-pink underline-offset-4">
                  {guide.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/#pricing" className="font-semibold underline decoration-pop-pink underline-offset-4">
                Pricing
              </Link>
            </li>
          </ul>
        </nav>
      </article>
      <Footer />
    </main>
  );
}
