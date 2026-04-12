"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TemplateOrchestrator } from "@/components/templates";
import { GetStartedModal } from "@/components/GetStartedModal";
import type { PreviewData } from "@/lib/ai/types";

interface PreviewClientProps {
  data: PreviewData;
  slug: string;
}

export function PreviewClient({ data, slug }: PreviewClientProps) {
  const [locale, setLocale] = useState<"en" | "es">("en");
  const [viewMode, setViewMode] = useState<"mobile" | "desktop">("desktop");
  const [copied, setCopied] = useState(false);
  const [showGetStarted, setShowGetStarted] = useState(false);

  const previewUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/preview/${slug}`
      : "";

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <span className="text-sm font-bold text-gray-900">
            Site<span className="text-amber-600">ForOwners</span>
            <span className="ml-2 text-xs text-gray-400">Preview</span>
          </span>

          <div className="flex items-center gap-2">
            {/* Locale Toggle */}
            <div className="flex rounded-lg border bg-gray-50 p-0.5">
              <button
                onClick={() => setLocale("en")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  locale === "en"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLocale("es")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  locale === "es"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                ES
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="hidden rounded-lg border bg-gray-50 p-0.5 sm:flex">
              <button
                onClick={() => setViewMode("mobile")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "mobile"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Mobile
              </button>
              <button
                onClick={() => setViewMode("desktop")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "desktop"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Desktop
              </button>
            </div>

            {/* Share */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="text-xs"
            >
              {copied ? "Copied!" : "Share"}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="mx-auto py-6" style={{ maxWidth: viewMode === "mobile" ? "390px" : "100%" }}>
        <div
          className={`overflow-hidden bg-white ${
            viewMode === "mobile"
              ? "mx-4 rounded-[2rem] border-4 border-gray-800 shadow-2xl"
              : ""
          }`}
        >
          {viewMode === "mobile" && (
            <div className="flex items-center justify-center bg-gray-800 py-2">
              <div className="h-4 w-24 rounded-full bg-gray-700" />
            </div>
          )}
          <div
            className={
              viewMode === "mobile" ? "h-[700px] overflow-y-auto" : ""
            }
          >
            <TemplateOrchestrator data={data} locale={locale} />
          </div>
        </div>
      </div>

      {/* Bottom CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Love it? Go live for $50/mo
            </p>
            <p className="text-xs text-gray-500">
              We handle hosting, domain, updates — everything.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="sms:6159183580?body=Hi, I saw my website preview and I'm interested!">
              <Button variant="outline" size="sm">
                Text Us
              </Button>
            </a>
            <Button
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => setShowGetStarted(true)}
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>

      {/* Get Started Modal */}
      <GetStartedModal
        isOpen={showGetStarted}
        onClose={() => setShowGetStarted(false)}
        previewSlug={slug}
        businessName={data.business_name}
      />
    </div>
  );
}
