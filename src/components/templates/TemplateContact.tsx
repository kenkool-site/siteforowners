"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

interface TemplateContactProps {
  title?: string;
  subtitle?: string;
  colors: ThemeColors;
  previewMode?: boolean;
}

export function TemplateContact({
  title = "Get in Touch",
  subtitle = "Have a question? Send us a message and we'll get back to you.",
  colors,
  previewMode = false,
}: TemplateContactProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonTextColor = ensureReadable(colors.background, colors.primary, 3);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (previewMode) {
      setSubmitted(true);
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      message: fd.get("message"),
      source_page: typeof window !== "undefined" ? window.location.pathname : null,
    };

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data && data.error) || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="px-6 py-24"
      style={{ backgroundColor: colors.muted }}
    >
      <div className="mx-auto max-w-3xl">
        <h2
          className="mb-4 text-center text-3xl font-bold tracking-tight md:text-4xl"
          style={{ color: colors.foreground }}
        >
          {title}
        </h2>
        <p
          className="mx-auto mb-10 max-w-xl text-center text-lg leading-8 opacity-70"
          style={{ color: colors.foreground }}
        >
          {subtitle}
        </p>

        {submitted ? (
          <div
            className="rounded-[2rem] border p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.08)]"
            style={{ backgroundColor: colors.background, borderColor: `${colors.primary}24` }}
          >
            <p
              className="text-lg font-semibold"
              style={{ color: colors.primary }}
            >
              Thank you! We&apos;ll be in touch soon.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div
                className="mb-4 rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "#dc2626", color: "#dc2626", backgroundColor: "#fee2e2" }}
                role="alert"
              >
                {error}
              </div>
            )}
            <form
              onSubmit={handleSubmit}
              className="rounded-[2rem] border p-4 shadow-[0_24px_80px_rgba(0,0,0,0.08)] sm:p-6"
              style={{ backgroundColor: colors.background, borderColor: `${colors.primary}24` }}
            >
            <div className="grid gap-4 sm:grid-cols-2">
            <input
              type="text"
              name="name"
              placeholder="Your Name"
              required
              className="w-full rounded-[1.25rem] border px-4 py-3 text-base outline-none transition-shadow focus:ring-2 sm:col-span-2"
              style={{
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <input
              type="tel"
              name="phone"
              placeholder="Phone Number"
              className="w-full rounded-[1.25rem] border px-4 py-3 text-base outline-none transition-shadow focus:ring-2"
              style={{
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <input
              type="email"
              name="email"
              placeholder="Email (optional)"
              className="w-full rounded-[1.25rem] border px-4 py-3 text-base outline-none transition-shadow focus:ring-2"
              style={{
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <textarea
              name="message"
              placeholder="Your Message"
              rows={4}
              required
              className="w-full resize-none rounded-[1.25rem] border px-4 py-3 text-base outline-none transition-shadow focus:ring-2 sm:col-span-2"
              style={{
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            </div>
            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="mt-4 w-full rounded-full py-6 text-base font-semibold shadow-lg transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-xl"
              style={{
                backgroundColor: colors.primary,
                color: buttonTextColor,
              }}
            >
              {loading ? "Sending..." : "Send Message"}
            </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
