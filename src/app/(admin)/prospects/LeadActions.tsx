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
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOnboard = async () => {
    setLoading(true);
    setError(null);
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
          promo_code: promoCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setPaymentUrl(data.checkout_url);
      setShortUrl(data.short_url || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setLoading(false);
    }
  };

  // Short URL is always preferred for sharing — it's branded and fits in SMS.
  const shareUrl = shortUrl || paymentUrl;

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstName = ownerName.split(" ")[0];
  const smsBody = shareUrl
    ? `Hi ${firstName}, your website for ${businessName} is ready! Complete signup here: ${shareUrl}`
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
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Promo (opt)"
            className="w-24 rounded-lg border px-2 py-1.5 text-xs uppercase placeholder:normal-case placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
            title="Optional Stripe promo code, e.g. STYLIST40. Leave empty for full $50/mo."
          />
          <button
            onClick={handleOnboard}
            disabled={loading}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "..." : "Onboard"}
          </button>
          {error && (
            <span className="text-xs text-red-600" title={error}>
              ⚠ {error.length > 40 ? error.slice(0, 40) + "..." : error}
            </span>
          )}
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
