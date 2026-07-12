"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { ESTIMATE_PHOTO_LIMITS } from "@/lib/validation/estimate-photos";
import { getHomeServicesReadable } from "./home-services-theme";

type FieldName =
  | "name"
  | "phone"
  | "service"
  | "location"
  | "description"
  | "preferred_response"
  | "photos";

type FieldErrorReason =
  | "required"
  | "too_long"
  | "invalid"
  | "file_too_large"
  | "invalid_image"
  | "too_many_files"
  | "total_too_large"
  | "type_mismatch";

interface ApiFieldError {
  field: string;
  reason: string;
}

interface HomeServicesEstimateFormProps {
  services: ServiceItem[];
  phoneHref: string | null;
  messageHref: string | null;
  colors: ThemeColors;
}

interface FormState {
  name: string;
  phone: string;
  service: string;
  location: string;
  description: string;
  preferredResponse: "call" | "sms" | "whatsapp" | "";
}

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function parseHashServiceParam(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.slice(1);
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return "";
  return new URLSearchParams(hash.slice(queryIndex + 1)).get("service")?.trim() ?? "";
}

function fieldFromApiError(field: string): FieldName | null {
  if (
    field === "name" ||
    field === "phone" ||
    field === "service" ||
    field === "location" ||
    field === "description" ||
    field === "preferred_response"
  ) {
    return field;
  }
  if (field === "photos" || field.startsWith("photos.")) return "photos";
  return null;
}

function mapPhotoReason(reason: string): FieldErrorReason | null {
  switch (reason) {
    case "file_too_large":
    case "invalid_image":
    case "too_many_files":
    case "total_too_large":
    case "type_mismatch":
      return reason;
    default:
      return null;
  }
}

