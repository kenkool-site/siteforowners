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
  depositSettings?: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_cashapp: string | null;
    deposit_zelle: string | null;
    deposit_other_label: string | null;
    deposit_other_value: string | null;
  };
}

export function SiteClient({
  data,
  bookingHours = null,
  blockedDates = [],
  tenantId = null,
  checkoutMode = "mockup",
  bookingMode = "in_site_only",
  depositSettings,
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
        depositSettings={depositSettings}
      />
    </div>
  );
}
