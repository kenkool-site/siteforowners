import { SlideCaption } from "./SlideCaption";

const BOTTOM_NAV = [
  { label: "Home", icon: "⌂", active: false },
  { label: "Schedule", icon: "📅", active: false },
  { label: "Services", icon: "✂", active: false },
  { label: "Leads", icon: "✉", active: true },
  { label: "More", icon: "···", active: false },
];

const LEADS = [
  {
    name: "Jasmine",
    isNew: true,
    phone: "(814) 379-8925",
    email: "customer94@email.com",
    ago: "2 days ago",
    message:
      "How long is the wait for a knotless braids appointment? My event is in 2 weeks.",
    source: "FROM /SERVICES",
  },
  {
    name: "Brianna",
    isNew: true,
    phone: "(699) 850-7390",
    email: "customer91@email.com",
    ago: "5 days ago",
    message:
      "Do you do bridal trials? Getting married in October and looking for a stylist.",
    source: null,
  },
  {
    name: "Aaliyah",
    isNew: false,
    phone: "(773) 257-1918",
    email: "customer80@email.com",
    ago: "5 days ago",
    message: "What’s your cancellation policy? Trying to plan ahead.",
    source: "FROM /",
  },
];

export function LeadsSlide() {
  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      {/* Mockup viewport */}
      <div className="flex aspect-[16/10] items-center justify-center bg-gray-100 px-4 py-3">
        {/* Phone frame */}
        <div className="flex h-full max-w-[240px] w-full flex-col overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-xl">

          {/* Top bar — violet */}
          <div className="flex shrink-0 items-center gap-1 bg-violet-600 px-2 py-1.5">
            <span className="min-w-0 flex-1 text-[8px] font-semibold text-white">
              TouchedbyDrea
            </span>
            <span className="shrink-0 rounded-full border border-violet-300 px-1.5 py-0.5 text-[7px] font-medium text-violet-100">
              ← Preview
            </span>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden bg-white px-2 pt-2 pb-1">
            {/* Page heading */}
            <div className="flex items-baseline justify-between">
              <h1 className="text-[11px] font-bold text-gray-900">Leads</h1>
              <span className="text-[7px] text-gray-400">5 total</span>
            </div>

            {/* Lead cards */}
            <div className="mt-1.5 space-y-1">
              {LEADS.map((lead) => (
                <div
                  key={lead.name}
                  className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold text-gray-900">
                          {lead.name}
                        </span>
                        {lead.isNew && (
                          <span className="rounded-full bg-violet-600 px-1 py-0.5 text-[5px] font-bold uppercase tracking-wide text-white">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="text-[6px] leading-tight text-gray-500">
                        {lead.phone} · {lead.email}
                      </div>
                    </div>
                    <span className="shrink-0 text-[6px] text-gray-400">
                      {lead.ago}
                    </span>
                  </div>
                  {/* Message body */}
                  <p className="mt-0.5 text-[6px] leading-tight text-gray-600">
                    {lead.message}
                  </p>
                  {/* Source footer */}
                  {lead.source && (
                    <div className="mt-0.5 text-[5px] font-semibold uppercase tracking-widest text-gray-400">
                      {lead.source}
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
                  className={`text-[9px] ${item.active ? "text-violet-600" : "text-gray-400"}`}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[5px] font-medium ${item.active ? "font-bold text-violet-600" : "text-gray-400"}`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SlideCaption
        tag="Slide 4 · Leads"
        title="Never miss a question."
        desc="Customers ask through your contact form. Every message lands here, with their name and number."
      />
    </article>
  );
}
