"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { ensureReadable } from "@/lib/templates/contrast";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";
import { groupServices } from "./groupServices";

type Mode = "in_site_only" | "external_only" | "both";

type DisplayService = {
  name: string;
  price: string;
  description?: string;
  bookingDeepLink?: string;
  durationMinutes?: number;
  image?: string;
  category?: string;
};

interface RunwayServicesProps {
  services: DisplayService[];
  categories?: string[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function RunwayServices({
  services,
  categories,
  colors,
  bookingMode,
}: RunwayServicesProps) {
  const runwayBackground = "#030303";
  const runwayPanel = "#0D0B08";
  const gold = ensureReadable(colors.primary || "#D8B15A", runwayBackground, 3);
  const ivory = ensureReadable("#FFF4D8", runwayBackground);
  const buttonText = ensureReadable("#050505", gold);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, i: number) => {
    const m = bookingMode ?? "in_site_only";
    const canBook = !(m === "external_only" && !service.bookingDeepLink);
    const triggerBook = () => {
      if (m === "external_only" && service.bookingDeepLink) {
        window.open(service.bookingDeepLink, "_blank", "noopener,noreferrer");
      } else if (m === "both" && service.bookingDeepLink) {
        requestBookingChoice(service.name, service.bookingDeepLink);
      } else {
        openBookingCalendarForService(service.name);
      }
    };

    return (
      <AnimateSection key={service.name} animation="fade-up" delay={i * 0.1}>
        <div
          className={`group relative min-h-[220px] overflow-hidden border bg-white/[0.035] p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_0_45px_rgba(216,177,90,0.16)] ${
            canBook ? "hover:border-opacity-70" : ""
          }`}
          style={{
            background: `linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)), ${runwayPanel}`,
            borderColor: `${gold}38`,
            color: ivory,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-[-110%] top-0 h-px w-[90%] bg-gradient-to-r from-transparent via-[#D8B15A] to-transparent transition-[left] duration-500 group-hover:left-[110%]"
          />

          {service.image && (
            <div
              className="-mx-6 -mt-6 mb-6 h-40 overflow-hidden border-b bg-neutral-950"
              style={{ borderColor: `${gold}2E` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={service.image}
                alt={service.name}
                className="h-full w-full scale-[1.04] object-cover brightness-75 contrast-110 saturate-95 transition duration-500 group-hover:scale-110 group-hover:brightness-90 group-hover:saturate-100"
              />
            </div>
          )}

          <div className="mb-8 flex items-start justify-between gap-5">
            <span
              className="text-[0.68rem] font-black uppercase tracking-[0.34em]"
              style={{ color: gold }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="text-right">
              <div className="whitespace-nowrap text-lg font-black" style={{ color: gold }}>
                {service.price}
              </div>
              <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/45">
                {formatDuration(service.durationMinutes ?? 60)}
              </div>
            </div>
          </div>

          <h3 className="max-w-[16rem] text-3xl font-black uppercase leading-[0.95] tracking-[-0.04em]">
            {service.name}
          </h3>

          {service.description && (
            <p className="mt-4 line-clamp-4 text-sm leading-7 text-white/65">
              {service.description}
            </p>
          )}

          {canBook && (
            <button
              type="button"
              aria-label={`Book ${service.name}`}
              onClick={(e) => {
                e.stopPropagation();
                triggerBook();
              }}
              className="mt-7 inline-flex min-h-11 items-center justify-center border px-5 text-[0.68rem] font-black uppercase tracking-[0.22em] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(216,177,90,0.24)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={{
                backgroundColor: gold,
                borderColor: gold,
                color: buttonText,
              }}
            >
              Book Look
            </button>
          )}
        </div>
      </AnimateSection>
    );
  };

  return (
    <section
      className="relative isolate overflow-hidden px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, rgba(216,177,90,0.18), transparent 28rem), radial-gradient(circle at 92% 18%, rgba(216,177,90,0.14), transparent 24rem), #030303",
      }}
    >
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" aria-hidden />
      <div className="relative z-10 mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <h2 className="max-w-4xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] sm:text-6xl md:text-7xl lg:text-8xl">
              Signature Services
            </h2>
            <p className="max-w-sm text-sm leading-7 text-white/60 md:text-base">
              Sharp-edged service cards glow on hover and open booking with your selected look.
            </p>
          </div>
        </AnimateSection>

        {groups.map((group) => {
          const isCollapsed = group.label ? !!collapsed[group.label] : false;
          const groupId = group.label
            ? `runway-services-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`
            : undefined;

          return (
            <div key={group.label ?? "_flat"} className="mb-10 last:mb-0">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  aria-expanded={!isCollapsed}
                  aria-controls={groupId}
                  className="mb-5 flex w-full items-center justify-between border-b pb-3 text-left"
                  style={{ borderColor: `${gold}47`, color: ivory }}
                >
                  <span className="text-xs font-black uppercase tracking-[0.32em]">
                    {group.label}
                  </span>
                  <span className="text-sm font-black" style={{ color: gold }} aria-hidden>
                    {isCollapsed ? "+" : "-"}
                  </span>
                </button>
              )}

              {!isCollapsed && (
                <div id={groupId} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(group.services as DisplayService[]).map((service, i) =>
                    renderService(service, i),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
