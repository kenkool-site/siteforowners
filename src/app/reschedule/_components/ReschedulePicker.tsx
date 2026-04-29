"use client";

import { useRouter } from "next/navigation";
import { CustomerBookingFlow } from "@/components/templates/CustomerBookingFlow";
import type { ThemeColors } from "@/lib/templates/themes";

interface Props {
  bookingId: string;
  previewSlug: string;
  tenantId: string;
  businessName: string;
  service: { name: string; price: string; duration_minutes: number };
  customer: { name: string; phone: string; email: string };
  originalDate: string;
  originalTime: string;
  workingHours: Record<string, { open: string; close: string } | null> | null;
  blockedDates: string[];
  tokenExpiry: number;
  tokenSignature: string;
}

// Fallback neutral palette — mirrors the default in TemplateOrchestrator.getColors()
const fallbackColors: ThemeColors = {
  primary: "#B8860B",
  secondary: "#FFFDD0",
  accent: "#DAA520",
  background: "#FFF8F0",
  foreground: "#2D2017",
  muted: "#F5E6D3",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function ReschedulePicker(props: Props) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-1">{props.businessName || "Reschedule your booking"}</h1>
        <p className="text-sm text-gray-600 mb-6">Pick a new time for your appointment.</p>
        <CustomerBookingFlow
          services={[{
            name: props.service.name,
            price: props.service.price,
            durationMinutes: props.service.duration_minutes,
          }]}
          colors={fallbackColors}
          businessName={props.businessName}
          previewSlug={props.previewSlug}
          initialService={{
            name: props.service.name,
            price: props.service.price,
            durationMinutes: props.service.duration_minutes,
          }}
          initialCustomer={{
            name: props.customer.name,
            phone: props.customer.phone,
            email: props.customer.email,
          }}
          workingHours={props.workingHours}
          blockedDates={props.blockedDates}
          rescheduleMode={{
            bookingId: props.bookingId,
            originalDateLabel: dateLabel(props.originalDate),
            originalTimeLabel: props.originalTime,
            tokenExpiry: props.tokenExpiry,
            tokenSignature: props.tokenSignature,
            onDone: () => router.push("/reschedule/done"),
          }}
        />
      </div>
    </div>
  );
}
