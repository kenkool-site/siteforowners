import Link from "next/link";
import { MarketingBrandLogo } from "@/components/MarketingBrandLogo";
import { Button } from "@/components/ui/button";
import { DemoPortfolioCard } from "./DemoPortfolioCard";

const PORTFOLIO_CARDS = [
  {
    category: "Nails",
    title: "Polished service menus that feel premium on mobile.",
    accent: "bg-pop-pink",
    tone: "from-pink-500/35 to-rose-950",
    action: "Book a gel set",
    images: [
      "/marketing/demo/portfolio/nails-1.jpeg",
      "/marketing/demo/portfolio/nails-2.jpeg",
      "/marketing/demo/portfolio/nails-3.jpeg",
      "/marketing/demo/portfolio/nails-4.png",
    ],
  },
  {
    category: "Locs / hair",
    title: "Beautiful service pages for styles, maintenance, and add-ons.",
    accent: "bg-amber-400",
    tone: "from-amber-400/30 to-stone-950",
    action: "Choose retwist",
  },
  {
    category: "Lashes / brows",
    title: "Soft, high-trust booking flows for repeat beauty clients.",
    accent: "bg-fuchsia-300",
    tone: "from-fuchsia-300/30 to-neutral-950",
    action: "Reserve refill",
  },
  {
    category: "Barber / grooming",
    title: "Fast booking for cuts, fades, beard work, and packages.",
    accent: "bg-orange-400",
    tone: "from-orange-400/30 to-zinc-950",
    action: "Pick a time",
  },
  {
    category: "Spa / skincare",
    title: "Calm, editorial pages that make services easy to understand.",
    accent: "bg-emerald-300",
    tone: "from-emerald-300/30 to-slate-950",
    action: "View treatments",
  },
] as const;

const JOURNEY_STEPS = [
  "Clients land on a beautiful site",
  "They choose a service and book",
  "You manage bookings and leads",
] as const;

const DASHBOARD_STATS = [
  ["28", "visits this week"],
  ["7", "new leads"],
  ["4", "bookings today"],
  ["12", "services managed"],
] as const;

export function DemoShowcase() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#100b0b] px-6 pb-16 pt-8 text-pop-cream md:pb-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(219,39,119,0.35),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,248,238,0.18),transparent_30%)]" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <MarketingBrandLogo
            href="/"
            heightClass="h-16"
            linkClassName="rounded-xl ring-offset-[#100b0b]"
          />
          <Button
            asChild
            className="rounded-full bg-pop-cream px-5 py-5 text-sm font-black text-warm-deep hover:bg-pop-cream/90"
          >
            <Link href="#request-yours">Request yours</Link>
          </Button>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              Beauty portfolio reel
            </p>
            <h1 className="mt-5 font-serif text-5xl font-semibold leading-[0.9] tracking-[-0.05em] md:text-7xl">
              Beauty websites that make clients book.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-pop-cream/75 md:text-lg">
              Custom sites, booking, and owner tools for beauty businesses that
              need to look polished the second a client opens the link.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-pop-pink px-7 py-6 text-sm font-black text-pop-cream hover:bg-pop-pink/90"
              >
                <Link href="#request-yours">Like this? Request yours</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-pop-cream/35 bg-transparent px-7 py-6 text-sm font-black text-pop-cream hover:bg-pop-cream/10"
              >
                <Link href="#examples">See examples</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-pop-pink/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-pop-cream/15 bg-black shadow-2xl">
              <video
                className="aspect-[4/5] w-full object-cover opacity-90 motion-reduce:hidden md:aspect-[3/4]"
                src="/marketing/demo/demo-reel.mp4"
                poster="/marketing/demo/demo-reel-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                aria-label="Looping beauty website and booking demo reel"
              />
              <div
                aria-hidden="true"
                className="hidden aspect-[4/5] w-full bg-gradient-to-br from-pop-pink via-rose-900 to-black motion-reduce:block md:aspect-[3/4]"
              />
              <div className="absolute left-4 top-4 max-w-[15rem] rounded-2xl border border-white/15 bg-black/55 px-4 py-3 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-cream/65">
                  Customer view first
                </p>
                <p className="mt-1 text-sm font-black leading-tight text-pop-cream">
                  Site to booking to dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="examples" className="bg-pop-cream px-6 py-20 text-warm-deep">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              Portfolio examples
            </p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
              A different look for every beauty brand.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PORTFOLIO_CARDS.map((card, index) => (
              <DemoPortfolioCard
                key={card.category}
                category={card.category}
                title={card.title}
                accent={card.accent}
                tone={card.tone}
                action={card.action}
                images={"images" in card ? card.images : undefined}
                featured={index === 0}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#160f0e] px-6 py-20 text-pop-cream">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pop-pink">
              How it works
            </p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-none md:text-5xl">
              Pretty on the outside. Useful behind the scenes.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {JOURNEY_STEPS.map((item, index) => (
              <div
                key={item}
                className="rounded-[1.5rem] border border-pop-cream/15 bg-pop-cream/5 p-5"
              >
                <p className="text-sm font-black text-pop-pink">0{index + 1}</p>
                <p className="mt-8 text-xl font-black leading-tight">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-6xl rounded-[2rem] border border-pop-cream/15 bg-pop-cream p-5 text-warm-deep md:p-7">
          <div className="grid gap-4 md:grid-cols-4">
            {DASHBOARD_STATS.map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-warm-cream1 bg-white p-5">
                <p className="text-4xl font-black">{value}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-warm-textMuted">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
