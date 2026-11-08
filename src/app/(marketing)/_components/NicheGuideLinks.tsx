import Link from "next/link";
import { MARKETING_GUIDES } from "@/lib/marketing-guides";

export function NicheGuideLinks() {
  return (
    <section className="bg-white px-6 py-14 md:py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl">
          Guides for braiders and stylists
        </h2>
        <ul className="mt-6 space-y-5">
          {MARKETING_GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link
                href={guide.path}
                className="font-semibold text-warm-text underline decoration-pop-pink underline-offset-4"
              >
                {guide.label}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-warm-textMuted">{guide.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
