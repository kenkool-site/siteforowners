import Link from "next/link";
import { MarketingBrandLogo } from "@/components/MarketingBrandLogo";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

export function Footer() {
  return (
    <footer className="bg-warm-deep px-6 py-8 text-center text-xs text-warm-cream2/70">
      <nav aria-label="Guides" className="mx-auto mb-4 flex max-w-3xl flex-col items-center gap-2 text-sm">
        {MARKETING_GUIDES.map((guide) => (
          <Link
            key={guide.path}
            href={guide.path}
            className="underline decoration-warm-cream2/40 underline-offset-4 hover:text-warm-cream2 hover:decoration-warm-cream2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm-cream2"
          >
            {guide.label}
          </Link>
        ))}
      </nav>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center rounded-xl bg-[#f5f0e8] px-3 py-2 shadow-md ring-1 ring-white/20">
          <MarketingBrandLogo
            href="/"
            heightClass="h-10 sm:h-11"
            displayWidth={44}
            linkClassName="ring-offset-[#f5f0e8] focus-visible:ring-warm-deep/40"
          />
        </span>
        <span aria-hidden>·</span>
        <span>Made in Brooklyn</span>
        <span aria-hidden>·</span>
        <Link
          href="/privacy"
          className="underline decoration-warm-cream2/40 underline-offset-4 hover:text-warm-cream2 hover:decoration-warm-cream2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm-cream2"
        >
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/terms"
          className="underline decoration-warm-cream2/40 underline-offset-4 hover:text-warm-cream2 hover:decoration-warm-cream2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm-cream2"
        >
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/invitations/login"
          className="underline decoration-warm-cream2/30 underline-offset-4 hover:text-warm-cream2 hover:decoration-warm-cream2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm-cream2"
        >
          Invitation sign in
        </Link>
        <span aria-hidden>·</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
