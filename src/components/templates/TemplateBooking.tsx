"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface BookingService {
  name: string;
  price: string;
  duration: string;
  id: number;
}

interface BookingCategory {
  name: string;
  services: BookingService[];
  directUrl: string;
}

interface SimpleService {
  name: string;
  price: string;
}

interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
  bookingCategories?: BookingCategory[];
  services?: SimpleService[];
  businessName?: string;
}

// For Vagaro URLs, ensure the embed loads the /services page directly
function getEmbedUrl(url: string): string {
  if (url.toLowerCase().includes("vagaro.com")) {
    const base = url.replace(/\/+$/, "").replace(/\/(services|about|staff)$/i, "");
    return `${base}/services`;
  }
  return url;
}

export function isEmbeddableBookingUrl(url: string): boolean {
  const embeddablePatterns = [
    "booksy.com",
    "vagaro.com",
    "squareup.com",
    "square.site",
    "acuityscheduling.com",
    "as.me",
    "calendly.com",
    "cal.com",
  ];
  return embeddablePatterns.some((pattern) =>
    url.toLowerCase().includes(pattern)
  );
}

// Generate mock time slots for a given date
function generateTimeSlots(date: Date): string[] {
  const slots: string[] = [];
  const day = date.getDay();
  // No slots on Sunday
  if (day === 0) return [];
  const start = 9;
  const end = day === 6 ? 17 : 19; // Saturday shorter hours
  for (let h = start; h < end; h++) {
    slots.push(`${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`);
    if (h < end - 1) {
      slots.push(`${h > 12 ? h - 12 : h}:30 ${h >= 12 ? "PM" : "AM"}`);
    }
  }
  // Randomly "book out" some slots to look realistic
  const seed = date.getDate() * 7 + date.getMonth();
  return slots.filter((_, i) => (seed * (i + 3) * 13) % 7 !== 0);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function MockBookingCalendar({
  services,
  colors,
  businessName,
  onClose,
}: {
  services: SimpleService[];
  colors: ThemeColors;
  businessName: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"service" | "date" | "time" | "confirm">("service");
  const [selectedService, setSelectedService] = useState<SimpleService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Generate 2 weeks of dates starting tomorrow
  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  const timeSlots = selectedDate ? generateTimeSlots(selectedDate) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl"
        style={{ backgroundColor: colors.background }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: colors.foreground }}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-60" style={{ color: colors.background }}>
              {businessName}
            </p>
            <h3 className="text-lg font-bold" style={{ color: colors.background }}>
              {step === "service" && "Select a Service"}
              {step === "date" && "Pick a Date"}
              {step === "time" && "Choose a Time"}
              {step === "confirm" && "Confirm Booking"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={colors.background} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 py-3">
          {["service", "date", "time", "confirm"].map((s, i) => (
            <div
              key={s}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: step === s ? 24 : 8,
                backgroundColor: ["service", "date", "time", "confirm"].indexOf(step) >= i ? colors.primary : `${colors.foreground}20`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
          <AnimatePresence mode="wait">
            {/* Step 1: Service selection */}
            {step === "service" && (
              <motion.div key="service" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
                <div className="space-y-2 py-2">
                  {services.map((svc, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedService(svc);
                        setStep("date");
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all hover:scale-[1.01]"
                      style={{
                        backgroundColor: colors.muted,
                        color: colors.foreground,
                      }}
                    >
                      <span className="font-medium">{svc.name}</span>
                      <span className="text-sm font-semibold" style={{ color: colors.primary }}>{svc.price}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Date selection */}
            {step === "date" && (
              <motion.div key="date" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
                {/* Selected service pill */}
                <button
                  onClick={() => setStep("service")}
                  className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {selectedService?.name}
                </button>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {dates.map((date, i) => {
                    const isSunday = date.getDay() === 0;
                    return (
                      <button
                        key={i}
                        disabled={isSunday}
                        onClick={() => {
                          setSelectedDate(date);
                          setStep("time");
                        }}
                        className={`flex flex-col items-center rounded-xl px-2 py-3 transition-all ${
                          isSunday ? "cursor-not-allowed opacity-30" : "hover:scale-105"
                        }`}
                        style={{
                          backgroundColor: colors.muted,
                          color: colors.foreground,
                        }}
                      >
                        <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {DAYS[date.getDay()]}
                        </span>
                        <span className="text-xl font-bold">{date.getDate()}</span>
                        <span className="text-[10px] opacity-50">
                          {MONTHS[date.getMonth()].slice(0, 3)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 3: Time selection */}
            {step === "time" && (
              <motion.div key="time" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
                {/* Back pills */}
                <div className="mb-4 flex gap-2">
                  <button
                    onClick={() => setStep("date")}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`}
                  </button>
                </div>

                {timeSlots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.map((time) => (
                      <button
                        key={time}
                        onClick={() => {
                          setSelectedTime(time);
                          setStep("confirm");
                        }}
                        className="rounded-xl py-3 text-center text-sm font-medium transition-all hover:scale-105"
                        style={{
                          backgroundColor: colors.muted,
                          color: colors.foreground,
                        }}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm opacity-50" style={{ color: colors.foreground }}>
                    No availability on this day
                  </p>
                )}
              </motion.div>
            )}

            {/* Step 4: Confirmation */}
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
                <div className="py-4 text-center">
                  {/* Checkmark */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, delay: 0.1 }}
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${colors.primary}15` }}
                  >
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke={colors.primary} strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>

                  <h4 className="mb-1 text-lg font-bold" style={{ color: colors.foreground }}>
                    You&apos;re All Set!
                  </h4>
                  <p className="mb-6 text-sm opacity-50" style={{ color: colors.foreground }}>
                    This is a preview — booking is not live yet.
                  </p>

                  {/* Booking summary card */}
                  <div className="mb-6 rounded-xl p-4 text-left" style={{ backgroundColor: colors.muted }}>
                    <div className="space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Service</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>{selectedService?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Date</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>
                          {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Time</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>{selectedTime}</span>
                      </div>
                      <div className="border-t pt-2.5" style={{ borderColor: `${colors.foreground}10` }}>
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold" style={{ color: colors.foreground }}>Total</span>
                          <span className="text-sm font-bold" style={{ color: colors.primary }}>{selectedService?.price}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={onClose}
                    className="w-full rounded-xl py-5 text-sm font-semibold"
                    style={{ backgroundColor: colors.primary, color: colors.background }}
                  >
                    Done
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function TemplateBooking({
  title = "Book an Appointment",
  subtitle = "Ready to look your best? Book your appointment today.",
  bookingUrl,
  phone,
  colors,
  bookingCategories,
  services,
  businessName = "Our Business",
}: TemplateBookingProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showFallbackEmbed, setShowFallbackEmbed] = useState(false);
  const [showMockCalendar, setShowMockCalendar] = useState(false);
  const hasCategories = bookingCategories && bookingCategories.length > 0;
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const showMock = !bookingUrl && !hasCategories && services && services.length > 0;

  // Auto-open when navigated to via #booking anchor
  useEffect(() => {
    if (!hasCategories && !canEmbed) return;
    const handleHash = () => {
      if (window.location.hash === "#booking") {
        if (hasCategories) {
          // Auto-expand first category
          setExpandedCategory(bookingCategories[0].name);
        } else {
          setShowFallbackEmbed(true);
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [hasCategories, canEmbed, bookingCategories]);

  return (
    <section
      id="booking"
      className="px-6 py-20"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ color: colors.background }}
        >
          {title}
        </h2>
        <p className="mb-10 text-lg opacity-80" style={{ color: colors.background }}>
          {subtitle}
        </p>

        {/* Native category/service booking UI */}
        {hasCategories ? (
          <div className="space-y-3 text-left">
            {bookingCategories.map((category) => (
              <div
                key={category.name}
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: `${colors.background}10` }}
              >
                {/* Category header */}
                <button
                  onClick={() =>
                    setExpandedCategory(
                      expandedCategory === category.name ? null : category.name
                    )
                  }
                  className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/10"
                >
                  <span
                    className="text-lg font-semibold"
                    style={{ color: colors.background }}
                  >
                    {category.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm opacity-60"
                      style={{ color: colors.background }}
                    >
                      {category.services.length}{" "}
                      {category.services.length === 1 ? "service" : "services"}
                    </span>
                    <svg
                      className="h-5 w-5 transition-transform"
                      style={{
                        color: colors.primary,
                        transform:
                          expandedCategory === category.name
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                      }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded services */}
                <AnimatePresence>
                  {expandedCategory === category.name && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <div className="border-t border-white/10 px-6 pb-4 pt-2">
                        {category.services.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between border-b border-white/5 py-4 last:border-0"
                          >
                            <div>
                              <p
                                className="font-medium"
                                style={{ color: colors.background }}
                              >
                                {service.name}
                              </p>
                              <p
                                className="mt-1 text-sm opacity-50"
                                style={{ color: colors.background }}
                              >
                                {service.duration} &middot; {service.price}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="rounded-full px-6 text-sm font-semibold"
                              style={{
                                backgroundColor: colors.primary,
                                color: colors.background,
                              }}
                              asChild
                            >
                              <a
                                href={category.directUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Book
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Fallback: direct link to full booking page */}
            {bookingUrl && (
              <div className="pt-4 text-center">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline opacity-60 transition-opacity hover:opacity-100"
                  style={{ color: colors.primary }}
                >
                  View all options on booking page
                </a>
              </div>
            )}
          </div>
        ) : (
          /* Fallback: buttons + iframe embed or mock calendar */
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {bookingUrl ? (
                <Button
                  size="lg"
                  className="rounded-full px-10 py-6 text-base font-semibold"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                  onClick={
                    canEmbed
                      ? () => setShowFallbackEmbed(!showFallbackEmbed)
                      : undefined
                  }
                  asChild={!canEmbed}
                >
                  {canEmbed ? (
                    <span>
                      {showFallbackEmbed ? "Close Booking" : "Book Online"}
                    </span>
                  ) : (
                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book Online
                    </a>
                  )}
                </Button>
              ) : showMock ? (
                <Button
                  size="lg"
                  className="rounded-full px-10 py-6 text-base font-semibold"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                  onClick={() => setShowMockCalendar(true)}
                >
                  Book Online
                </Button>
              ) : null}
              {phone && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full !bg-transparent px-10 py-6 text-base font-semibold"
                  style={{
                    borderColor: colors.primary,
                    color: colors.primary,
                  }}
                  asChild
                >
                  <a href={`tel:${phone}`}>Call {phone}</a>
                </Button>
              )}
              {!bookingUrl && !phone && !showMock && (
                <Button
                  size="lg"
                  className="rounded-full px-10 py-6 text-base font-semibold"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                >
                  Contact Us
                </Button>
              )}
            </div>

            {canEmbed && showFallbackEmbed && (
              <div className="mt-8 overflow-hidden rounded-2xl shadow-2xl" style={{ height: 800 }}>
                <iframe
                  src={getEmbedUrl(bookingUrl)}
                  title="Book an appointment"
                  className="w-full border-0"
                  style={{ height: 1600, marginTop: -200 }}
                  allow="payment"
                />
              </div>
            )}
          </>
        )}

        {/* Phone CTA when categories are shown */}
        {hasCategories && phone && (
          <div className="mt-8">
            <Button
              size="lg"
              variant="outline"
              className="rounded-full !bg-transparent px-10 py-6 text-base font-semibold"
              style={{
                borderColor: colors.primary,
                color: colors.primary,
              }}
              asChild
            >
              <a href={`tel:${phone}`}>Or call {phone}</a>
            </Button>
          </div>
        )}
      </div>

      {/* Mock booking calendar popup */}
      <AnimatePresence>
        {showMockCalendar && services && services.length > 0 && (
          <MockBookingCalendar
            services={services}
            colors={colors}
            businessName={businessName}
            onClose={() => setShowMockCalendar(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
