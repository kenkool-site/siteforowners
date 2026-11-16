/**
 * Text shown under a service name on a public site.
 *
 * Generated copy (`generated_copy.service_descriptions`) fills the line when
 * the service row has no description of its own. A saved blank string is an
 * explicit clear from the service editor: nothing is shown, including that
 * generated sentence.
 */
export function displayedServiceDescription(
  serviceDescription: string | null | undefined,
  generated: string | null | undefined,
  clearedHidesGenerated = false,
): string | undefined {
  const cleared =
    typeof serviceDescription === "string" && serviceDescription.trim() === "";
  if (cleared && clearedHidesGenerated) return undefined;
  if (generated != null) return generated;
  return serviceDescription ?? undefined;
}
