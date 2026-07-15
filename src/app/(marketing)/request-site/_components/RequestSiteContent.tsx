"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useFadeUp } from "../../_components/_motion";

const BUSINESS_TYPES = [
  "Braids",
  "Locs",
  "Haircuts",
  "Nails",
  "Salon",
  "Outdoor / home services",
] as const;

const TRUST_CUES = ["Free preview", "About 2 minutes", "No card up front"] as const;

const STEPS = [
  {
    title: "You send the basics",
    detail: "Business name, contact info, and what you do. That's it.",
  },
  {
    title: "I build a custom preview",
    detail: "A real website for your shop — your services, your area, ready to book.",
  },
  {
    title: "You review a private link",
    detail: "Approve it, ask for changes, or walk away. No commitment.",
  },
] as const;

type FormState = "idle" | "submitting" | "success" | "error";

export function RequestSiteContent() {
  const fadeUp = useFadeUp();

  return (
    <>
      <section className="px-6 pb-4 pt-12 text-center md:pb-6 md:pt-16">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow">
            — Request your site —
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-warm-text md:text-5xl">
            Tell me the basics.{" "}
            <em className="text-warm-accent italic">I&rsquo;ll build the preview.</em>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-warm-textMuted md:text-base">
            No tech setup on your end. Send your business details and you&rsquo;ll get
            a private preview link to review.
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {TRUST_CUES.map((cue) => (
              <li
                key={cue}
                className="rounded-full border border-warm-cream1 bg-white px-3.5 py-1.5 text-xs font-bold text-warm-textMuted"
              >
                {cue}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      <section className="px-6 pb-16 pt-8 md:pb-20">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-start">
          <motion.div {...fadeUp}>
            <h2 className="font-serif text-2xl font-semibold text-warm-text">
              What happens next?
            </h2>
            <ol className="mt-5 space-y-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pop-pink text-sm font-extrabold text-pop-cream">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold text-warm-text">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-warm-textMuted">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-7 rounded-2xl border border-warm-cream1 bg-white p-5 text-sm leading-relaxed text-warm-textMuted">
              <p className="font-bold text-warm-text">Prefer to talk it through first?</p>
              <p className="mt-2">
                Send the form anyway — I personally follow up on every request, so you
                can ask questions before anything gets built.
              </p>
            </div>
          </motion.div>

          <RequestSiteForm />
        </div>
      </section>
    </>
  );
}

function RequestSiteForm() {
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
