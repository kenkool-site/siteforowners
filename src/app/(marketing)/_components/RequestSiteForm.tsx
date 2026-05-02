"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useFadeUp } from "./_motion";

const BUSINESS_TYPES = ["Braids", "Locs", "Haircuts", "Nails", "Salon"] as const;

type FormState = "idle" | "submitting" | "success" | "error";

export function RequestSiteForm() {
  const fadeUp = useFadeUp();
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      businessName: String(formData.get("businessName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      businessAddress: String(formData.get("businessAddress") ?? ""),
      businessType: String(formData.get("businessType") ?? ""),
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
    <section id="request-site" className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-start">
        <motion.div {...fadeUp}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow">
            — Request your site —
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl">
            Tell me the basics.{" "}
            <em className="text-warm-accent italic">I&rsquo;ll build the preview.</em>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-warm-textMuted">
            You do not need to create anything yourself. Send the business details,
            and I&rsquo;ll follow up with a preview link you can review.
          </p>
          <div className="mt-6 rounded-2xl border border-warm-cream1 bg-white p-5 text-sm text-warm-textMuted">
            <p className="font-bold text-warm-text">What happens next?</p>
            <ol className="mt-3 space-y-2">
              <li>1. I review your business details.</li>
              <li>2. I create a custom preview for your shop.</li>
              <li>3. You get a private link to approve or request changes.</li>
            </ol>
          </div>
        </motion.div>

        <motion.form
          {...fadeUp}
          transition={{ delay: 0.08 }}
          onSubmit={onSubmit}
          className="rounded-[1.75rem] border border-warm-cream1 bg-white p-5 shadow-xl md:p-7"
        >
          <div className="grid gap-4">
            <Field label="Business name" name="businessName" autoComplete="organization" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" name="email" type="email" autoComplete="email" required />
              <Field label="Phone number" name="phone" type="tel" autoComplete="tel" required />
            </div>
            <Field
              label="Business address (optional)"
              name="businessAddress"
              autoComplete="street-address"
            />
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-warm-eyebrow">
                Business type
              </span>
              <select
                name="businessType"
                required
                defaultValue=""
                className="h-12 rounded-xl border border-warm-cream1 bg-warm-cream2 px-4 text-sm font-medium text-warm-text outline-none ring-pop-pink/25 transition focus:border-pop-pink focus:ring-4"
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
          </div>

          <Button
            type="submit"
            disabled={state === "submitting"}
            className="mt-6 w-full rounded-full bg-pop-pink py-6 text-base font-extrabold text-pop-cream hover:bg-pop-pink/90 disabled:opacity-70"
          >
            {state === "submitting" ? "Sending..." : "Send my details"}
          </Button>

          {state === "success" && (
            <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Got it. I&rsquo;ll review the details and follow up with your preview.
            </p>
          )}
          {state === "error" && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}
        </motion.form>
      </div>
    </section>
  );
}

function Field({
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
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-warm-eyebrow">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="h-12 rounded-xl border border-warm-cream1 bg-warm-cream2 px-4 text-sm font-medium text-warm-text outline-none ring-pop-pink/25 transition placeholder:text-warm-textMuted/50 focus:border-pop-pink focus:ring-4"
      />
    </label>
  );
}
