"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import {
  OWNER_PROFILE_LIMITS,
  type EditableOwnerProfile,
} from "@/lib/owner-profile";
import { ChangePinForm } from "../_components/ChangePinForm";
import { SignOutButton } from "../_components/SignOutButton";

type ProfileClientProps = {
  initialProfile: EditableOwnerProfile;
  loadWarning: string | null;
};

type FieldErrors = Partial<Record<keyof EditableOwnerProfile, string>>;

type ValidationError = {
  field?: unknown;
  reason?: unknown;
};

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const cardClass =
  "rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm";
const labelClass = "text-sm font-black text-warm-deep";
const inputClass =
  "mt-1.5 min-h-12 w-full rounded-xl border border-warm-cream1 bg-white px-3 py-2.5 text-base font-semibold text-warm-deep outline-none transition placeholder:text-warm-textMuted/55 focus:border-pop-pink focus:ring-2 focus:ring-pop-pink/15";

function conciseFieldError(reason: string): string {
  if (reason === "required") return "This field is required.";
  if (reason === "invalid email") return "Enter a valid email address.";
  if (reason === "must be an https URL") return "Use a secure image URL.";
  if (reason.startsWith("max ")) {
    return `Please use ${reason.replace("max ", "no more than ")}.`;
  }
  return "Please check this field.";
}

