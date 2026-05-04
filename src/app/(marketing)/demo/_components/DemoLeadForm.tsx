"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { BUSINESS_TYPES } from "@/lib/marketing-lead";

type FormState = "idle" | "submitting" | "success" | "error";

export function DemoLeadForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      source: "demo",
      businessName: String(formData.get("businessName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      businessType: String(formData.get("businessType") ?? ""),
      businessLink: String(formData.get("businessLink") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    try {
      const response = await fetch("/api/marketing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not send request.");
      }

      form.reset();
      setState("success");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  }

  return (
    <section id="request-yours" className="bg-[#100b0b] px-6 py-20 text-pop-cream">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
            Request yours
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
            Like one of these? I can build your preview next.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-pop-cream/70">
            Send the basics. I will review your business and follow up with the
            best way to turn your services, photos, and booking flow into a
            polished site.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[2rem] border border-pop-cream/15 bg-pop-cream p-5 text-warm-deep shadow-2xl md:p-7"
        >
          <div className="grid gap-4">
            <DemoField label="Business name" name="businessName" autoComplete="organization" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <DemoField label="Email" name="email" type="email" autoComplete="email" required />
              <DemoField label="Phone number" name="phone" type="tel" autoComplete="tel" required />
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
                Business type
              </span>
              <select
                name="businessType"
                required
                defaultValue=""
                className="h-12 rounded-xl border border-warm-cream1 bg-white px-4 text-sm font-semibold text-warm-text outline-none ring-pop-pink/25 transition focus:border-pop-pink focus:ring-4"
              >
                <option value="" disabled>
                  Choose one
                </option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <DemoField
              label="Instagram, website, or booking link"
              name="businessLink"
              autoComplete="url"
            />
            <label className="grid gap-1.5">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                maxLength={1200}
                className="rounded-xl border border-warm-cream1 bg-white px-4 py-3 text-sm font-medium text-warm-text outline-none ring-pop-pink/25 transition placeholder:text-warm-textMuted/50 focus:border-pop-pink focus:ring-4"
                placeholder="Tell me what you liked, what you sell, or what booking flow you use."
              />
            </label>
          </div>

          <Button
            type="submit"
            disabled={state === "submitting"}
            className="mt-6 w-full rounded-full bg-pop-pink py-6 text-base font-extrabold text-pop-cream hover:bg-pop-pink/90 disabled:opacity-70"
          >
            {state === "submitting" ? "Sending..." : "Request my preview"}
          </Button>

          {state === "success" && (
            <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Got it. I will review your details and follow up.
            </p>
          )}
          {state === "error" && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function DemoField({
  label,
  name,
  type = "text",
  autoComplete,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-warm-eyebrow">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="h-12 rounded-xl border border-warm-cream1 bg-white px-4 text-sm font-semibold text-warm-text outline-none ring-pop-pink/25 transition placeholder:text-warm-textMuted/50 focus:border-pop-pink focus:ring-4"
      />
    </label>
  );
}
