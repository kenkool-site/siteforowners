"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewSlug: string;
  businessName: string;
}

export function GetStartedModal({
  isOpen,
  onClose,
  previewSlug,
  businessName,
}: GetStartedModalProps) {
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !phone.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_slug: previewSlug,
          business_name: businessName,
          owner_name: ownerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or text us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-t-2xl bg-white px-6 py-8 text-center shadow-2xl sm:rounded-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">
            We&apos;ll be in touch!
          </h2>
          <p className="mb-6 text-sm text-gray-600">
            Thanks {ownerName.split(" ")[0]}! We&apos;ll call you within 24 hours to get your website live. If you need anything sooner, text us anytime.
          </p>
          <a
            href="sms:6159183580?body=Hi, I'm interested in getting my website live!"
            className="mb-3 block"
          >
            <Button className="w-full bg-amber-600 text-white hover:bg-amber-700">
              Text Us Now
            </Button>
          </a>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-6 py-8 shadow-2xl sm:rounded-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="mb-1 text-xl font-bold text-gray-900">
          Let&apos;s get you live
        </h2>
        <p className="mb-6 text-sm text-gray-600">
          Tell us how to reach you and we&apos;ll have your website up within 48 hours. No setup fee, cancel anytime.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Your Name *
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Maria Rodriguez"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Phone Number *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(718) 555-0123"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <p className="mt-1 text-xs text-gray-400">
              We&apos;ll call or text you — whichever you prefer
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@email.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Anything else? <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. I'd like to use my own domain name, or I need it by next week"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !ownerName.trim() || !phone.trim()}
            className="w-full rounded-lg bg-amber-600 py-6 text-base font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Get My Website Live"}
          </Button>

          <p className="text-center text-xs text-gray-400">
            $50/month &middot; No contracts &middot; Cancel anytime
          </p>
        </form>
      </div>
    </div>
  );
}
