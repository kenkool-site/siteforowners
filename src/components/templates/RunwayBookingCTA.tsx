"use client";

import { Button } from "@/components/ui/button";

export function RunwayBookingCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-r from-[#D8B255] to-[#8F6D22] px-6 py-14 text-black md:px-10 lg:px-16">
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.32)_0,transparent_34%,transparent_64%,rgba(0,0,0,0.18)_100%)]" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-7 md:flex-row md:items-center md:justify-between">
        <h2 className="max-w-3xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] sm:text-6xl md:text-7xl">
          Ready for the chair?
        </h2>
        <Button
          size="lg"
          className="rounded-none border border-black bg-black px-10 py-7 text-xs font-black uppercase tracking-[0.28em] text-[#FFF4D8] shadow-[0_0_38px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-1 hover:bg-black hover:text-white hover:shadow-[0_0_48px_rgba(0,0,0,0.34)]"
          asChild
        >
          <a href="#booking">Book Now</a>
        </Button>
      </div>
    </section>
  );
}
