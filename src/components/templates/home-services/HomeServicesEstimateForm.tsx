"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { ESTIMATE_PHOTO_LIMITS } from "@/lib/validation/estimate-photos";
import type { EstimateDeliveryMode } from "./estimate-modal-state";

type FieldName = "name" | "phone" | "service" | "location" | "photos";
type ErrorReason =
  | "required"
  | "invalid"
  | "file_too_large"
  | "too_many_files"
  | "total_too_large";

interface Props {
  services: ServiceItem[];
  service: string;
  colors: ThemeColors;
  deliveryMode: EstimateDeliveryMode;
  onComplete: () => void;
}

interface ApiFieldError {
  field: string;
  reason: string;
}

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const PHOTO_TYPES = new Set(PHOTO_ACCEPT.split(","));

export function HomeServicesEstimateForm({
  services,
  service,
  colors,
  deliveryMode,
  onComplete,
}: Props) {
  const t = useTranslations("homeServices");
  const id = useId();
  const refs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, ErrorReason>>>(
    {},
  );
  const [honeypot, setHoneypot] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    service,
    location: "",
    description: "",
    preferredResponse: "sms",
  });

  const inputClass = "w-full rounded-xl border px-3 py-2.5 text-base";
  const inputStyle = {
    backgroundColor: colors.muted,
    borderColor: `${colors.foreground}25`,
  };

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function message(reason: ErrorReason) {
    if (reason === "file_too_large") return t("estimate.errors.fileTooLarge");
    if (reason === "too_many_files") return t("estimate.errors.tooManyFiles");
    if (reason === "total_too_large") return t("estimate.errors.totalTooLarge");
    if (reason === "invalid") return t("estimate.errors.invalidImage");
    return t("estimate.errors.required");
  }

  function focusFirst(next: Partial<Record<FieldName, ErrorReason>>) {
    for (const name of [
      "name",
      "phone",
      "service",
      "location",
      "photos",
    ] as FieldName[]) {
      if (next[name]) {
        refs.current[name]?.focus();
        break;
      }
    }
  }

  function validateRequired() {
    const next: Partial<Record<FieldName, ErrorReason>> = {};
    for (const name of ["name", "phone", "service", "location"] as const) {
      if (!form[name].trim()) next[name] = "required";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      setStage(1);
      queueMicrotask(() => focusFirst(next));
      return false;
    }
    return true;
  }

  function selectPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const combined = [...photos, ...selected];
    let reason: ErrorReason | undefined;
    if (combined.length > ESTIMATE_PHOTO_LIMITS.maxFiles)
      reason = "too_many_files";
    else if (
      combined.some((file) => file.size > ESTIMATE_PHOTO_LIMITS.maxBytesPerFile)
    )
      reason = "file_too_large";
    else if (
      combined.reduce((total, file) => total + file.size, 0) >
      ESTIMATE_PHOTO_LIMITS.maxTotalBytes
    )
      reason = "total_too_large";
    else if (combined.some((file) => !PHOTO_TYPES.has(file.type)))
      reason = "invalid";
    if (reason) {
      setErrors((current) => ({ ...current, photos: reason }));
      return;
    }
    setErrors((current) => ({ ...current, photos: undefined }));
    setPhotos(combined);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGlobalError("");
    if (!validateRequired() || errors.photos) return;
    setBusy(true);
    try {
      if (deliveryMode === "preview_mock") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        onComplete();
        return;
      }
      const body = new FormData();
      body.set("name", form.name.trim());
      body.set("phone", form.phone.trim());
      body.set("service", form.service.trim());
      body.set("location", form.location.trim());
      body.set("description", form.description.trim());
      body.set("preferred_response", form.preferredResponse);
      body.set("company_website", honeypot);
      photos.forEach((photo) => body.append("photos", photo));
      const response = await fetch("/api/estimate", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        errors?: ApiFieldError[];
      } | null;
      if (response.status === 429 || data?.code === "rate_limited") {
        setGlobalError(t("estimate.rateLimited"));
        return;
      }
      if (response.status === 503 || data?.code === "estimate_unavailable") {
        setGlobalError(t("estimate.unavailable"));
        return;
      }
      if (data?.ok) {
        onComplete();
        return;
      }
      if (data?.errors?.length) {
        const next: Partial<Record<FieldName, ErrorReason>> = {};
        for (const error of data.errors) {
          const name = error.field.startsWith("photos")
            ? "photos"
            : (error.field as FieldName);
          if (
            !["name", "phone", "service", "location", "photos"].includes(name)
          )
            continue;
          next[name] = (
            ["file_too_large", "too_many_files", "total_too_large"].includes(
              error.reason,
            )
              ? error.reason
              : error.reason === "required"
                ? "required"
                : "invalid"
          ) as ErrorReason;
        }
        setErrors(next);
        setStage(next.photos && Object.keys(next).length === 1 ? 2 : 1);
        queueMicrotask(() => focusFirst(next));
        return;
      }
      setGlobalError(t("estimate.unavailable"));
    } catch {
      setGlobalError(t("estimate.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  const fieldProps = (name: FieldName) => ({
    required: name !== "photos",
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  const errorFor = (name: FieldName) =>
    errors[name] ? (
      <p
        id={`${id}-${name}-error`}
        role="alert"
        className="mt-1 text-sm text-red-700"
      >
        {message(errors[name]!)}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate>
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${id}-company`}>{t("estimate.honeypotLabel")}</label>
        <input
          id={`${id}-company`}
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <p className="mb-4 text-sm font-semibold">
        {stage} {t("estimate.modal.of")} 2 ·{" "}
        {t(
          stage === 1
            ? "estimate.modal.stageContact"
            : "estimate.modal.stageProject",
        )}
      </p>
      {globalError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {globalError}
        </p>
      )}
      {stage === 1 ? (
        <div className="space-y-4">
          <label className="block" htmlFor={`${id}-name`}>
            {t("estimate.fields.name.label")}
          </label>
          <input
            ref={(node) => {
              refs.current.name = node;
            }}
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            className={inputClass}
            style={inputStyle}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            {...fieldProps("name")}
          />
          {errorFor("name")}
          <label className="block" htmlFor={`${id}-phone`}>
            {t("estimate.fields.phone.label")}
          </label>
          <input
            ref={(node) => {
              refs.current.phone = node;
            }}
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className={inputClass}
            style={inputStyle}
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            {...fieldProps("phone")}
          />
          {errorFor("phone")}
          <label className="block" htmlFor={`${id}-service`}>
            {t("estimate.fields.service.label")}
          </label>
          <select
            ref={(node) => {
              refs.current.service = node;
            }}
            id={`${id}-service`}
            name="service"
            className={inputClass}
            style={inputStyle}
            value={form.service}
            onChange={(e) => setField("service", e.target.value)}
            {...fieldProps("service")}
          >
            <option value="">{t("estimate.fields.service.placeholder")}</option>
            {services.map((item) => (
              <option key={item.client_id || item.name}>{item.name}</option>
            ))}
          </select>
          {errorFor("service")}
          <label className="block" htmlFor={`${id}-location`}>
            {t("estimate.modal.cityZip")}
          </label>
          <input
            ref={(node) => {
              refs.current.location = node;
            }}
            id={`${id}-location`}
            name="location"
            autoComplete="postal-code"
            inputMode="text"
            className={inputClass}
            style={inputStyle}
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
            {...fieldProps("location")}
          />
          {errorFor("location")}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block" htmlFor={`${id}-description`}>
            {t("estimate.fields.description.label")}{" "}
            <span>({t("estimate.modal.optional")})</span>
          </label>
          <textarea
            id={`${id}-description`}
            name="description"
            className={inputClass}
            style={inputStyle}
            rows={4}
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
          <fieldset>
            <legend>{t("estimate.fields.preferredResponse.label")}</legend>
            {(["sms", "call", "whatsapp"] as const).map((option) => (
              <label key={option} className="mr-4 inline-flex gap-2">
                <input
                  type="radio"
                  name="preferred_response"
                  value={option}
                  checked={form.preferredResponse === option}
                  onChange={() => setField("preferredResponse", option)}
                />
                {t(`estimate.preferredResponse.${option}`)}
              </label>
            ))}
          </fieldset>
          <label className="block" htmlFor={`${id}-photos`}>
            {t("estimate.photos.label")}{" "}
            <span>({t("estimate.modal.optional")})</span>
          </label>
          <input
            ref={(node) => {
              refs.current.photos = node;
            }}
            id={`${id}-photos`}
            name="photos"
            className="mt-2 block w-full"
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            onChange={selectPhotos}
            aria-invalid={Boolean(errors.photos)}
            aria-describedby={errors.photos ? `${id}-photos-error` : undefined}
          />
          {errorFor("photos")}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        {stage === 2 && (
          <button
            type="button"
            className="min-h-11 px-4"
            onClick={() => setStage(1)}
          >
            {t("estimate.modal.back")}
          </button>
        )}
        {stage === 1 ? (
          <button
            type="button"
            className="min-h-11 rounded-full px-5"
            style={{ backgroundColor: colors.secondary }}
            onClick={() => {
              if (validateRequired()) setStage(2);
            }}
          >
            {t("estimate.modal.continue")}
          </button>
        ) : (
          <button
            disabled={busy}
            className="min-h-11 rounded-full px-5"
            style={{ backgroundColor: colors.secondary }}
          >
            {busy ? t("estimate.submitting") : t("estimate.modal.submit")}
          </button>
        )}
      </div>
    </form>
  );
}
