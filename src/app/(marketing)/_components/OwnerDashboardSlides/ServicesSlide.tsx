import { SlideCaption } from "./SlideCaption";

const BOTTOM_NAV = [
  { label: "Home", icon: "⌂", active: false },
  { label: "Schedule", icon: "📅", active: false },
  { label: "Services", icon: "✂", active: true },
  { label: "Updates", icon: "🔔", active: false },
  { label: "More", icon: "···", active: false },
];

const SERVICE_ROWS = [
  { name: "Korean Lash Lift Training", duration: "1h", price: "$1,200" },
  { name: "Eye Brow Lamination", duration: "1h", price: "$120" },
  { name: "Brow Lamination + Eye Brow Tinting", duration: "1h", price: "$115" },
  { name: "Natural Set Light", duration: "1h", price: "$90" },
];

export function ServicesSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      {/* Mockup viewport */}
      <div className="flex aspect-[16/10] items-center justify-center bg-gray-100 px-4 py-3">
        {/* Phone frame */}
        <div className="flex h-full max-w-[240px] w-full flex-col overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-xl">

          {/* Top bar — burgundy */}
          <div className="flex shrink-0 items-center gap-1 bg-rose-900 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[8px] font-semibold text-white">
              Mariam&rsquo;s Professional Afri&hellip;
            </span>
            <span className="shrink-0 rounded-full border border-rose-300 px-1.5 py-0.5 text-[7px] font-medium text-rose-100">
              View site ↗
            </span>
            <span className="shrink-0 text-[9px] text-rose-200">✉</span>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden bg-white px-2 pt-2 pb-1">
            {/* Page heading */}
            <div className="flex items-baseline justify-between">
              <h1 className="text-[11px] font-bold text-gray-900">Services</h1>
              <span className="text-[7px] text-gray-400">34 services</span>
            </div>

            {/* Add category button */}
            <div className="mt-1.5">
              <span className="rounded-full bg-rose-900 px-2 py-0.5 text-[7px] font-semibold text-white">
                + Add category
              </span>
            </div>

            {/* Add booking policies card */}
            <div className="mt-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-2 py-1">
              <div className="text-[7px] font-medium text-gray-500">
                + Add booking policies
              </div>
              <div className="text-[6px] leading-tight text-gray-400">
                Deposit, lateness, reschedule rules — shown to customers when
                they pick a time.
              </div>
            </div>

            {/* Deposit card */}
            <div className="mt-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2 py-1">
              <div className="flex items-start justify-between">
                <span className="text-[7px] font-bold uppercase tracking-wide text-rose-900">
                  Deposit
                </span>
                <span className="text-[7px] text-rose-700 underline">
                  Edit
                </span>
              </div>
              <div className="mt-0.5 text-[7px] font-semibold text-gray-800">
                $40 required (flat) · 2 payment methods
              </div>
            </div>

            {/* Add service button */}
            <div className="mt-1.5">
              <span className="rounded-full bg-rose-900 px-2 py-0.5 text-[7px] font-semibold text-white">
                + Add service
              </span>
            </div>

            {/* Service rows */}
            <div className="mt-1 space-y-0.5">
              {SERVICE_ROWS.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center gap-1.5 rounded border border-gray-100 bg-white px-1.5 py-1"
                >
                  {/* Thumbnail placeholder */}
                  <div className="h-5 w-5 shrink-0 rounded bg-rose-100" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[7px] font-semibold leading-tight text-gray-900">
                      {svc.name}
                    </div>
                    <div className="text-[6px] text-gray-400">
                      {svc.duration} · {svc.price}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom nav */}
          <div className="shrink-0 flex items-center justify-around border-t border-gray-200 bg-white px-1 py-1">
            {BOTTOM_NAV.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-0.5"
              >
                <span
                  className={`text-[9px] ${item.active ? "text-rose-900" : "text-gray-400"}`}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[5px] font-medium ${item.active ? "font-bold text-rose-900" : "text-gray-400"}`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SlideCaption
        tag="Slide 3 · Services"
        title="Update prices and deposits anytime."
        desc="Add a service, change a price, set a deposit policy — saves instantly to your live site."
      />
    </article>
  );
}
