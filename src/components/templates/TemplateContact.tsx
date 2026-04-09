"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (previewMode) {
      setSubmitted(true);
      return;
    }
    // TODO: Wire to /api/leads in Week 2
    setSubmitted(true);
  };

  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.muted }}
    >
      <div className="mx-auto max-w-xl">
        <h2
          className="mb-4 text-center text-3xl font-bold md:text-4xl"
          style={{ color: colors.foreground }}
        >
          {title}
        </h2>
        <p
          className="mb-10 text-center text-lg opacity-70"
          style={{ color: colors.foreground }}
        >
          {subtitle}
        </p>

        {submitted ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ backgroundColor: colors.background }}
          >
            <p
              className="text-lg font-semibold"
              style={{ color: colors.primary }}
            >
              Thank you! We&apos;ll be in touch soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              required
              className="w-full rounded-lg border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <input
              type="tel"
              placeholder="Phone Number"
              className="w-full rounded-lg border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <input
              type="email"
              placeholder="Email (optional)"
              className="w-full rounded-lg border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <textarea
              placeholder="Your Message"
              rows={4}
              required
              className="w-full resize-none rounded-lg border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.primary + "40",
              }}
            />
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-lg py-6 text-base font-semibold"
              style={{
                backgroundColor: colors.primary,
                color: colors.background,
              }}
            >
              Send Message
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
