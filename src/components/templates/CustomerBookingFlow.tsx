"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import type { AddOn } from "@/lib/ai/types";
import { formatTimeRange, formatDuration } from "@/lib/availability";
import { computeDeposit, parseServicePrice } from "@/lib/deposit";
import { cashappUrl, normalizeCashapp, hasAnyMethod, type PaymentMethods } from "@/lib/deposit-payment-methods";

export interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;  // optional, defaults to 60 throughout the flow
  description?: string;
  image?: string;
  addOns?: AddOn[];
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------------------------------------------------------------------------
// Helper sub-components for CustomerBookingFlow
// ---------------------------------------------------------------------------

export function ServiceDetailsPanel({
  service,
  colors,
}: {
  service: SimpleService & { description?: string; image?: string };
  colors: ThemeColors;
}) {
  return (
    <div className="overflow-hidden rounded-lg" style={{ backgroundColor: `${colors.primary}10` }}>
      {service.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={service.image}
          alt={service.name}
          className="block w-full h-44 object-cover"
        />
      )}
      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold truncate text-base">{service.name}</h3>
          <span className="font-bold whitespace-nowrap" style={{ color: colors.primary }}>
            {service.price}
          </span>
        </div>
        <div className="text-xs text-gray-500">Base · {formatDuration(service.durationMinutes ?? 60)}</div>
        {service.description && (
          <p className="text-sm text-gray-700 mt-1.5 leading-snug">{service.description}</p>
        )}
      </div>
    </div>
  );
}

