"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

export function PasscodeGate({ slug }: { slug: string }) {
  const t = useTranslations("invitations.public.passcode");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const passcode = form.get("passcode");
    try {
      const response = await fetch("/api/invitations/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, passcode }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      setError(response.status === 429 ? t("rateLimited") : t("invalid"));
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEE8F3] px-5 py-12 text-[#2D1832]">
      <section className="w-full max-w-md rounded-[2.5rem_1rem_2.5rem_1rem] border border-[#CBBAD3] bg-[#F9F6FB] px-6 py-10 shadow-[0_24px_80px_rgba(57,31,64,0.13)] sm:px-10">
        <div aria-hidden="true" className="mb-7 h-1.5 w-16 rounded-full bg-[#8C4A78]" />
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl leading-tight">{t("title")}</h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-[#624F67]">{t("body")}</p>
        <form onSubmit={submit} className="mt-8">
          <label htmlFor="invitation-passcode" className="text-sm font-semibold">
            {t("label")}
          </label>
          <input
            id="invitation-passcode"
            name="passcode"
            type="password"
            required
            autoComplete="current-password"
            className="mt-2 min-h-12 w-full rounded-xl border border-[#BBA7C3] bg-white px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#713D65] focus-visible:ring-offset-2"
          />
          {error && <p role="alert" className="mt-3 text-sm leading-6 text-[#8B2432]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 min-h-12 w-full rounded-xl bg-[#442148] px-5 font-semibold text-white outline-none transition-colors hover:bg-[#5C2D61] focus-visible:ring-2 focus-visible:ring-[#713D65] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none"
          >
            {submitting ? t("checking") : t("submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
