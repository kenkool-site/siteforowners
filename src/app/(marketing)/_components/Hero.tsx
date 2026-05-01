import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroShowcase } from "./HeroShowcase";

const TEXT_US_HREF = process.env.NEXT_PUBLIC_TEXT_US_URL ?? "";

export function Hero() {
  return (
    <section className="bg-pop-pink px-6 py-16 text-pop-cream md:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] opacity-90">
            For salons, barbers, nail shops
          </p>
          <h1 className="font-sans text-4xl font-black leading-[0.98] tracking-tight md:text-6xl">
            Get booked without the back-and-forth.
          </h1>
          <p className="mt-4 text-base leading-snug opacity-95 md:text-lg">
            We build your website + booking and get you live in 24 hours.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-black px-6 py-5 text-sm font-bold text-pop-cream hover:bg-black/85"
            >
              <Link href="/preview">Create My Free Preview →</Link>
            </Button>
            {TEXT_US_HREF && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-2 border-pop-cream bg-transparent px-6 py-5 text-sm font-bold text-pop-cream hover:bg-pop-cream/10"
              >
                <a href={TEXT_US_HREF} target="_blank" rel="noopener noreferrer">Text us</a>
              </Button>
            )}
          </div>
        </div>
        <HeroShowcase />
      </div>
    </section>
  );
}
