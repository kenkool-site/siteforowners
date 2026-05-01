import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-warm-deep px-6 py-8 text-center text-xs text-warm-cream2/70">
      <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="font-medium text-warm-cream2">SiteForOwners</span>
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
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
