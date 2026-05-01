import Image from "next/image";

export function LeadsSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/leads.png"
        alt="Dashboard leads view — list of customer inquiries"
        width={1280}
        height={720}
        className="h-auto w-full"
      />
      <footer className="border-t border-warm-cream1 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
          Slide 4 · Leads
        </p>
        <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
          Never miss a question.
        </h3>
        <p className="mt-1 text-xs text-warm-textMuted">
          Customers ask through your contact form. Every message lands here, with their name and number.
        </p>
      </footer>
    </article>
  );
}
