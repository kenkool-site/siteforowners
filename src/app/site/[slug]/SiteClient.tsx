"use client";

import { TemplateOrchestrator } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { DemoCtaBanner } from "./DemoCtaBanner";

interface SiteClientProps {
  data: PreviewData;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  blockedDates?: string[];
  tenantId?: string | null;
  isDemo?: boolean;
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
  isDemo = false,
  checkoutMode = "mockup",
  bookingMode = "in_site_only",
  depositSettings,
}: SiteClientProps) {
  // Published site — no preview chrome, just the raw template
  return (
    <div className="min-h-screen">
      {isDemo && (
        <DemoCtaBanner activateUrl={`https://siteforowners.com/preview/${data.slug ?? ""}`} />
      )}
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
