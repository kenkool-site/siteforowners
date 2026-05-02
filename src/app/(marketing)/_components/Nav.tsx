import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#examples", label: "Examples" },
  { href: "#pricing", label: "Pricing" },
];

const ADMIN_LINKS = [
  { href: "/prospects", label: "Prospects" },
  { href: "/clients", label: "Clients" },
  { href: "/previews", label: "Previews" },
  { href: "/preview", label: "Create preview" },
];

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b border-warm-cream1/60 bg-white px-6 py-4">
      <Link href="/" className="text-xl font-bold text-warm-text">
        Site<span className="text-pop-pink">ForOwners</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-warm-textMuted hover:bg-warm-cream2 hover:text-warm-text"
            >
              {link.label}
            </Link>
          ))}
          <details className="relative">
            <summary className="list-none rounded-full bg-warm-cream2 px-3 py-1.5 text-xs font-bold text-warm-textMuted transition hover:bg-warm-cream1 hover:text-warm-text [&::-webkit-details-marker]:hidden">
              Admin
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-warm-cream1 bg-white py-2 text-sm shadow-lg">
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-2 text-warm-textMuted hover:bg-warm-cream2 hover:text-warm-text"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        </div>

        <details className="relative md:hidden">
          <summary
            aria-label="Open menu"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-warm-cream1 text-warm-textMuted hover:bg-warm-cream2"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </summary>
          <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-warm-cream1 bg-white py-2 shadow-lg">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-2.5 text-sm text-warm-text hover:bg-warm-cream2"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-warm-cream1 pt-2">
              <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-warm-eyebrow">
                Admin
              </p>
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-2 text-sm text-warm-textMuted hover:bg-warm-cream2 hover:text-warm-text"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </details>

        <Button
          asChild
          size="sm"
          className="rounded-full bg-pop-pink text-pop-cream hover:bg-pop-pink/90"
        >
          <Link href="#request-site">Request site</Link>
        </Button>
      </div>
    </nav>
  );
}
