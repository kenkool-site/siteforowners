import Image from "next/image";

export function ServicesSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/services.png"
        alt="Dashboard services view — service list with deposit policy"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 3 · Services
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Update prices and deposits anytime.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          Add a service, change a price, set a deposit policy — saves instantly to your live site.
        </p>
      </footer>
    </article>
  );
}
