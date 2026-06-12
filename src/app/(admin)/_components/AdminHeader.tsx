"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingBrandLogo } from "@/components/MarketingBrandLogo";

// Ordered by funnel stage: build the asset → show it live → inbound → onboarding → paying.
const LINKS = [
  { href: "/previews", label: "Previews" },
  { href: "/demos", label: "Demos" },
  { href: "/requests", label: "Requests" },
  { href: "/prospects", label: "Prospects" },
  { href: "/clients", label: "Clients" },
];

export function AdminHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <Link
              href="/prospects"
              className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2"
            >
              <MarketingBrandLogo heightClass="h-10 sm:h-11" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Admin
              </span>
            </Link>
            <nav className="hidden items-center gap-4 sm:flex">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/preview"
              className="rounded-full bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 sm:px-4"
            >
              + New Preview
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              aria-expanded={open}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-gray-600 hover:bg-gray-100 sm:hidden"
            >
              {open ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <nav className="mt-3 flex flex-col gap-1 border-t pt-3 sm:hidden">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
