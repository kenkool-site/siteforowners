import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateAboutProps {
  title?: string;
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function TemplateAbout({
  title = "About Us",
  paragraphs,
  image,
  colors,
}: TemplateAboutProps) {
  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.background }}
    >
      <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
        {image && (
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
            <Image
              src={image}
              alt="About us"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        )}
        <div className={image ? "" : "md:col-span-2 md:mx-auto md:max-w-2xl"}>
          <h2
            className="mb-8 text-3xl font-bold md:text-4xl"
            style={{ color: colors.foreground }}
          >
            {title}
          </h2>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="mb-4 text-base leading-relaxed opacity-80 md:text-lg"
              style={{ color: colors.foreground }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
