"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import type { AddOn } from "@/lib/ai/types";
import { computeAvailableStarts, formatTimeRange, formatDuration } from "@/lib/availability";
import {
  type SimpleService,
  DAYS,
  MONTHS,
  WEEKDAYS_FULL,
  ServiceDetailsPanel,
  RunningTotalBar,
} from "./CustomerBookingFlow";

// Mock-only working-hours used for demo/preview surfaces. Mon-Sat 10-19,
// Sunday closed. Mirrors what the live flow gets from the owner's settings.
const MOCK_WORKING_HOURS = {
  Sunday: null,
  Monday: { openHour: 10, closeHour: 19 },
  Tuesday: { openHour: 10, closeHour: 19 },
  Wednesday: { openHour: 10, closeHour: 19 },
  Thursday: { openHour: 10, closeHour: 19 },
  Friday: { openHour: 10, closeHour: 19 },
  Saturday: { openHour: 10, closeHour: 17 },
} as const;

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
  const [step, setStep] = useState<"service" | "details" | "schedule" | "success">(
    initialService ? "details" : "service",
  );
  const [selectedService, setSelectedService] = useState<SimpleService | null>(initialService);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const timeSlotsRef = useRef<HTMLDivElement>(null);

  const allSteps = ["service", "details", "schedule", "success"] as const;

  // Generate 30 days of dates starting tomorrow (matches live window).
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

  // Derive available time slots for the selected date+service. Recomputed
  // synchronously since the mock has no backend bookings to fetch.
  const totalDuration = (selectedService?.durationMinutes ?? 60)
    + selectedAddOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0);

  const availableSlots = selectedDate && selectedService
    ? computeAvailableStarts({
        date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`,
        durationMinutes: totalDuration,
        workingHours: MOCK_WORKING_HOURS,
        existingBookings: [],
        maxPerSlot: 1,
        blockedDates: [],
      }).map((h) => {
        const period = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:00 ${period}`;
      })
    : [];

  // Auto-scroll the time grid into view on date change (matches live).
  useEffect(() => {
    if (step !== "details" || !selectedDate) return;
    const id = requestAnimationFrame(() => {
      timeSlotsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedDate, step]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  };

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
            <p className="text-xs font-medium uppercase tracking-wider opacity-60" style={{ color: colors.background }}>
              {businessName}
            </p>
            <h3 className="text-lg font-bold" style={{ color: colors.background }}>
              {step === "service" && "Select a Service"}
              {step === "details" && "Pick a Date & Time"}
              {step === "schedule" && "Your Details"}
              {step === "success" && "Booking Confirmed!"}
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
          {allSteps.map((s, i) => (
            <div
              key={s}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: step === s ? 24 : 8,
                backgroundColor: allSteps.indexOf(step) >= i ? colors.primary : `${colors.foreground}20`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:max-h-[calc(90vh-120px)]">
          <AnimatePresence mode="wait">
            {/* Step: service — service list picker */}
            {step === "service" && (
              <motion.div key="service" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
                <div className="space-y-2 py-2">
                  {services.map((svc, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedService(svc);
                        setSelectedAddOns([]);
                        setStep("details");
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all hover:scale-[1.01]"
                      style={{ backgroundColor: colors.muted, color: colors.foreground }}
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

            {/* Step: details — service summary + add-ons + calendar + inline times */}
            {step === "details" && selectedService && (
              <motion.div key="details" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
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
                                      return prev;
                                    }
                                    return [...prev, ao];
                                  });
                                  setSelectedTime(null);
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
                          <div className="mb-2 text-base font-bold" style={{ color: colors.foreground }}>
                            {group.label}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {group.cells.map((cell, i) => {
                              if (!cell) return <div key={`pad-${group.key}-${i}`} className="aspect-square" />;
                              const date = cell;
                              const weekdayName = WEEKDAYS_FULL[date.getDay()];
                              const dayClosed = MOCK_WORKING_HOURS[weekdayName as keyof typeof MOCK_WORKING_HOURS] === null;
                              const isSelected = selectedDate?.toDateString() === date.toDateString();
                              return (
                                <button
                                  key={date.toISOString()}
                                  disabled={dayClosed}
                                  onClick={() => !dayClosed && handleDateSelect(date)}
                                  aria-label={`${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}${dayClosed ? " — closed" : ""}`}
                                  className={`aspect-square flex items-center justify-center rounded-full text-sm transition-all ${
                                    dayClosed ? "cursor-not-allowed opacity-25" : "hover:opacity-80"
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

                  {/* Time slots — render inline once a date is picked */}
                  {selectedDate && (
                    <div ref={timeSlotsRef} className="space-y-2 scroll-mt-4">
                      <div className="text-xs font-semibold uppercase tracking-wider opacity-60" style={{ color: colors.foreground }}>
                        Available times — {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()].slice(0, 3)} {selectedDate.getDate()}
                      </div>
                      {availableSlots.length > 0 ? (
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
                        <p className="py-6 text-center text-sm opacity-50" style={{ color: colors.foreground }}>
                          No availability on this day — try another date.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="sticky bottom-0 bg-white pt-3 pb-[env(safe-area-inset-bottom)] -mx-5 px-5 sm:static sm:bg-transparent sm:p-0 sm:m-0 sm:pb-0">
                    <button
                      type="button"
                      disabled={!selectedDate || !selectedTime}
                      onClick={() => {
                        if (selectedDate && selectedTime) setStep("schedule");
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
              <motion.div key="schedule" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
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
                    <span className="text-xs text-gray-500">Step 2 of 2 — Your details</span>
                  </div>

                  <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: colors.muted, color: colors.foreground }}>
                    <span className="font-semibold">{selectedService.name}</span> &middot;{" "}
                    {`${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`} &middot;{" "}
                    <span className="font-semibold">{selectedTime}</span>
                  </div>

                  <RunningTotalBar
                    baseDuration={selectedService.durationMinutes ?? 60}
                    basePrice={selectedService.price}
                    addOns={selectedAddOns}
                    colors={colors}
                  />

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your Name *"
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
                      style={{ borderColor: `${colors.foreground}20` }}
                    />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone Number *"
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
                      style={{ borderColor: `${colors.foreground}20` }}
                    />
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (optional — for calendar invite)"
                      className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
                      style={{ borderColor: `${colors.foreground}20` }}
                    />
                  </div>

                  <Button
                    onClick={() => setStep("success")}
                    disabled={!customerName.trim() || !customerPhone.trim()}
                    className="w-full rounded-xl py-5 text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: colors.primary, color: colors.background }}
                  >
                    Confirm Booking
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step: success — confirmation screen */}
            {step === "success" && selectedService && selectedDate && selectedTime && (
              <motion.div key="success" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
                <div className="py-4 text-center">
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
                  <p className="mb-2 text-sm opacity-60" style={{ color: colors.foreground }}>
                    Your appointment has been booked.
                  </p>
                  {customerEmail.trim() && (
                    <p className="mb-4 text-xs opacity-40" style={{ color: colors.foreground }}>
                      A confirmation with calendar invite was sent to {customerEmail.trim()}.
                    </p>
                  )}

                  <div className="mb-6 rounded-xl p-4 text-left" style={{ backgroundColor: colors.muted }}>
                    <div className="space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Service</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>{selectedService.name}</span>
                      </div>
                      {selectedAddOns.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Add-ons</span>
                          <span className="text-sm font-semibold text-right" style={{ color: colors.foreground }}>
                            {selectedAddOns.map((a) => a.name).join(", ")}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Date</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>
                          {`${DAYS[selectedDate.getDay()]}, ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm opacity-60" style={{ color: colors.foreground }}>Time</span>
                        <span className="text-sm font-semibold" style={{ color: colors.foreground }}>
                          {formatTimeRange(selectedTime, totalDuration)}
                        </span>
                      </div>
                      <div className="border-t pt-2.5" style={{ borderColor: `${colors.foreground}10` }}>
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold" style={{ color: colors.foreground }}>Total</span>
                          <span className="text-sm font-bold" style={{ color: colors.primary }}>
                            {(() => {
                              const numericPrice = parseFloat(selectedService.price.replace(/[^0-9.]/g, "")) || 0;
                              const total = numericPrice + selectedAddOns.reduce((sum, a) => sum + a.price_delta, 0);
                              return `$${total.toFixed(2)}`;
                            })()}
                          </span>
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

                  <p className="mt-4 text-[11px] italic opacity-40" style={{ color: colors.foreground }}>
                    Demo preview · no actual booking was made.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
