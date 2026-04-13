import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function WarmAbout({ paragraphs, image, colors }: AboutProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-8 text-center text-3xl italic font-medium md:text-4xl" style={{ color: rc.textOnBg }}>
            Our Story
          </h2>
        </AnimateSection>
        <div className="space-y-6">
          {paragraphs.map((p, i) => (
            <AnimateSection key={i} animation="fade-in" delay={i * 0.3}>
              <p className="text-base leading-loose opacity-80 md:text-lg" style={{ color: rc.textOnBg }}>
                {p}
              </p>
            </AnimateSection>
          ))}
        </div>
        {image && (
          <AnimateSection delay={0.4}>
            <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl">
              <Image src={image} alt="Our story" fill className="object-cover" sizes="100vw" unoptimized />
            </div>
          </AnimateSection>
        )}
      </div>
    </section>
  );
}
