import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateMapProps {
  address?: string;
  colors: ThemeColors;
}

export function TemplateMap({ address, colors }: TemplateMapProps) {
  if (!address) return null;

  const mapQuery = encodeURIComponent(address);

  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.background }}
    >
      <div className="mx-auto max-w-4xl">
        <h2
          className="mb-8 text-center text-3xl font-bold md:text-4xl"
          style={{ color: colors.foreground }}
        >
          Find Us
        </h2>
        <p
          className="mb-6 text-center text-lg opacity-70"
          style={{ color: colors.foreground }}
        >
          {address}
        </p>
        <div className="overflow-hidden rounded-xl">
          <iframe
            title="Business Location"
            src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${mapQuery}`}
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
