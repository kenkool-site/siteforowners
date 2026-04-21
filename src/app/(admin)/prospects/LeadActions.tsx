"use client";

import { useState } from "react";

interface LeadActionsProps {
  leadId: string;
  previewSlug: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string | null;
  converted: boolean;
}

export function LeadActions({
  leadId,
  previewSlug,
  businessName,
  ownerName,
  phone,
  email,
  converted,
}: LeadActionsProps) {
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleOnboard = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          preview_slug: previewSlug,
          business_name: businessName,
          owner_name: ownerName,
          email: email || undefined,
          phone,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPaymentUrl(data.checkout_url);
    } catch {
      alert("Failed to create payment link. Is Stripe configured?");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!paymentUrl) return;
    await navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstName = ownerName.split(" ")[0];
  const smsBody = paymentUrl
    ? `Hi ${firstName}, your website for ${businessName} is ready! Complete signup here: ${paymentUrl}`
    : `Hi ${firstName}, this is SiteForOwners — I saw you're interested in a website for ${businessName}. Let me know when you'd like to chat!`;

  if (converted) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
        Converted
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={`/preview/${previewSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Preview
      </a>
      <a
        href={`/previews/${previewSlug}/edit`}
        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Edit
      </a>

      {!paymentUrl ? (
        <>
          <a
            href={`sms:${phone}?body=${encodeURIComponent(smsBody)}`}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            Text
          </a>
          <button
            onClick={handleOnboard}
            disabled={loading}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "..." : "Onboard"}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={copyLink}
            className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <a
            href={`sms:${phone}?body=${encodeURIComponent(smsBody)}`}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            Send via Text
          </a>
        </>
      )}
    </div>
  );
}
