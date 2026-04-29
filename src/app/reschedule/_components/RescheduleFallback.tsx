"use client";

interface Props {
  reason:
    | "invalid_token"
    | "expired"
    | "not_found"
    | "inactive"
    | "already_rescheduled"
    | "inside_24h";
  businessPhone?: string;
  businessName?: string;
}

const COPY: Record<Props["reason"], { title: string; body: string }> = {
  invalid_token: {
    title: "Link not recognized",
    body: "This reschedule link looks tampered with or didn't come from us.",
  },
  expired: {
    title: "Link expired",
    body: "This link is for a booking that has already passed.",
  },
  not_found: {
    title: "Booking not found",
    body: "We couldn't find this booking — it may have been canceled.",
  },
  inactive: {
    title: "Booking no longer active",
    body: "This booking has already been canceled or completed.",
  },
  already_rescheduled: {
    title: "Already rescheduled",
    body: "You've already rescheduled this booking once. To make another change, please call.",
  },
  inside_24h: {
    title: "Too close to your appointment",
    body: "Online reschedule isn't available within 24 hours of your booking. Please call to make a change.",
  },
};

export function RescheduleFallback({ reason, businessPhone, businessName }: Props) {
  const { title, body } = COPY[reason];
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">📅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-600 mb-6">{body}</p>
        {businessPhone && (
          <a
            href={`tel:${businessPhone}`}
            className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
          >
            Call {businessName || "us"}: {businessPhone}
          </a>
        )}
      </div>
    </div>
  );
}
