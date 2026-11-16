/**
 * Value written to `services[].description`.
 * An empty editor field is stored as "" so a later render can tell
 * "cleared" from "this row was never given a description".
 */
export function persistedServiceDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** True when this preview has saved at least one intentionally blank description. */
export function previewHasClearedServiceDescription(
  services: Array<{ description?: string | null }>,
): boolean {
  return services.some(
    (service) => typeof service.description === "string" && service.description.trim() === "",
  );
}

/**
 * Text shown under a service name on a public site.
 *
 * Generated copy fills the line only when that service has no description of
 * its own. A saved blank string hides the line. On Maison, once any service
 * on the preview has been saved blank, rows that are still missing a
 * description are treated as blank too — the editor shows those fields empty,
 * and `JSON.stringify` otherwise drops the key before it can be stored.
 */
export function displayedServiceDescription(
  serviceDescription: string | null | undefined,
  generated: string | null | undefined,
  clearedHidesGenerated = false,
  missingCountsAsCleared = false,
): string | undefined {
  const explicitBlank =
    typeof serviceDescription === "string" && serviceDescription.trim() === "";
  const unset = serviceDescription == null || explicitBlank;
  if (clearedHidesGenerated && (explicitBlank || (missingCountsAsCleared && unset))) {
    return undefined;
  }
  if (generated != null) return generated;
  return serviceDescription ?? undefined;
}
