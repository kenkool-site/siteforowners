import type { BusinessType } from "@/lib/ai/types";

export const HOME_SERVICES_WIZARD_TEMPLATE = "neighborhood" as const;

export const HOME_SERVICES_WIZARD_VARIANTS = [
  HOME_SERVICES_WIZARD_TEMPLATE,
  HOME_SERVICES_WIZARD_TEMPLATE,
] as const;

export function isHomeServicesBusinessType(
  businessType: BusinessType | "" | null | undefined,
): boolean {
  return businessType === "home_services";
}
