"use client";

import { useState } from "react";
import { invitationPublicUrl } from "@/lib/invitations/public-url";

export function InvitationCopyLinkButton({ slug, publicSubdomain, label = "Copy link", copiedLabel = "Copied" }: { slug: string; publicSubdomain?: string | null; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(invitationPublicUrl({ slug, publicSubdomain: publicSubdomain ?? null }, window.location.origin));
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="font-medium text-gray-600 underline-offset-4 hover:text-gray-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