export function HomeServicesEstimateForm({
  services,
  phoneHref,
  messageHref,
  colors,
}: HomeServicesEstimateFormProps) {
  const t = useTranslations("homeServices");
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  const serviceNames = services.map((item) => item.name);
  const readable = getHomeServicesReadable(colors);
  const headingColor = readable.headingOnBg;
  const textColor = readable.bodyOnBg;
  const labelColor = readable.labelOnBg;
  const inputBorder = `${colors.foreground}20`;
  const estimateTextColor = readable.ctaOnSecondary;
  const outlineTextColor = readable.outlineOnBg;
  const errorColor = "#b91c1c";

  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    service: "",
    location: "",
    description: "",
    preferredResponse: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, FieldErrorReason>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);

  const applyServicePrefill = useCallback(
    (serviceParam: string) => {
      if (!serviceParam) return;
      if (!serviceNames.includes(serviceParam)) return;
      setForm((current) => ({ ...current, service: serviceParam }));
      const heading = document.getElementById("estimate-heading");
      heading?.focus({ preventScroll: true });
    },
    [serviceNames],
  );

  useEffect(() => {
    applyServicePrefill(parseHashServiceParam());

    const onHashChange = () => {
      applyServicePrefill(parseHashServiceParam());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [applyServicePrefill]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      const errorKey: FieldName =
        key === "preferredResponse" ? "preferred_response" : key;
      delete next[errorKey];
      return next;
    });
  };

  const errorMessage = (reason: FieldErrorReason): string => {
    switch (reason) {
      case "file_too_large":
        return t("estimate.errors.fileTooLarge");
      case "invalid_image":
        return t("estimate.errors.invalidImage");
      case "too_many_files":
        return t("estimate.errors.tooManyFiles");
      case "total_too_large":
        return t("estimate.errors.totalTooLarge");
      case "type_mismatch":
        return t("estimate.errors.invalidImage");
      case "invalid":
        return t("estimate.errors.invalid");
      case "too_long":
        return t("estimate.errors.tooLong");
      default:
        return t("estimate.errors.required");
    }
  };

  const focusFirstInvalidField = (errors: Partial<Record<FieldName, FieldErrorReason>>) => {
    const order: FieldName[] = [
      "name",
      "phone",
      "service",
      "location",
      "description",
      "preferred_response",
      "photos",
    ];
    for (const field of order) {
      if (errors[field]) {
        fieldRefs.current[field]?.focus();
        return;
      }
    }
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    setFiles((current) => {
      const combined = [...current, ...selected].slice(0, ESTIMATE_PHOTO_LIMITS.maxFiles);
      return combined;
    });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.photos;
      return next;
    });
  };

  const removePhoto = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);
    setFieldErrors({});
    setSubmitting(true);

    const formData = new FormData();
    formData.set("name", form.name.trim());
    formData.set("phone", form.phone.trim());
    formData.set("service", form.service.trim());
    formData.set("location", form.location.trim());
    formData.set("description", form.description.trim());
    formData.set("preferred_response", form.preferredResponse);
    formData.set("company_website", honeypot);
    files.forEach((file) => formData.append("photos", file));

    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; photoWarning?: boolean }
        | { ok: false; code?: string; errors?: ApiFieldError[] }
        | null;

      if (response.status === 429 || (data?.ok === false && data.code === "rate_limited")) {
        setGlobalError(t("estimate.rateLimited"));
        return;
      }

      if (response.status === 503 || (data?.ok === false && data.code === "estimate_unavailable")) {
        setGlobalError(t("estimate.unavailable"));
        return;
      }

      if (data?.ok === true) {
        setPhotoWarning(Boolean(data.photoWarning));
        setSubmitted(true);
        return;
      }

      if (data?.ok === false && data.errors?.length) {
        const mapped: Partial<Record<FieldName, FieldErrorReason>> = {};
        for (const error of data.errors) {
          const field = fieldFromApiError(error.field);
          if (!field) continue;
          const photoReason = field === "photos" ? mapPhotoReason(error.reason) : null;
          const reason = photoReason ?? (
            error.reason === "required" ||
            error.reason === "too_long" ||
            error.reason === "invalid"
              ? error.reason
              : "invalid"
          );
          mapped[field] = reason;
        }
        setFieldErrors(mapped);
        focusFirstInvalidField(mapped);
        return;
      }

      setGlobalError(t("estimate.unavailable"));
    } catch {
      setGlobalError(t("estimate.unavailable"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.muted,
    color: readable.cardBodyOnMuted,
    borderColor: inputBorder,
  };

  if (submitted) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-[2rem] border p-6 text-center sm:p-8"
        style={{
          backgroundColor: colors.background,
          borderColor: `${colors.foreground}12`,
        }}
      >
        <h2
          id="estimate-heading"
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: headingColor }}
        >
          {t("estimate.success.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed" style={{ color: textColor }}>
          {t("estimate.success.body")}
        </p>
        {photoWarning && (
          <p
            className="mx-auto mt-4 max-w-2xl rounded-xl border px-4 py-3 text-sm leading-relaxed"
            role="status"
            style={{
              color: textColor,
              borderColor: `${colors.secondary}40`,
              backgroundColor: `${colors.secondary}12`,
            }}
          >
            {t("estimate.photoWarning")}
          </p>
        )}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {phoneHref && (
            <a
              href={phoneHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
            >
              {t("estimate.directCall")}
            </a>
          )}
          {messageHref && (
            <a
              href={messageHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                borderColor: `${colors.primary}35`,
                color: outlineTextColor,
                backgroundColor: colors.background,
              }}
            >
              {t("estimate.directMessage")}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-3xl rounded-[2rem] border p-6 sm:p-8"
      style={{
        backgroundColor: colors.background,
        borderColor: `${colors.foreground}12`,
      }}
    >
      <div className="mb-8 text-center">
        <h2
          id="estimate-heading"
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: headingColor }}
        >
          {t("estimate.formTitle")}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed" style={{ color: textColor, opacity: 0.9 }}>
          {t("estimate.formSubtitle")}
        </p>
      </div>

      {globalError && (
        <p
          className="mb-4 rounded-xl border px-4 py-3 text-sm"
          role="alert"
          style={{ color: errorColor, borderColor: `${errorColor}40`, backgroundColor: "#fef2f2" }}
        >
          {globalError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="sr-only" aria-hidden="true">
          <label htmlFor={`${formId}-company-website`}>{t("estimate.honeypotLabel")}</label>
          <input
            id={`${formId}-company-website`}
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor={`${formId}-name`} className="mb-1.5 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.name.label")}
          </label>
          <input
            ref={(node) => {
              fieldRefs.current.name = node;
            }}
            id={`${formId}-name`}
            name="name"
            type="text"
            required
            autoComplete="name"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder={t("estimate.fields.name.example")}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? `${formId}-name-error` : undefined}
            className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
            style={{
              ...inputStyle,
              ...(fieldErrors.name ? { borderColor: errorColor } : {}),
            }}
          />
          {fieldErrors.name && (
            <p id={`${formId}-name-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.name)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${formId}-phone`} className="mb-1.5 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.phone.label")}
          </label>
          <input
            ref={(node) => {
              fieldRefs.current.phone = node;
            }}
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setField("phone", event.target.value)}
            placeholder={t("estimate.fields.phone.example")}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? `${formId}-phone-error` : undefined}
            className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
            style={{
              ...inputStyle,
              ...(fieldErrors.phone ? { borderColor: errorColor } : {}),
            }}
          />
          {fieldErrors.phone && (
            <p id={`${formId}-phone-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.phone)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${formId}-service`} className="mb-1.5 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.service.label")}
          </label>
          {serviceNames.length > 0 ? (
            <select
              ref={(node) => {
                fieldRefs.current.service = node;
              }}
              id={`${formId}-service`}
              name="service"
              required
              value={form.service}
              onChange={(event) => setField("service", event.target.value)}
              aria-invalid={Boolean(fieldErrors.service)}
              aria-describedby={fieldErrors.service ? `${formId}-service-error` : undefined}
              className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                ...inputStyle,
                ...(fieldErrors.service ? { borderColor: errorColor } : {}),
              }}
            >
              <option value="">{t("estimate.fields.service.placeholder")}</option>
              {serviceNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={(node) => {
                fieldRefs.current.service = node;
              }}
              id={`${formId}-service`}
              name="service"
              type="text"
              required
              value={form.service}
              onChange={(event) => setField("service", event.target.value)}
              placeholder={t("estimate.fields.service.example")}
              aria-invalid={Boolean(fieldErrors.service)}
              aria-describedby={fieldErrors.service ? `${formId}-service-error` : undefined}
              className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
              style={{
                ...inputStyle,
                ...(fieldErrors.service ? { borderColor: errorColor } : {}),
              }}
            />
          )}
          {fieldErrors.service && (
            <p id={`${formId}-service-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.service)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${formId}-location`} className="mb-1.5 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.location.label")}
          </label>
          <input
            ref={(node) => {
              fieldRefs.current.location = node;
            }}
            id={`${formId}-location`}
            name="location"
            type="text"
            required
            autoComplete="street-address"
            value={form.location}
            onChange={(event) => setField("location", event.target.value)}
            placeholder={t("estimate.fields.location.example")}
            aria-invalid={Boolean(fieldErrors.location)}
            aria-describedby={fieldErrors.location ? `${formId}-location-error` : undefined}
            className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
            style={{
              ...inputStyle,
              ...(fieldErrors.location ? { borderColor: errorColor } : {}),
            }}
          />
          {fieldErrors.location && (
            <p id={`${formId}-location-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.location)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${formId}-description`} className="mb-1.5 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.description.label")}
          </label>
          <textarea
            ref={(node) => {
              fieldRefs.current.description = node;
            }}
            id={`${formId}-description`}
            name="description"
            required
            rows={4}
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder={t("estimate.fields.description.example")}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? `${formId}-description-error` : undefined}
            className="w-full resize-y rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
            style={{
              ...inputStyle,
              ...(fieldErrors.description ? { borderColor: errorColor } : {}),
            }}
          />
          {fieldErrors.description && (
            <p id={`${formId}-description-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.description)}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 block text-sm font-semibold" style={{ color: labelColor }}>
            {t("estimate.fields.preferredResponse.label")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["call", "sms", "whatsapp"] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm"
                style={{
                  backgroundColor: form.preferredResponse === option ? `${colors.secondary}18` : colors.muted,
                  borderColor:
                    fieldErrors.preferred_response && form.preferredResponse !== option
                      ? errorColor
                      : inputBorder,
                  color: textColor,
                }}
              >
                <input
                  ref={
                    option === "call"
                      ? (node) => {
                          fieldRefs.current.preferred_response = node;
                        }
                      : undefined
                  }
                  type="radio"
                  name="preferred_response"
                  value={option}
                  checked={form.preferredResponse === option}
                  onChange={() => setField("preferredResponse", option)}
                  className="h-4 w-4 shrink-0"
                />
                <span>{t(`estimate.preferredResponse.${option}`)}</span>
              </label>
            ))}
          </div>
          {fieldErrors.preferred_response && (
            <p className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.preferred_response)}
            </p>
          )}
        </fieldset>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: labelColor }}>
                {t("estimate.photos.label")}
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: textColor, opacity: 0.8 }}>
                {t("estimate.photos.maxFive")} · {t("estimate.photos.maxSize")} · {t("estimate.photos.acceptedTypes")}
              </p>
            </div>
            <button
              type="button"
              ref={(node) => {
                fieldRefs.current.photos = node;
              }}
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= ESTIMATE_PHOTO_LIMITS.maxFiles}
              className="inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: `${colors.primary}35`,
                color: outlineTextColor,
                backgroundColor: colors.background,
              }}
            >
              {t("estimate.photos.add")}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="sr-only"
            onChange={handlePhotoSelect}
            aria-describedby={fieldErrors.photos ? `${formId}-photos-error` : undefined}
          />
          {files.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border" style={{ borderColor: inputBorder }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previews[index]}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute inset-x-2 bottom-2 rounded-full px-2 py-1 text-xs font-semibold shadow-sm"
                    style={{ backgroundColor: colors.background, color: labelColor }}
                  >
                    {t("estimate.photos.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fieldErrors.photos && (
            <p id={`${formId}-photos-error`} className="mt-1.5 text-sm" style={{ color: errorColor }} role="alert">
              {errorMessage(fieldErrors.photos)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 text-sm font-semibold shadow-sm transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
        >
          {submitting ? t("estimate.submitting") : t("estimate.submit")}
        </button>
      </form>
    </div>
  );
}
