"use client";

import { TemplateRouter } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { DemoCtaBanner } from "./DemoCtaBanner";

interface SiteClientProps {
  data: PreviewData;
  locale: "en" | "es";
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
  /** When true (the /booking entry point), auto-open the in-site booking flow. */
  autoOpenBooking?: boolean;
}

export function SiteClient({
  data,
  locale,
  bookingHours = null,
  blockedDates = [],
  tenantId = null,
  isDemo = false,
  checkoutMode = "mockup",
  bookingMode = "in_site_only",
  depositSettings,
  autoOpenBooking = false,
}: SiteClientProps) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      {isDemo && (
        <DemoCtaBanner activateUrl={`https://siteforowners.com/preview/${data.slug ?? ""}`} />
      )}
      <TemplateRouter
        data={data}
        locale={locale}
        isLive
        bookingHours={bookingHours}
        blockedDates={blockedDates}
        tenantId={tenantId}
        checkoutMode={checkoutMode}
        bookingMode={bookingMode}
        depositSettings={depositSettings}
        autoOpenBooking={autoOpenBooking}
      />
    </div>
  );
}
