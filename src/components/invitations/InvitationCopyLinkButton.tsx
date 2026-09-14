"use client";

import { useState } from "react";

export function InvitationCopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${slug}`);
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="font-medium text-gray-600 underline-offset-4 hover:text-gray-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
