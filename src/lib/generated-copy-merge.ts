import { mergeHomeServicesConfig } from "./home-services/config-merge";

export function mergeGeneratedCopy(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };

  if (
    incoming.en &&
    typeof incoming.en === "object" &&
    !Array.isArray(incoming.en)
  ) {
    const currentEn = (existing.en || {}) as Record<string, unknown>;
    merged.en = { ...currentEn, ...(incoming.en as Record<string, unknown>) };
  }

  if (
    incoming.es &&
    typeof incoming.es === "object" &&
    !Array.isArray(incoming.es)
  ) {
    const currentEs = (existing.es || {}) as Record<string, unknown>;
    merged.es = { ...currentEs, ...(incoming.es as Record<string, unknown>) };
  }

  const explicitKeys = [
    "logo",
    "section_settings",
    "custom_colors",
    "booking_categories",
    "social_links",
    "home_services_config",
  ] as const;

  for (const key of explicitKeys) {
    if (incoming[key] !== undefined) {
      merged[key] = incoming[key];
    }
  }

  const incomingConfig = incoming.home_services_config;
  if (
    incomingConfig &&
    typeof incomingConfig === "object" &&
    !Array.isArray(incomingConfig)
  ) {
    const storedConfig =
      existing.home_services_config &&
      typeof existing.home_services_config === "object" &&
      !Array.isArray(existing.home_services_config)
        ? (existing.home_services_config as Record<string, unknown>)
        : {};
    merged.home_services_config = mergeHomeServicesConfig(
      storedConfig,
      incomingConfig as Record<string, unknown>,
    );
  }

  return merged;
}
