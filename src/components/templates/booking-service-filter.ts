export function filterBookingServices<T extends { name: string }>(
  services: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return services;

  return services.filter((service) =>
    service.name.toLowerCase().includes(normalizedQuery),
  );
}
