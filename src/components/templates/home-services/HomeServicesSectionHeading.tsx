import type { HomeServicesLocale, HomeServicesSectionCopy } from "@/lib/home-services/types";

export function HomeServicesSectionHeading({ id, copy, locale, color }: { id: string; copy: Required<HomeServicesSectionCopy>; locale: HomeServicesLocale; color: string }) {
  const suffix = locale === "es" ? "es" : "en";
  return <header className="mb-8 max-w-3xl">
    <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70" style={{ color }}>{copy[`eyebrow_${suffix}`]}</p>
    <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color }}>{copy[`title_${suffix}`]}</h2>
    <p className="mt-3 text-base leading-relaxed opacity-80" style={{ color }}>{copy[`intro_${suffix}`]}</p>
  </header>;
}
