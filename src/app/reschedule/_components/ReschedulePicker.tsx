"use client";

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

export function ReschedulePicker(_props: Props) { // eslint-disable-line @typescript-eslint/no-unused-vars
  return <div className="p-8 text-center">Reschedule picker — wired in Task 8.</div>;
}