export function ProfileClient({
  initialProfile,
  loadWarning,
}: ProfileClientProps) {
  const photoInputId = useId();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<EditableOwnerProfile>(initialProfile);
  const [persistedProfile, setPersistedProfile] =
    useState<EditableOwnerProfile>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(profile) !== JSON.stringify(persistedProfile);

  function updateField<K extends keyof EditableOwnerProfile>(
    field: K,
    value: EditableOwnerProfile[K],
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setGeneralError(null);
    setSaved(false);
  }

  async function saveProfile() {
    const snapshotToSave = profile;
    setSaving(true);
    setFieldErrors({});
    setGeneralError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshotToSave),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        if (body && typeof body === "object") {
          const errorBody = body as {
            error?: unknown;
            errors?: unknown;
          };
          if (Array.isArray(errorBody.errors)) {
            const nextErrors: FieldErrors = {};
            for (const item of errorBody.errors as ValidationError[]) {
              if (
                typeof item.field === "string" &&
                item.field in snapshotToSave &&
                typeof item.reason === "string"
              ) {
                nextErrors[item.field as keyof EditableOwnerProfile] =
                  conciseFieldError(item.reason);
              }
            }
            setFieldErrors(nextErrors);
          }
          setGeneralError(
            typeof errorBody.error === "string" &&
              errorBody.error !== "Validation failed"
              ? errorBody.error
              : "Please fix the highlighted fields.",
          );
        } else {
          setGeneralError("We could not save your profile. Please try again.");
        }
        return;
      }

      if (!body || typeof body !== "object") {
        setGeneralError("We could not confirm your saved profile. Please try again.");
        return;
      }

      const savedProfile = body as EditableOwnerProfile;
      setProfile(savedProfile);
      setPersistedProfile(savedProfile);
      setSaved(true);
    } catch {
      setGeneralError("We could not save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;

    setUploadError(null);
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setUploadError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError("Choose an image that is 5MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setUploading(true);

    try {
      const response = await fetch("/api/admin/profile/upload-photo", {
        method: "POST",
        body: formData,
      });
      const body: unknown = await response.json().catch(() => null);
      const uploadBody =
        body && typeof body === "object"
          ? (body as { url?: unknown; error?: unknown })
          : null;

      if (!response.ok || typeof uploadBody?.url !== "string") {
        setUploadError(
          typeof uploadBody?.error === "string"
            ? uploadBody.error
            : "We could not upload that photo. Please try again.",
        );
        return;
      }

      updateField("about_image_url", uploadBody.url);
    } catch {
      setUploadError("We could not upload that photo. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-pink">
          Owner details
        </p>
        <h1 className="mt-1 text-2xl font-black text-warm-deep">Profile</h1>
        <p className="mt-1 text-sm font-bold leading-relaxed text-warm-textMuted">
          Manage what customers see on your website and your private account details.
        </p>
      </header>

      {loadWarning && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800"
          role="alert"
        >
          {loadWarning}
        </div>
      )}

      <section className={cardClass} aria-labelledby="business-information-heading">
        <h2
          id="business-information-heading"
          className="text-base font-black text-warm-deep"
        >
          Business information
        </h2>
        <div className="mt-4 space-y-4">
          <Field
            id="business_name"
            label="Business name"
            required
            error={fieldErrors.business_name}
          >
            <input
              id="business_name"
              value={profile.business_name}
              onChange={(event) => updateField("business_name", event.target.value)}
              maxLength={OWNER_PROFILE_LIMITS.businessName}
              required
              aria-invalid={Boolean(fieldErrors.business_name)}
              aria-describedby={
                fieldErrors.business_name ? "business_name-error" : undefined
              }
              className={inputClass}
            />
          </Field>

          <Field id="phone" label="Phone" error={fieldErrors.phone}>
            <input
              id="phone"
              type="tel"
              value={profile.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              maxLength={OWNER_PROFILE_LIMITS.phone}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
              className={inputClass}
            />
          </Field>

          <Field id="tagline" label="Homepage tagline" error={fieldErrors.tagline}>
            <input
              id="tagline"
              value={profile.tagline}
              onChange={(event) => updateField("tagline", event.target.value)}
              maxLength={OWNER_PROFILE_LIMITS.tagline}
              aria-invalid={Boolean(fieldErrors.tagline)}
              aria-describedby={fieldErrors.tagline ? "tagline-error" : undefined}
              className={inputClass}
            />
          </Field>

          <Field
            id="admin_email"
            label="Private owner email"
            hint="Never shown on your website"
            error={fieldErrors.admin_email}
          >
            <input
              id="admin_email"
              type="email"
              autoComplete="email"
              value={profile.admin_email}
              onChange={(event) => updateField("admin_email", event.target.value)}
              aria-invalid={Boolean(fieldErrors.admin_email)}
              aria-describedby={
                fieldErrors.admin_email
                  ? "admin_email-error admin_email-hint"
                  : "admin_email-hint"
              }
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className={cardClass} aria-labelledby="personal-photo-heading">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="personal-photo-heading" className="text-base font-black text-warm-deep">
              Personal photo
            </h2>
            <p className="mt-1 text-xs font-bold text-warm-textMuted">
              Used in your About Us section
            </p>
          </div>
          <Link
            href="/admin/photos"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-black text-pop-pink transition hover:bg-pink-50"
          >
            Gallery photos
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-4 min-[420px]:flex-row min-[420px]:items-center">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.25rem] border border-warm-cream1 bg-warm-cream2 min-[420px]:h-36 min-[420px]:w-28 min-[420px]:shrink-0">
            {profile.about_image_url ? (
              <Image
                src={profile.about_image_url}
                alt="Current personal profile"
                fill
                sizes="(max-width: 419px) calc(100vw - 72px), 112px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="grid h-full min-h-48 place-items-center px-4 text-center text-xs font-bold text-warm-textMuted min-[420px]:min-h-0">
                No personal photo
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input
              ref={photoInputRef}
              id={photoInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => void uploadPhoto(event.target.files?.[0])}
              className="sr-only"
            />
            <label
              htmlFor={photoInputId}
              aria-disabled={uploading}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-pop-pink px-4 py-2 text-sm font-black text-pop-cream transition hover:bg-pink-700 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              {uploading
                ? "Uploading..."
                : profile.about_image_url
                  ? "Replace photo"
                  : "Upload photo"}
            </label>
            {profile.about_image_url && (
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  updateField("about_image_url", null);
                }}
                disabled={uploading}
                className="min-h-11 rounded-full border border-warm-cream1 px-4 py-2 text-sm font-black text-warm-textMuted transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                Clear
              </button>
            )}
            <p className="w-full text-xs font-semibold text-warm-textMuted">
              JPG, PNG, or WebP. Maximum 5MB.
            </p>
          </div>
        </div>

        {uploadError && (
          <p className="mt-3 text-sm font-bold text-red-700" role="alert">
            {uploadError}
          </p>
        )}
        {fieldErrors.about_image_url && (
          <p className="mt-3 text-sm font-bold text-red-700" role="alert">
            {fieldErrors.about_image_url}
          </p>
        )}
      </section>

      <section className={cardClass} aria-labelledby="about-me-heading">
        <h2 id="about-me-heading" className="text-base font-black text-warm-deep">
          About Me
        </h2>
        <p className="mt-1 text-xs font-bold text-warm-textMuted">
          Add a blank line when you want to start a new paragraph.
        </p>
        <div className="mt-4 space-y-5">
          <TextareaField
            id="about_en"
            label="English"
            value={profile.about_en}
            error={fieldErrors.about_en}
            onChange={(value) => updateField("about_en", value)}
          />
          <TextareaField
            id="about_es"
            label="Spanish"
            value={profile.about_es}
            error={fieldErrors.about_es}
            onChange={(value) => updateField("about_es", value)}
          />
        </div>
      </section>

      <section className={cardClass} aria-labelledby="social-media-heading">
        <h2 id="social-media-heading" className="text-base font-black text-warm-deep">
          Social media
        </h2>
        <p className="mt-1 text-xs font-bold text-warm-textMuted">
          Enter a handle or full profile link.
        </p>
        <div className="mt-4 space-y-4">
          {(["instagram", "facebook", "tiktok"] as const).map((platform) => (
            <Field
              key={platform}
              id={platform}
              label={platform[0].toUpperCase() + platform.slice(1)}
              error={fieldErrors[platform]}
            >
              <input
                id={platform}
                value={profile[platform]}
                onChange={(event) => updateField(platform, event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors[platform])}
                aria-describedby={
                  fieldErrors[platform] ? `${platform}-error` : undefined
                }
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      </section>

      {generalError && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
          role="alert"
        >
          {generalError}
        </div>
      )}

      <div className="sticky bottom-24 z-30 flex items-center justify-end gap-3 md:bottom-4">
        {saved && !dirty && (
          <span
            className="rounded-full bg-white/95 px-3 py-2 text-xs font-black text-green-700 shadow-sm"
            role="status"
            aria-live="polite"
          >
            Saved.
          </span>
        )}
        <button
          type="button"
          onClick={() => void saveProfile()}
          disabled={!dirty || saving || uploading}
          className="min-h-12 rounded-full bg-pop-pink px-6 py-3 text-sm font-black text-pop-cream shadow-lg transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>

      <section className={cardClass} aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-base font-black text-warm-deep">
          Security
        </h2>
        <p className="mt-1 text-xs font-bold text-warm-textMuted">
          Change the six-digit PIN used to enter your owner dashboard.
        </p>
        <div className="mt-4">
          <ChangePinForm />
        </div>
      </section>

      <section className={cardClass} aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-base font-black text-warm-deep">
          Account
        </h2>
        <p className="mt-1 text-xs font-bold text-warm-textMuted">
          Sign out of this owner dashboard on this device.
        </p>
        <SignOutButton className="mt-4 min-h-11 w-full rounded-full border border-red-200 px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-50" />
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-1 text-pop-pink">*</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs font-bold text-warm-textMuted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-bold text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TextareaField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: "about_en" | "about_es";
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span className="text-xs font-bold tabular-nums text-warm-textMuted">
          {value.length}/{OWNER_PROFILE_LIMITS.aboutCharacters}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={OWNER_PROFILE_LIMITS.aboutCharacters}
        rows={8}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} min-h-44 resize-y leading-relaxed`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-bold text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
