"use client";

import { TemplateOrchestrator } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";

interface SiteClientProps {
  data: PreviewData;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  blockedDates?: string[];
  tenantId?: string | null;
  checkoutMode?: "mockup" | "pickup";
  bookingMode?: BookingModePolicy;
}

export function SiteClient({
  data,
  bookingHours = null,
  blockedDates = [],
  tenantId = null,
  checkoutMode = "mockup",
  bookingMode = "in_site_only",
}: SiteClientProps) {
  // Published site — no preview chrome, just the raw template
  return (
    <div className="min-h-screen">
      <TemplateOrchestrator
        data={data}
        locale="en"
        isLive
        bookingHours={bookingHours}
        blockedDates={blockedDates}
        tenantId={tenantId}
        checkoutMode={checkoutMode}
        bookingMode={bookingMode}
      />
    </div>
  );
}