export function RunningTotalBar({
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

function CopyChip({
  label,
  value,
  bgColor,
}: {
  label: string;
  value: string;
  bgColor: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / insecure contexts: fall through silently. The value
      // is still visible so the customer can select-and-copy by hand.
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
      style={{ backgroundColor: bgColor }}
    >
      <span className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs opacity-80 flex-shrink-0">{label}</span>
        <span className="truncate">{value}</span>
      </span>
      <span className="text-xs flex-shrink-0">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

function PaymentMethodList({ methods }: { methods: PaymentMethods }) {
  if (!hasAnyMethod(methods)) {
    return (
      <div className="text-xs text-gray-500">
        Payment instructions will follow.
      </div>
    );
  }
  return (
    <div className="space-y-1.5 text-sm">
      {methods.cashapp && (
        <div>
          <a
            href={cashappUrl(methods.cashapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "#00D632" }}
          >
            Pay ${normalizeCashapp(methods.cashapp)} on CashApp →
          </a>
        </div>
      )}
      {methods.zelle && (
        <CopyChip label="Zelle" value={methods.zelle} bgColor="#6D1ED4" />
      )}
      {methods.otherLabel && methods.otherValue && (
        <CopyChip label={methods.otherLabel} value={methods.otherValue} bgColor="#374151" />
      )}
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
  initialCustomer,
  workingHours = null,
  blockedDates = [],
  bookingPolicies = "",
  depositSettings,
  rescheduleMode,
}: {
  services: SimpleService[];
  colors: ThemeColors;
  businessName: string;
  previewSlug: string;
  onClose?: () => void;
  initialService?: SimpleService | null;
  /** Spec 6: pre-populate the details-step inputs (used by reschedule
   * mode where customer info is already known). */
  initialCustomer?: {
    name: string;
    phone: string;
    email?: string;
  };
  workingHours?: Record<string, { open: string; close: string } | null> | null;
  blockedDates?: string[];
  bookingPolicies?: string;
  depositSettings?: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_cashapp: string | null;
    deposit_zelle: string | null;
    deposit_other_label: string | null;
    deposit_other_value: string | null;
  };
  /** Spec 6: when set, the flow renders in reschedule mode — service +
   * customer info are locked, deposit panel is hidden, submit calls a
   * different endpoint. */
  rescheduleMode?: {
    bookingId: string;
    originalDateLabel: string;     // "Friday, May 1"
    originalTimeLabel: string;     // "11:00 AM"
    tokenExpiry: number;
    tokenSignature: string;
    onDone: () => void;
  };
}) {
  const [step, setStep] = useState<"service" | "details" | "schedule" | "confirm">(
    rescheduleMode ? "details" : initialService ? "details" : "service",
  );
  const [selectedService, setSelectedService] = useState<SimpleService | null>(initialService);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomer?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone ?? "");
  const [customerEmail, setCustomerEmail] = useState(initialCustomer?.email ?? "");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerSmsOptIn, setCustomerSmsOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [bookedAsPending, setBookedAsPending] = useState(false);
  const policiesHeadline = bookingPolicies.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";

  const depositAmount = depositSettings && selectedService
    ? computeDeposit(
        {
          deposit_required: depositSettings.deposit_required,
          deposit_mode: depositSettings.deposit_mode,
          deposit_value: depositSettings.deposit_value,
        },
        parseServicePrice(selectedService.price),
        selectedAddOns.reduce((s, a) => s + a.price_delta, 0),
      )
    : 0;
  const isDepositRequired = !!(depositSettings?.deposit_required && depositAmount > 0);
  const paymentMethods: PaymentMethods = {
    cashapp: depositSettings?.deposit_cashapp ?? null,
    zelle: depositSettings?.deposit_zelle ?? null,
    otherLabel: depositSettings?.deposit_other_label ?? null,
    otherValue: depositSettings?.deposit_other_value ?? null,
  };

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

  // Time slots block on the details step — scrolled into view on date
  // change so the customer notices the slots appearing below the calendar
  // instead of just seeing the calendar refresh and not knowing where to go.
  const timeSlotsRef = useRef<HTMLDivElement | null>(null);

  // Only stores the date — no auto-advance, no slot fetch.
  // The fetch effect below fires on selectedDate change.
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  // Scroll the time slots into view when a date is selected (or changed)
  // on the details step. Defer to the next frame so the slots block has
  // rendered before we measure.
  useEffect(() => {
    if (step !== "details" || !selectedDate) return;
    const id = requestAnimationFrame(() => {
      timeSlotsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedDate, step]);

  // Fetch slots whenever the customer picks a date or toggles add-ons —
  // the time grid lives inline on the details step so customers can see
  // day + time availability together without going to the next screen.
  useEffect(() => {
    if (!selectedDate || !selectedService) return;
    if (step !== "details" && step !== "schedule") return;
    fetchSlots(selectedDate, selectedService);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedAddOns, selectedService, step]);

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
        const errData = await res.json();
        throw new Error(errData.error || "Booking failed");
      }
      const data = await res.json().catch(() => ({}));
      setBookedAsPending(data?.status === "pending");
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleMode || !selectedTime || !selectedDate) return;
    setSubmitting(true);
    try {
      const y = selectedDate.getFullYear();
      const m = (selectedDate.getMonth() + 1).toString().padStart(2, "0");
      const d = selectedDate.getDate().toString().padStart(2, "0");
      const newDate = `${y}-${m}-${d}`;
      const res = await fetch(`/api/booking/${rescheduleMode.bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: { e: rescheduleMode.tokenExpiry, s: rescheduleMode.tokenSignature },
          new_date: newDate,
          new_time: selectedTime,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData?.error || "Could not reschedule. Try another slot or call us.");
        return;
      }
      rescheduleMode.onDone();
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
              {step === "details" && "Pick a Date & Time"}
              {step === "schedule" && "Your Details"}
              {step === "confirm" && (bookedAsPending ? "Almost there!" : "Booking Confirmed!")}
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
                  {rescheduleMode ? (
                    <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
                      <div className="text-xs uppercase tracking-wider text-blue-900 font-semibold mb-1">Currently scheduled</div>
                      <div className="text-blue-900">
                        {rescheduleMode.originalDateLabel} at {rescheduleMode.originalTimeLabel}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mb-1">Step 1 of 2 — Details</div>
                  )}

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

                  {/* Date picker — month-grid (iOS Calendar style). 7-col grid per
                      month with leading empty cells so weekdays line up. */}
                  <div className="space-y-3">
                    {/* Weekday header — once at top, columns reused by every month below */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div
                          key={i}
                          className="text-[10px] font-medium uppercase tracking-wider opacity-50"
                          style={{ color: colors.foreground }}
                        >
                          {d}
                        </div>
                      ))}
                    </div>

                    {(() => {
                      // Group the 30-day window by year-month, padding leading empty
                      // cells in each group so the first date lands under the right weekday.
                      type Cell = Date | null;
                      type MonthGroup = { key: string; label: string; cells: Cell[] };
                      const groups: MonthGroup[] = [];
                      let current: MonthGroup | null = null;
                      const todayYear = new Date().getFullYear();
                      for (const d of dates) {
                        const key = `${d.getFullYear()}-${d.getMonth()}`;
                        if (!current || current.key !== key) {
                          const yearLabel = d.getFullYear() !== todayYear ? ` ${d.getFullYear()}` : "";
                          current = {
                            key,
                            label: `${MONTHS[d.getMonth()]}${yearLabel}`,
                            cells: Array(d.getDay()).fill(null),
                          };
                          groups.push(current);
                        }
                        current.cells.push(d);
                      }
                      return groups.map((group) => (
                        <div key={group.key}>
                          <div
                            className="mb-2 text-base font-bold"
                            style={{ color: colors.foreground }}
                          >
                            {group.label}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {group.cells.map((cell, i) => {
                              if (!cell) return <div key={`pad-${group.key}-${i}`} className="aspect-square" />;
                              const date = cell;
                              const weekdayName = WEEKDAYS_FULL[date.getDay()];
                              const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                              const dayClosed = workingHours ? workingHours[weekdayName] === null : false;
                              const dayBlocked = blockedDates.includes(iso);
                              const unavailable = dayClosed || dayBlocked;
                              const isSelected = selectedDate?.toDateString() === date.toDateString();
                              return (
                                <button
                                  key={iso}
                                  disabled={unavailable}
                                  onClick={() => !unavailable && handleDateSelect(date)}
                                  aria-label={`${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}${unavailable ? " — closed" : ""}`}
                                  className={`aspect-square flex items-center justify-center rounded-full text-sm transition-all ${
                                    unavailable ? "cursor-not-allowed opacity-25" : "hover:opacity-80"
                                  } ${isSelected ? "font-bold" : "font-medium"}`}
                                  style={{
                                    backgroundColor: isSelected ? colors.primary : "transparent",
                                    color: isSelected ? colors.background : colors.foreground,
                                  }}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Time slots — render inline once a date is selected so the
                      customer can confirm day + time availability together
                      without going to the next screen. Auto-scrolled into
                      view on date change (see useEffect above). */}
                  {selectedDate && (
                    <div ref={timeSlotsRef} className="space-y-2 scroll-mt-4">
                      <div className="text-xs font-semibold uppercase tracking-wider opacity-60" style={{ color: colors.foreground }}>
                        Available times — {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()].slice(0, 3)} {selectedDate.getDate()}
                      </div>
                      {loadingSlots ? (
                        <div className="flex justify-center py-6">
                          <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200" style={{ borderTopColor: colors.primary }} />
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
                        <p className="py-6 text-center text-sm opacity-50" style={{ color: colors.foreground }}>No availability on this day — try another date.</p>
                      )}
                    </div>
                  )}

                  <div className="sticky bottom-0 bg-white pt-3 pb-[env(safe-area-inset-bottom)] -mx-5 px-5 sm:static sm:bg-transparent sm:p-0 sm:m-0 sm:pb-0">
                    <button
                      type="button"
                      disabled={!selectedDate || !selectedTime}
                      onClick={() => {
                        if (selectedDate && selectedTime) {
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

            {/* Step: schedule — your details (contact form + Confirm CTA) */}
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
                      Step 2 of 2 — Your details
                    </span>
                  </div>

                  {/* Compact summary — service, date, picked time. The time
                      grid lives on the previous screen now. */}
                  <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: colors.muted, color: colors.foreground }}>
                    <span className="font-semibold">{selectedService?.name}</span> &middot;{" "}
                    {selectedDate && `${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`} &middot;{" "}
                    <span className="font-semibold">{selectedTime}</span>
                  </div>

                  <RunningTotalBar
                    baseDuration={selectedService.durationMinutes ?? 60}
                    basePrice={selectedService.price}
                    addOns={selectedAddOns}
                    colors={colors}
                  />

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

                  {/* Deposit panel — only renders if deposit is required and not in reschedule mode */}
                  {!rescheduleMode && isDepositRequired && (
                    <div
                      className="rounded-xl border-l-4 p-3"
                      style={{ backgroundColor: "#fffbeb", borderLeftColor: "#f59e0b", color: "#451a03" }}
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-bold text-sm">${depositAmount.toFixed(2)} deposit required</span>
                        <span className="text-xs opacity-70">non-refundable</span>
                      </div>
                      <div className="text-xs mb-2">Pay before your booking is confirmed:</div>
                      <div className="bg-white rounded p-2 leading-relaxed" style={{ color: "#451a03" }}>
                        <PaymentMethodList methods={paymentMethods} />
                      </div>
                      <div className="text-[10px] mt-2 opacity-70">
                        You&apos;ll get a confirmation once we receive payment.
                      </div>
                    </div>
                  )}

                  {/* Booking policies callout — only renders if owner set any and not in reschedule mode */}
                  {!rescheduleMode && policiesHeadline && (
                    <button
                      type="button"
                      onClick={() => setPoliciesOpen(true)}
                      className="w-full text-left rounded-xl px-4 py-3 text-sm flex items-start gap-2"
                      style={{ backgroundColor: `${colors.primary}12`, color: colors.foreground }}
                    >
                      <span aria-hidden className="flex-shrink-0">ℹ️</span>
                      <span className="flex-1">
                        <span className="font-semibold">{policiesHeadline}</span>
                        <span className="block text-xs opacity-70 mt-0.5" style={{ color: colors.primary }}>
                          View booking policies →
                        </span>
                      </span>
                    </button>
                  )}

                  <div className="sticky bottom-0 bg-white pt-3 pb-[env(safe-area-inset-bottom)] -mx-5 px-5 sm:static sm:bg-transparent sm:p-0 sm:m-0 sm:pb-0">
                    <button
                      type="button"
                      disabled={submitting || !selectedTime || (!rescheduleMode && (!customerName.trim() || !customerPhone.trim()))}
                      onClick={rescheduleMode ? handleReschedule : handleBook}
                      className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
                      style={{ backgroundColor: colors.primary, color: "white" }}
                    >
                      {submitting
                        ? rescheduleMode ? "Saving..." : "Booking..."
                        : rescheduleMode ? "Confirm reschedule"
                        : isDepositRequired ? "Confirm & I'll pay deposit"
                        : "Confirm booking"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step: confirm — pending deposit variant or success state */}
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                {bookedAsPending ? (
                  <div className="py-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 12, delay: 0.1 }}
                      className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                      style={{ backgroundColor: "#fefce8", border: "3px solid #f59e0b", color: "#f59e0b", fontSize: 30 }}
                    >
                      ⏳
                    </motion.div>
                    <h3 className="mb-1 text-lg font-bold">Almost there!</h3>
                    <p className="mb-4 text-sm opacity-70">Pay your deposit to lock in this slot.</p>
                    <div
                      className="mb-3 rounded-xl p-4 text-left"
                      style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs font-semibold" style={{ color: "#92400e" }}>Deposit due</span>
                        <span className="text-lg font-bold" style={{ color: "#78350f" }}>${depositAmount.toFixed(2)}</span>
                      </div>
                      <div className="rounded bg-white p-2" style={{ color: "#451a03" }}>
                        <PaymentMethodList methods={paymentMethods} />
                      </div>
                    </div>
                    <div className="mb-3 rounded-lg bg-gray-50 p-3 text-left text-sm">
                      <div className="text-xs text-gray-500 mb-1">Pending booking</div>
                      <div className="font-semibold">{selectedService?.name} · {selectedDate?.toLocaleDateString()} · {selectedTime}</div>
                    </div>
                    <p className="mb-4 text-xs text-gray-500 leading-relaxed">
                      We&apos;ll text and email you once your deposit is received and your booking is confirmed.
                    </p>
                    <Button
                      size="lg"
                      onClick={onClose}
                      className="w-full rounded-xl py-3 text-sm font-bold"
                      style={{ backgroundColor: colors.primary, color: colors.background }}
                    >
                      Got it
                    </Button>
                  </div>
                ) : (
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
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Booking-policies drawer — slides up from the bottom of the modal,
            covers the modal content with a scrim. Renders full owner text
            with newlines preserved (whitespace-pre-wrap). Tap outside or
            the close button to dismiss. */}
        <AnimatePresence>
          {policiesOpen && bookingPolicies && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex items-end bg-black/40"
              onClick={() => setPoliciesOpen(false)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="w-full max-h-[80%] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
                onClick={(e) => e.stopPropagation()}
                style={{ color: colors.foreground }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold">Booking policies</h3>
                  <button
                    type="button"
                    onClick={() => setPoliciesOpen(false)}
                    aria-label="Close"
                    className="text-2xl leading-none text-gray-400 hover:text-gray-700 -mt-1"
                  >
                    ×
                  </button>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {bookingPolicies}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
