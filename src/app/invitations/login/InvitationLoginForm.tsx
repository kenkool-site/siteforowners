"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function loginErrorMessageKey(status: number): "invalidCredentials" | "rateLimited" | "genericError" {
  if (status === 401) return "invalidCredentials";
  if (status === 429) return "rateLimited";
  return "genericError";
}

export function InvitationLoginForm() {
  const t = useTranslations("invitations.login");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      if (!response.ok) {
        setError(t(loginErrorMessageKey(response.status)));
        return;
      }
      window.location.assign("/invitations");
    } catch {
      setError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-stone-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-stone-600">{t("subtitle")}</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          {error ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <label className="block text-sm font-medium text-stone-800">
            {t("emailLabel")}
            <input
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-medium text-stone-800">
            {t("pinLabel")}
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
              inputMode="numeric"
              maxLength={8}
              minLength={4}
              onChange={(event) => setPin(event.target.value)}
              required
              type="password"
              value={pin}
            />
          </label>
          <button
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t("signingIn") : t("submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
