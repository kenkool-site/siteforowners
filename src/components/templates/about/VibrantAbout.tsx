import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function VibrantAbout({ paragraphs, colors }: AboutProps) {
  const highlight = paragraphs[0] || "";
  const rest = paragraphs.slice(1);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-5xl md:grid md:grid-cols-5 md:gap-8">
        <AnimateSection animation="slide-left" className="md:col-span-2">
          <div className="mb-8 rounded-2xl p-8 md:mb-0" style={{ backgroundColor: `${colors.primary}10` }}>
            <p className="text-xl font-bold leading-relaxed md:text-2xl" style={{ color: colors.primary }}>
              &ldquo;{highlight}&rdquo;
            </p>
          </div>
        </AnimateSection>
        <AnimateSection animation="slide-right" className="md:col-span-3">
          <div>
            <h2 className="mb-6 text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
              About Us
            </h2>
            {rest.map((p, i) => (
              <p key={i} className="mb-4 text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.foreground }}>
                {p}
              </p>
            ))}
            {rest.length === 0 && (
              <p className="text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.foreground }}>
                {highlight}
              </p>
            )}
          </div>
        </AnimateSection>
      </div>
    </section>
  );
}
