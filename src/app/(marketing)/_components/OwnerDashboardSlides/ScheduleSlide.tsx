import { SlideCaption } from "./SlideCaption";

const BOTTOM_NAV = [
  { label: "Home", icon: "⌂", active: false },
  { label: "Schedule", icon: "📅", active: true },
  { label: "Services", icon: "✂", active: false },
  { label: "Updates", icon: "🔔", active: false },
  { label: "More", icon: "···", active: false },
];

const SLOTS = [
  { time: "10:00 AM", open: true, name: null, service: null, range: null },
  {
    time: "11:00 AM",
    open: false,
    name: "Ken",
    service: "Teddy Brown Set: Brown Natural Set",
    range: "11:00 AM – 12:00 PM",
  },
  { time: "12:00 PM", open: true, name: null, service: null, range: null },
  {
    time: "1:00 PM",
    open: false,
    name: "Kenneth",
    service: "Korean Lash Lift Training",
    range: "1:00 PM – 2:00 PM",
  },
  { time: "2:00 PM", open: true, name: null, service: null, range: null },
];

export function ScheduleSlide() {
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
            <h1 className="text-[11px] font-bold text-gray-900">Schedule</h1>

            {/* Day card */}
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
              <span className="text-[7px] text-gray-400">‹</span>
              <div className="text-center">
                <div className="text-[9px] font-semibold text-gray-800">
                  Friday, May 1
                </div>
                <div className="text-[7px] font-semibold text-rose-900">
                  Today
                </div>
              </div>
              <span className="text-[7px] text-gray-400">›</span>
            </div>

            {/* Bookings header */}
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[8px] font-semibold text-gray-700">
                2 bookings
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[7px] font-medium text-rose-800">
                Close this day
              </span>
            </div>

            {/* Timeline */}
            <div className="mt-1 space-y-0.5">
              {SLOTS.map((slot) => (
                <div
                  key={slot.time}
                  className="flex items-start gap-1.5 rounded px-1 py-0.5"
                >
                  <span className="w-[38px] shrink-0 text-[7px] text-gray-400">
                    {slot.time}
                  </span>
                  {slot.open ? (
                    <span className="text-[7px] italic text-gray-300">
                      Open
                    </span>
                  ) : (
                    <div className="min-w-0 flex-1 rounded border border-rose-100 bg-rose-50 px-1 py-0.5">
                      <div className="text-[7px] font-bold leading-tight text-gray-900">
                        {slot.name}
                      </div>
                      <div className="text-[6px] leading-tight text-gray-500">
                        {slot.service}
                      </div>
                      <div className="text-[6px] leading-tight text-gray-400">
                        {slot.range}
                      </div>
                    </div>
                  )}
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
        tag="Slide 2 · Schedule"
        title="Manage your day, set your hours."
        desc="See every booking. Pick presets like “Standard 10–7” or “Closed weekends” — change anytime."
      />
    </article>
  );
}
