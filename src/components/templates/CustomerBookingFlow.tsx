"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { computeAvailableStarts, formatTimeRange, formatDuration } from "@/lib/availability";

export interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;  // optional, defaults to 60 throughout the flow
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function MockBookingCalendar({
  services,
  colors,
  businessName,
  onClose,
  initialService = null,
}: {
  services: SimpleService[];
  colors: ThemeColors;
  businessName: string;
  onClose: () => void;
  initialService?: SimpleService | null;
}) {
  const [step, setStep] = useState<"service" | "date" | "time" | "confirm">(
    initialService ? "date" : "service",
  );
  const [selectedService, setSelectedService] = useState<SimpleService | null>(initialService);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Generate 30 days of dates starting tomorrow
  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  const timeSlots = selectedDate && selectedService
    ? computeAvailableStarts({
        date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`,
        durationMinutes: selectedService.durationMinutes ?? 60,
        // Mock defaults — preview/marketing has no real bookings/hours data.
        // Mon-Sat 10-19, Sunday closed.
        workingHours: {
          Sunday: null,
          Monday: { openHour: 10, closeHour: 19 },
          Tuesday: { openHour: 10, closeHour: 19 },
          Wednesday: { openHour: 10, closeHour: 19 },
          Thursday: { openHour: 10, closeHour: 19 },
          Friday: { openHour: 10, closeHour: 19 },
          Saturday: { openHour: 10, closeHour: 17 },
        },
        existingBookings: [],
        maxPerSlot: 1,
        blockedDates: [],
      }).map((h) => {
        const period = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:00 ${period}`;
      })
    : [];

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
                      <span className="text-sm font-semibold" style={{ color: colors.primary }}>
                        {formatDuration(svc.durationMinutes ?? 60)} · {svc.price}
                      </span>
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
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>
                          {selectedTime && formatTimeRange(selectedTime, selectedService?.durationMinutes ?? 60)}
                        </span>
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

// ---------------------------------------------------------------------------
// Helper sub-components for CustomerBookingFlow
// ---------------------------------------------------------------------------

function ServiceDetailsPanel({
  service,
  colors,
}: {
  service: SimpleService & { description?: string; image?: string };
  colors: ThemeColors;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: `${colors.primary}10` }}>
      {service.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={service.image} alt="" className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold truncate">{service.name}</h3>
          <span className="font-bold" style={{ color: colors.primary }}>{service.price}</span>
        </div>
        <div className="text-xs text-gray-500">Base · {formatDuration(service.durationMinutes ?? 60)}</div>
        {service.description && (
          <p className="text-xs text-gray-700 mt-1 leading-relaxed">{service.description}</p>
        )}
      </div>
    </div>
  );
}

