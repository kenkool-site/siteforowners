import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function ElegantAbout({ paragraphs, colors }: AboutProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-xl text-center">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-light md:text-4xl" style={{ color: rc.textOnBg }}>
            Our Story
          </h2>
        </AnimateSection>
        {paragraphs.map((p, i) => (
          <AnimateSection key={i} animation="fade-in" delay={i * 0.2}>
            <p className="mb-6 text-base leading-loose opacity-70 md:text-lg" style={{ color: rc.textOnBg }}>
              {i === 0 ? (
                <>
                  <span className="float-left mr-2 text-5xl font-light leading-none" style={{ color: rc.primaryOnBg }}>
                    {p.charAt(0)}
                  </span>
                  {p.slice(1)}
                </>
              ) : (
                p
              )}
            </p>
          </AnimateSection>
        ))}
      </div>
    </section>
  );
}
