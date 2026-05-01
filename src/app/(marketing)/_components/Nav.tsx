"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#examples", label: "Examples" },
  { href: "#pricing", label: "Pricing" },
];

export function Nav() {
  return (
    <nav className="flex items-center justify-between bg-white px-6 py-4 border-b border-warm-cream1/60">
      <Link href="/" className="text-xl font-bold text-warm-text">
        Site<span className="text-pop-pink">ForOwners</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-warm-textMuted hover:bg-warm-cream2 hover:text-warm-text"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <details className="relative sm:hidden">
          <summary className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-warm-cream1 text-warm-textMuted hover:bg-warm-cream2">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-label="Open menu"
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
          </div>
        </details>

        <Link href="/preview">
          <Button
            size="sm"
            className="rounded-full bg-pop-pink text-pop-cream hover:bg-pop-pink/90"
          >
            Build my preview
          </Button>
        </Link>
      </div>
    </nav>
  );
}
