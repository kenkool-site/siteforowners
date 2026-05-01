"use client";

import { motion } from "framer-motion";
import { useFadeUp } from "./_motion";

const VERTICALS = [
  {
    label: "Locs",
    eyebrow: "letstrylocs.com",
    headline: "Your go-to loc stylist in Brooklyn.",
    accent: "bg-pink-600",
    tint: "bg-pink-50",
    service: "Retwist & Style",
    price: "$140",
  },
  {
    label: "Barber",
    eyebrow: "mikescuts.com",
    headline: "Fresh cuts booked before the chair is open.",
    accent: "bg-amber-500",
    tint: "bg-amber-50",
    service: "Skin fade",
    price: "$45",
  },
  {
    label: "Nails",
    eyebrow: "nailbyhoneyspa.com",
    headline: "Nails that stop traffic.",
    accent: "bg-fuchsia-500",
    tint: "bg-fuchsia-50",
    service: "Gel set",
    price: "$75",
  },
] as const;

const FLOW_STEPS = [
  { title: "Message", detail: "Can I book Friday?" },
  { title: "Pick service", detail: "Retwist & Style" },
  { title: "Choose time", detail: "Fri, 11:00 AM" },
  { title: "Confirmed", detail: "Text sent" },
] as const;

export function CustomerView() {
  const fadeUp = useFadeUp();

  return (
    <section id="examples" className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          {...fadeUp}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What customers see —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          A site that <em className="text-warm-accent italic">looks like your shop.</em>
        </motion.h2>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.1 }}
          style={{ transform: "rotate(-1.5deg)" }}
          className="relative mt-8 overflow-hidden rounded-[2rem] bg-slate-950 p-3 shadow-2xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(236,72,153,0.35),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(251,191,36,0.24),transparent_28%)]" />
          <div className="relative grid gap-3 rounded-[1.5rem] border border-white/10 bg-white p-3 md:grid-cols-[0.82fr_1fr]">
            <RenderedPhonePreview vertical={VERTICALS[0]} featured />
            <div className="flex flex-col justify-between rounded-2xl bg-slate-950 p-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-200">
                  Customer journey
                </p>
                <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight">
                  From &ldquo;are you free?&rdquo; to booked without another app.
                </h3>
              </div>
              <div className="mt-5 grid gap-2">
                {FLOW_STEPS.map((step, i) => (
                  <motion.div
                    key={step.title}
                    {...fadeUp}
                    transition={{ delay: 0.2 + i * 0.06 }}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 p-3"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 text-xs font-black">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-xs font-black">{step.title}</span>
                      <span className="block text-[11px] text-white/60">{step.detail}</span>
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {VERTICALS.map((v, i) => (
            <motion.li
              key={v.label}
              {...fadeUp}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="overflow-hidden rounded-2xl border border-warm-cream2 bg-white shadow-sm"
            >
              <RenderedPhonePreview vertical={v} />
              <p className="border-t border-warm-cream2 px-3 py-2 text-center text-[11px] font-semibold text-warm-text">
                {v.label} preview
              </p>
            </motion.li>
          ))}
        </ul>

        <p className="mt-4 text-center text-xs italic text-warm-textMuted">
          Mobile-first. Bilingual. Yours to own.
        </p>
      </div>
    </section>
  );
}

function RenderedPhonePreview({
  vertical,
  featured = false,
}: {
  vertical: (typeof VERTICALS)[number];
  featured?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white ${
        featured ? "min-h-[430px]" : "min-h-[300px]"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="h-8 w-8 rounded-full bg-slate-800 text-center text-lg font-black leading-8 text-white">
          =
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
          English / Espanol
        </span>
      </div>

      <div className={`relative overflow-hidden ${vertical.tint} px-5 py-7`}>
        <div className={`absolute -right-8 -top-10 h-28 w-28 rounded-full ${vertical.accent} opacity-20 blur-2xl`} />
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {vertical.eyebrow}
        </p>
        <h3 className="mx-auto mt-4 max-w-xs text-center font-sans text-2xl font-black leading-tight text-slate-950">
          {vertical.headline}
        </h3>
        <div className="mx-auto mt-5 h-28 max-w-[220px] rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-700 to-slate-400 shadow-inner" />
        <div className={`mx-auto mt-5 max-w-[180px] rounded-full px-5 py-3 text-center text-sm font-black text-white shadow-lg ${vertical.accent}`}>
          Book now
        </div>
      </div>

      <div className="space-y-3 p-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl bg-pink-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">
                  {i === 0 ? vertical.service : "Consultation"}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Customers pick a service, time, and confirm in minutes.
                </p>
              </div>
              <span className="text-sm font-black text-pink-600">
                {i === 0 ? vertical.price : "Free"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
