"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import { contrastRatio, ensureReadable } from "@/lib/templates/contrast";
import { formatDuration } from "@/lib/availability";
import type { SimpleService } from "./CustomerBookingFlow";
import { filterBookingServices } from "./booking-service-filter";

interface BookingServicePickerProps {
  services: SimpleService[];
  colors: ThemeColors;
  onSelect: (service: SimpleService) => void;
  locale?: "en" | "es";
}

const BOOKING_SERVICE_PICKER_LABELS = {
  en: {
    search: "Search services",
    clear: "Clear",
    service: "service",
    services: "services",
    noServices: "No services found",
    noServicesHint: "Try another name or clear your search.",
    clearSearch: "Clear search",
  },
  es: {
    search: "Buscar servicios",
    clear: "Borrar",
    service: "servicio",
    services: "servicios",
    noServices: "No se encontraron servicios",
    noServicesHint: "Prueba otro nombre o borra la búsqueda.",
    clearSearch: "Borrar búsqueda",
  },
} as const satisfies Record<
  "en" | "es",
  {
    search: string;
    clear: string;
    service: string;
    services: string;
    noServices: string;
    noServicesHint: string;
    clearSearch: string;
  }
>;

export function BookingServicePicker({
  services,
  colors,
  onSelect,
  locale = "en",
}: BookingServicePickerProps) {
  const labels = BOOKING_SERVICE_PICKER_LABELS[locale];
  const [query, setQuery] = useState("");
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const indexedServices = useMemo(
    () =>
      services.map((service, originalIndex) => ({
        name: service.name,
        service,
        originalIndex,
      })),
    [services],
  );
  const filteredServices = useMemo(
    () => filterBookingServices(indexedServices, query),
    [indexedServices, query],
  );
  const surfaceText = ensureReadable(colors.foreground, colors.background);
  const mutedText = ensureReadable(colors.foreground, colors.muted);
  const mutedAccent = ensureReadable(colors.primary, colors.muted, 4.5);
  const surfaceAccent = ensureReadable(colors.primary, colors.background, 3);
  const whiteButtonContrast = contrastRatio("#FFFFFF", colors.primary);
  const blackButtonContrast = contrastRatio("#000000", colors.primary);
  const primaryButtonText =
    whiteButtonContrast >= blackButtonContrast ? "#FFFFFF" : "#000000";
  const resultLabel = `${filteredServices.length} ${
    filteredServices.length === 1 ? labels.service : labels.services
  }`;

  return (
    <div className="min-h-0">
      <div
        className="sticky top-0 z-10 -mx-1 space-y-2 px-1 pb-3 pt-1"
        style={{ backgroundColor: colors.background, color: surfaceText }}
      >
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: mutedText }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={labels.search}
            placeholder={labels.search}
            className="h-11 w-full rounded-xl border bg-transparent pl-10 pr-16 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              borderColor: `${colors.foreground}24`,
              color: mutedText,
              backgroundColor: colors.muted,
              "--tw-ring-color": surfaceAccent,
              "--tw-ring-offset-color": colors.background,
            } as CSSProperties}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2"
              style={{
                color: mutedAccent,
                "--tw-ring-color": surfaceAccent,
              } as CSSProperties}
              aria-label={labels.clearSearch}
            >
              {labels.clear}
            </button>
          )}
        </div>
        <p
          className="px-1 text-xs font-medium"
          style={{ color: surfaceText }}
          aria-live="polite"
        >
          {resultLabel}
        </p>
      </div>

      {filteredServices.length > 0 ? (
        <div className="space-y-2.5 pb-1">
          {filteredServices.map(({ service, originalIndex }) => (
            <button
              key={`${originalIndex}-${service.name}-${service.price}-${service.durationMinutes ?? 60}`}
              type="button"
              onClick={() => onSelect(service)}
              className="group flex min-h-24 w-full items-center gap-3 overflow-hidden rounded-2xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                borderColor: `${colors.foreground}14`,
                backgroundColor: colors.muted,
                color: mutedText,
                "--tw-ring-color": surfaceAccent,
                "--tw-ring-offset-color": colors.background,
              } as CSSProperties}
            >
              <span className="relative h-20 w-20 flex-none overflow-hidden rounded-xl">
                {service.image && !failedImageUrls.has(service.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={service.image}
                    alt={service.name}
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      const imageUrl = service.image;
                      if (!imageUrl) return;
                      setFailedImageUrls((current) => {
                        const next = new Set(current);
                        next.add(imageUrl);
                        return next;
                      });
                    }}
                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-full w-full items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}32, ${colors.accent}70)`,
                      color: mutedAccent,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-8 w-8 opacity-70"
                    >
                      <path d="M4 16.5 8.5 12l3 3L16 10.5l4 4" />
                      <rect x="3" y="4" width="18" height="16" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                    </svg>
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1 py-1">
                <span className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
                  {service.name}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span style={{ color: mutedText }}>
                    {formatDuration(service.durationMinutes ?? 60)}
                  </span>
                  <span aria-hidden="true" className="opacity-30">
                    &middot;
                  </span>
                  <span className="font-bold" style={{ color: mutedAccent }}>
                    {service.price}
                  </span>
                </span>
              </span>

              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5 flex-none transition-transform group-hover:translate-x-0.5"
                style={{ color: mutedText }}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl border px-5 py-10 text-center"
          style={{
            borderColor: `${colors.foreground}18`,
            color: surfaceText,
          }}
        >
          <p className="font-semibold">{labels.noServices}</p>
          <p className="mt-1 text-sm" style={{ color: surfaceText }}>
            {labels.noServicesHint}
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 rounded-full px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: colors.primary,
              color: primaryButtonText,
              "--tw-ring-color": surfaceAccent,
              "--tw-ring-offset-color": colors.background,
            } as CSSProperties}
          >
            {labels.clearSearch}
          </button>
        </div>
      )}
    </div>
  );
}
