import Image from "next/image";

export function ScheduleSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/schedule.png"
        alt="Dashboard schedule view — bookings and open slots for the day"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 2 · Schedule
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Manage your day, set your hours.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          See every booking. Pick presets like &ldquo;Standard 10–7&rdquo; or &ldquo;Closed weekends&rdquo; — change anytime.
        </p>
      </footer>
    </article>
  );
}
