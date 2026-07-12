const objectRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function mergeHomeServicesConfig(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...stored, ...incoming };
  for (const key of ["sections"] as const) {
    const oldValue = objectRecord(stored[key]);
    const newValue = objectRecord(incoming[key]);
    if (newValue) merged[key] = { ...oldValue, ...newValue };
  }
  const oldCopy = objectRecord(stored.section_copy);
  const newCopy = objectRecord(incoming.section_copy);
  if (newCopy) {
    const sectionCopy = { ...oldCopy };
    for (const [section, value] of Object.entries(newCopy)) {
      const newSection = objectRecord(value);
      const oldSection = objectRecord(oldCopy?.[section]);
      sectionCopy[section] = newSection
        ? { ...oldSection, ...newSection }
        : value;
    }
    merged.section_copy = sectionCopy;
  }
  return merged;
}
