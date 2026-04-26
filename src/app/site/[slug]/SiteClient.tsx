"use client";

import { TemplateOrchestrator } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";

interface SiteClientProps {
  data: PreviewData;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  tenantId?: string | null;
  checkoutMode?: "mockup" | "pickup";
  bookingMode?: BookingModePolicy;
}

export function SiteClient({
  data,
  bookingHours = null,
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
        tenantId={tenantId}
        checkoutMode={checkoutMode}
        bookingMode={bookingMode}
      />
    </div>
  );
}
