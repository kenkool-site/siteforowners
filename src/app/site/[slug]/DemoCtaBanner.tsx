"use client";

import { useState } from "react";

/**
 * Slim, dismissible banner shown only on unpaid demo sites. Deliberately
 * lighter than the onboarding preview's dominant bottom CTA bar.
 */
export function DemoCtaBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-gray-900/90 px-4 py-2 text-center text-sm text-white backdrop-blur">
      <span>This is a live preview of your site.</span>
      <a
        href="/preview"
        className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-amber-400"
      >
        Activate to publish
      </a>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-1 text-white/60 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
