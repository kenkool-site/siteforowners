"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import type { AddOn } from "@/lib/ai/types";
import { formatTimeRange, formatDuration } from "@/lib/availability";

export interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;  // optional, defaults to 60 throughout the flow
  description?: string;
  image?: string;
  addOns?: AddOn[];
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
  addOns,
  colors,
}: {
  baseDuration: number;
  basePrice: string;
  addOns: AddOn[];
  colors: ThemeColors;
}) {
  const numericPrice = parseFloat(basePrice.replace(/[^0-9.]/g, "")) || 0;
  const totalDuration = baseDuration + addOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0);
  const totalPrice = numericPrice + addOns.reduce((sum, a) => sum + a.price_delta, 0);
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-gray-50 border border-gray-200">
      <span className="text-xs text-gray-600">Total</span>
      <span className="font-bold">
        {formatDuration(totalDuration)} · <span style={{ color: colors.primary }}>${totalPrice.toFixed(2)}</span>
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
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);

  // Reset add-ons whenever the user picks a different service
  useEffect(() => {
    setSelectedAddOns([]);
  }, [selectedService?.name]);

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
    const baseDur = service?.durationMinutes ?? 60;
    const addOnDur = selectedAddOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0);
    const dur = baseDur + addOnDur;
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

  // Re-fetch slots when add-ons change while on the schedule screen
  useEffect(() => {
    if (step !== "schedule" || !selectedDate || !selectedService) return;
    fetchSlots(selectedDate, selectedService);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedAddOns]);

  // Deselect a previously chosen time if it's no longer in the refreshed slot list
  useEffect(() => {
    if (selectedTime && !availableSlots.includes(selectedTime)) {
      setSelectedTime(null);
    }
  }, [availableSlots, selectedTime]);

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
          duration_minutes: (selectedService.durationMinutes ?? 60) + selectedAddOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0),
          booking_date: dateStr,
          booking_time: selectedTime,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || undefined,
          customer_notes: customerNotes.trim() || undefined,
          customer_sms_opt_in: customerSmsOptIn,
          selected_add_ons: selectedAddOns.length > 0 ? selectedAddOns : undefined,
          add_ons_total_price: selectedAddOns.length > 0
            ? selectedAddOns.reduce((sum, a) => sum + a.price_delta, 0)
            : undefined,
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
        className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md overflow-hidden sm:rounded-2xl flex flex-col"
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
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:max-h-[calc(90vh-120px)]">
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

                  {(selectedService.addOns?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                        Add-ons (optional)
                      </div>
                      {selectedService.addOns!.map((ao, i) => {
                        const checked = selectedAddOns.some((a) => a.name === ao.name);
                        return (
                          <label
                            key={ao.name + i}
                            className="flex items-center justify-between p-3 rounded-lg border cursor-pointer text-sm"
                            style={
                              checked
                                ? { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}55` }
                                : { backgroundColor: "white", borderColor: "#e5e7eb" }
                            }
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedAddOns((prev) => {
                                    if (checked) {
                                      return prev.filter((a) => a.name !== ao.name);
                                    }
                                    const baseDur = selectedService.durationMinutes ?? 60;
                                    const currentTotal = baseDur + prev.reduce((sum, a) => sum + a.duration_delta_minutes, 0);
                                    if (currentTotal + ao.duration_delta_minutes > 720) {
                                      // Silently no-op; could surface a toast but spec says "client prevents"
                                      return prev;
                                    }
                                    return [...prev, ao];
                                  });
                                }}
                                style={{ accentColor: colors.primary }}
                              />
                              <span className="font-medium">{ao.name}</span>
                            </span>
                            <span className="text-xs text-gray-500">
                              +{formatDuration(ao.duration_delta_minutes) || "0m"} · +${ao.price_delta.toFixed(2)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <RunningTotalBar
                    baseDuration={selectedService.durationMinutes ?? 60}
                    basePrice={selectedService.price}
                    addOns={selectedAddOns}
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

                  <div className="sticky bottom-0 bg-white pt-3 pb-[env(safe-area-inset-bottom)] -mx-5 px-5 sm:static sm:bg-transparent sm:p-0 sm:m-0 sm:pb-0">
                    <button
                      type="button"
                      disabled={!selectedDate}
                      onClick={() => {
                        if (selectedDate) {
                          setStep("schedule");
                        }
                      }}
                      className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
                      style={{ backgroundColor: colors.primary, color: "white" }}
                    >
                      Continue →
                    </button>
                  </div>
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
                    addOns={selectedAddOns}
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

                  <div className="sticky bottom-0 bg-white pt-3 pb-[env(safe-area-inset-bottom)] -mx-5 px-5 sm:static sm:bg-transparent sm:p-0 sm:m-0 sm:pb-0">
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