function RunningTotalBar({
  baseDuration,
  basePrice,
  colors,
}: {
  baseDuration: number;
  basePrice: string;
  colors: ThemeColors;
}) {
  // Task 11: no add-ons yet — total equals base. Task 12 will add the add-on aware version.
  const numericPrice = parseFloat(basePrice.replace(/[^0-9.]/g, "")) || 0;
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-gray-50 border border-gray-200">
      <span className="text-xs text-gray-600">Total</span>
      <span className="font-bold">
        {formatDuration(baseDuration)} · <span style={{ color: colors.primary }}>${numericPrice.toFixed(2)}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomerBookingFlow — 2-screen flow: service? → details → schedule → confirm
// ---------------------------------------------------------------------------

export function CustomerBookingFlow({
  services,
  colors,
  businessName,
  previewSlug,
  onClose,
  initialService = null,
  workingHours = null,
  blockedDates = [],
}: {
  services: SimpleService[];
  colors: ThemeColors;
  businessName: string;
  previewSlug: string;
  onClose: () => void;
  initialService?: SimpleService | null;
  workingHours?: Record<string, { open: string; close: string } | null> | null;
  blockedDates?: string[];
}) {
  const [step, setStep] = useState<"service" | "details" | "schedule" | "confirm">(
    initialService ? "details" : "service",
  );
  const [selectedService, setSelectedService] = useState<SimpleService | null>(initialService);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerSmsOptIn, setCustomerSmsOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  // Fetch available slots when the user clicks Continue on the details screen
  const fetchSlots = async (date: Date, service: SimpleService | null) => {
    setLoadingSlots(true);
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    const dur = service?.durationMinutes ?? 60;
    try {
      const res = await fetch(`/api/available-slots?slug=${previewSlug}&date=${dateStr}&duration_minutes=${dur}`);
      const data = await res.json();
      setAvailableSlots(data.slots || []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Only stores the date — no auto-advance, no slot fetch.
  // The Continue button on the details screen drives the transition + fetch.
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleBook = async () => {
    if (!selectedService || !selectedDate || !selectedTime || !customerName.trim() || !customerPhone.trim()) return;
    setSubmitting(true);
    setError("");
    const dateStr = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, "0")}-${selectedDate.getDate().toString().padStart(2, "0")}`;
    try {
      const res = await fetch("/api/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_slug: previewSlug,
          service_name: selectedService.name,
          service_price: selectedService.price,
          duration_minutes: selectedService.durationMinutes ?? 60,
          booking_date: dateStr,
          booking_time: selectedTime,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || undefined,
          customer_notes: customerNotes.trim() || undefined,
          customer_sms_opt_in: customerSmsOptIn,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Booking failed");
      }
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const allSteps = ["service", "details", "schedule", "confirm"];

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
            <p className="text-xs font-medium uppercase tracking-wider opacity-60" style={{ color: colors.background }}>{businessName}</p>
            <h3 className="text-lg font-bold" style={{ color: colors.background }}>
              {step === "service" && "Select a Service"}
              {step === "details" && "Service Details"}
              {step === "schedule" && "Pick a Time"}
              {step === "confirm" && "Booking Confirmed!"}
            </h3>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={colors.background} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-2 py-3">
          {allSteps.map((s, i) => (
            <div key={s} className="h-1.5 rounded-full transition-all" style={{
              width: step === s ? 24 : 8,
              backgroundColor: allSteps.indexOf(step) >= i ? colors.primary : `${colors.foreground}20`,
            }} />
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
          <AnimatePresence mode="wait">

            {/* Step: service — service list picker */}
            {step === "service" && (
              <motion.div key="service" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}>
                <div className="space-y-2 py-2">
                  {services.map((svc, i) => (
                    <button key={i} onClick={() => { setSelectedService(svc); setStep("details"); }}
                      className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all hover:scale-[1.01]"
                      style={{ backgroundColor: colors.muted, color: colors.foreground }}>
                      <span className="font-medium">{svc.name}</span>
                      <span className="text-sm font-semibold" style={{ color: colors.primary }}>
                        {formatDuration(svc.durationMinutes ?? 60)} · {svc.price}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step: details — service summary + date picker + Continue CTA */}
            {step === "details" && selectedService && (
              <motion.div key="details" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}>
                <div className="space-y-4">
                  <div className="text-xs text-gray-500 mb-1">Step 1 of 2 — Details</div>

                  <ServiceDetailsPanel service={selectedService} colors={colors} />

                  <RunningTotalBar
                    baseDuration={selectedService.durationMinutes ?? 60}
                    basePrice={selectedService.price}
                    colors={colors}
                  />

                  {/* Date picker */}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {dates.map((date, i) => {
                      const weekdayName = WEEKDAYS_FULL[date.getDay()];
                      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                      const dayClosed = workingHours ? workingHours[weekdayName] === null : false;
                      const dayBlocked = blockedDates.includes(iso);
                      const unavailable = dayClosed || dayBlocked;
                      const isSelected = selectedDate?.toDateString() === date.toDateString();
                      return (
                        <button
                          key={i}
                          disabled={unavailable}
                          onClick={() => !unavailable && handleDateSelect(date)}
                          aria-label={unavailable ? `${DAYS[date.getDay()]} ${date.getDate()} — closed` : undefined}
                          className={`flex flex-col items-center rounded-xl px-2 py-3 transition-all ${
                            unavailable ? "cursor-not-allowed opacity-30" : "hover:scale-105"
                          }`}
                          style={{
                            backgroundColor: isSelected ? colors.primary : colors.muted,
                            color: isSelected ? colors.background : colors.foreground,
                          }}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">{DAYS[date.getDay()]}</span>
                          <span className="text-xl font-bold">{date.getDate()}</span>
                          <span className="text-[10px] opacity-50">{MONTHS[date.getMonth()].slice(0, 3)}</span>
                          {unavailable && <span className="text-[9px] mt-0.5 opacity-70">Closed</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={!selectedDate}
                    onClick={() => {
                      if (selectedDate) {
                        fetchSlots(selectedDate, selectedService);
                        setStep("schedule");
                      }
                    }}
                    className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
                    style={{ backgroundColor: colors.primary, color: "white" }}
                  >
                    Continue →
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step: schedule — time slots + contact form + Confirm CTA */}
            {step === "schedule" && selectedService && selectedDate && (
              <motion.div key="schedule" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep("details")}
                      className="text-xs font-semibold"
                      style={{ color: colors.primary }}
                    >
                      ← Back
                    </button>
                    <span className="text-xs text-gray-500">
                      Step 2 of 2 — Time
                    </span>
                  </div>

                  <div className="text-xs text-gray-500">
                    {selectedService.name} · {selectedDate.toLocaleDateString()}
                  </div>

                  <RunningTotalBar
                    baseDuration={selectedService.durationMinutes ?? 60}
                    basePrice={selectedService.price}
                    colors={colors}
                  />

                  {/* Time slots grid */}
                  {loadingSlots ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200" style={{ borderTopColor: colors.primary }} />
                    </div>
                  ) : availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className="rounded-xl py-3 text-center text-sm font-medium transition-all hover:scale-105"
                          style={{
                            backgroundColor: selectedTime === time ? colors.primary : colors.muted,
                            color: selectedTime === time ? colors.background : colors.foreground,
                          }}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm opacity-50" style={{ color: colors.foreground }}>No availability on this day</p>
                  )}

                  {/* Contact form */}
                  <div className="mb-4 rounded-xl p-3 text-xs" style={{ backgroundColor: colors.muted, color: colors.foreground }}>
                    <span className="font-semibold">{selectedService?.name}</span> &middot;{" "}
                    {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`} &middot;{" "}
                    {selectedTime ?? "— pick a time above"}
                  </div>

                  {error && (
                    <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>
                  )}

                  <div className="space-y-3">
                    <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your Name *" required
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none" style={{ borderColor: `${colors.foreground}20` }} />
                    <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone Number *" required
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none" style={{ borderColor: `${colors.foreground}20` }} />
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={customerSmsOptIn}
                        onChange={(e) => setCustomerSmsOptIn(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span style={{ color: colors.foreground }}>
                        Text me a confirmation and a day-before reminder. Reply STOP anytime.
                      </span>
                    </label>
                    <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (optional — for calendar invite)"
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none" style={{ borderColor: `${colors.foreground}20` }} />
                    <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Notes (optional)" rows={2}
                      className="w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none" style={{ borderColor: `${colors.foreground}20` }} />
                  </div>

                  <button
                    type="button"
                    disabled={submitting || !selectedTime || !customerName.trim() || !customerPhone.trim()}
                    onClick={handleBook}
                    className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
                    style={{ backgroundColor: colors.primary, color: "white" }}
                  >
                    {submitting ? "Booking..." : "Confirm booking"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step: confirm — success state (unchanged) */}
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="py-4 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12, delay: 0.1 }}
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${colors.primary}15` }}>
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke={colors.primary} strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <h4 className="mb-1 text-lg font-bold" style={{ color: colors.foreground }}>You&apos;re All Set!</h4>
                  <p className="mb-2 text-sm opacity-60" style={{ color: colors.foreground }}>
                    Your appointment has been booked.
                  </p>
                  {customerEmail && (
                    <p className="mb-4 text-xs opacity-40" style={{ color: colors.foreground }}>
                      A confirmation with calendar invite was sent to {customerEmail}
                    </p>
                  )}
                  <div className="mb-6 rounded-xl p-4 text-left" style={{ backgroundColor: colors.muted }}>
                    <div className="space-y-2">
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
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>
                          {selectedTime && formatTimeRange(selectedTime, selectedService?.durationMinutes ?? 60)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button onClick={onClose} className="w-full rounded-xl py-5 text-sm font-semibold"
                    style={{ backgroundColor: colors.primary, color: colors.background }}>Done</Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
