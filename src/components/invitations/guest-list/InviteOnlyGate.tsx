"use client";

import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { eventDisplayClass } from "../event-display";

type Step = "phone" | "code" | "missing" | "opted_out" | "closed";

export function InviteOnlyGate({
  slug,
  names,
  eventType,
  title,
  coverUrl,
  closed = false,
  preview = false,
  initialStep,
  initialPhone = "",
  initialDigits = "",
}: {
  slug: string;
  names: string;
  eventType: string;
  title: string;
  coverUrl: string | null;
  closed?: boolean;
  preview?: boolean;
  initialStep?: Step;
  initialPhone?: string;
  initialDigits?: string;
}) {
  const t = useTranslations("invitations.public.inviteOnly");
  const kind = eventType.toLowerCase().includes("wed") || eventType.toLowerCase() === "boda"
    ? "wedding"
    : eventType.toLowerCase().includes("birth") || eventType.toLowerCase().includes("cumple")
      ? "birthday"
      : "event";
  const [step, setStep] = useState<Step>(closed ? "closed" : initialStep ?? "phone");
  const [phone, setPhone] = useState(initialPhone);
  const [digits, setDigits] = useState(initialDigits);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(nextPhone: string) {
    if (preview) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/invitations/guest-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, phone: nextPhone }),
    });
    const body = await response.json() as { ok?: boolean; result?: string; code?: string };
    setPending(false);
    if (body.result === "not_on_list") {
      setStep("missing");
      return;
    }
    if (body.result === "opted_out") {
      setStep("opted_out");
      return;
    }
    if (!response.ok || body.result !== "code_sent") {
      setError(body.code === "rate_limited" ? t("rateLimited") : body.code === "sms_not_configured" ? t("smsOff") : t("error"));
      return;
    }
    setPhone(nextPhone);
    setDigits("");
    setStep("code");
  }

  async function checkCode(code: string) {
    if (preview || code.length !== 6) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/invitations/guest-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, phone, code }),
    });
    const body = await response.json() as { ok?: boolean; result?: string; href?: string; code?: string };
    setPending(false);
    if (body.result === "not_on_list") {
      setStep("missing");
      return;
    }
    if (body.result === "verified" && body.href) {
      window.location.assign(body.href);
      return;
    }
    setError(body.code === "code_expired" ? t("expired") : body.code === "rate_limited" ? t("rateLimited") : t("mismatch"));
  }

  function onPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("phone") ?? "");
    void requestCode(value);
  }

  const short = step === "code" || step === "missing" || step === "opted_out";
  return (
    <main data-invitation-layout="luxury" className="min-h-screen bg-[#F3EEE4] text-[#14261A]">
      <div className={`relative ${short ? "h-[220px]" : "h-[300px]"} bg-[#1A3D24]`}>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} className="h-full w-full object-cover object-[center_18%]" />
        ) : null}
        <div className={`absolute inset-0 ${short ? "bg-gradient-to-b from-[#14261A]/25 via-[#F3EEE4]/50 to-[#F3EEE4]" : "bg-gradient-to-b from-[#14261A]/30 via-[#14261A]/5 to-[#F3EEE4]"}`} />
      </div>
      <div className={`relative px-6 pb-10 ${short ? "-mt-7" : "-mt-14"}`}>
        {step === "phone" || step === "missing" || step === "opted_out" || step === "closed" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7EEE8] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#1A3D24]">
            <Lock className="size-3.5" aria-hidden="true" />
            {t("badge")}
          </span>
        ) : <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B3945C]">{t("verifyKicker")}</p>}

        {step === "phone" ? (
          <form onSubmit={onPhone}>
            <h1 className={`${eventDisplayClass} mt-2 text-[2.1rem] font-medium leading-tight text-[#1A3D24]`}>{t("title")}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5E6F61]">{t(`lead.${kind}`, { names, title })}</p>
            <label className="mb-1.5 mt-4 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5E6F61]">{t("phoneLabel")}</label>
            <input name="phone" required inputMode="tel" autoComplete="tel" defaultValue={phone} placeholder="+1 (214) 555-0100" className="mb-4 h-[52px] w-full rounded-[14px] border-[1.5px] border-[#1A3D24] bg-white px-3.5 text-lg font-medium shadow-[0_0_0_4px_rgba(26,61,36,.08)] outline-none" />
            {error ? <p role="alert" className="mb-3 text-sm text-[#8A4A3B]">{error}</p> : null}
            <button type="submit" disabled={pending} className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[#1A3D24] text-base font-medium text-white disabled:opacity-50">{t("sendCode")}</button>
          </form>
        ) : null}

        {step === "code" ? (
          <form onSubmit={(event) => { event.preventDefault(); void checkCode(digits); }}>
            <h1 className={`${eventDisplayClass} mt-2 text-[2.1rem] font-medium leading-tight text-[#1A3D24]`}>{t("codeTitle")}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5E6F61]">{t("codeLead")}</p>
            <div className="my-4 flex justify-center gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <input
                  key={index}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={index === 0 ? 6 : 1}
                  value={digits[index] ?? ""}
                  aria-label={t("digit", { number: index + 1 })}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/\D/g, "");
                    const next = (digits.slice(0, index) + raw).replace(/\D/g, "").slice(0, 6);
                    setDigits(next);
                    if (next.length === 6) void checkCode(next);
                  }}
                  className={`grid h-[54px] w-11 rounded-xl border bg-white text-center font-[family-name:var(--font-event-display),Georgia,serif] text-[1.6rem] text-[#1A3D24] outline-none ${digits.length === index ? "border-[#1A3D24] shadow-[0_0_0_3px_rgba(26,61,36,.1)]" : "border-[#E4DCCE]"}`}
                />
              ))}
            </div>
            {error ? <p role="alert" className="mb-2 text-center text-sm text-[#8A4A3B]">{error}</p> : null}
            <p className="text-center text-[12.5px] text-[#5E6F61]">
              {t("codeWait")}{" "}
              <button type="button" onClick={() => void requestCode(phone)} className="font-medium text-[#1A3D24]">{t("resend")}</button>
            </p>
          </form>
        ) : null}

        {step === "missing" ? (
          <div>
            <h1 className={`${eventDisplayClass} mt-2 text-[2.1rem] font-medium leading-tight text-[#1A3D24]`}>{t("missingTitle")}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5E6F61]">{t("missingBody", { names })}</p>
            <button type="button" onClick={() => { setStep("phone"); setError(null); }} className="mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-full border-[1.5px] border-[#1A3D24] text-base font-medium text-[#1A3D24]">{t("tryAnother")}</button>
            <p className="mt-4 text-center text-[12.5px] text-[#5E6F61]">{t("missingHint")}</p>
          </div>
        ) : null}

        {step === "opted_out" ? (
          <div>
            <h1 className={`${eventDisplayClass} mt-2 text-[2.1rem] font-medium leading-tight text-[#1A3D24]`}>{t("optedTitle")}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5E6F61]">{t("optedBody", { names })}</p>
            <button type="button" onClick={() => setStep("phone")} className="mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-full border-[1.5px] border-[#1A3D24] text-base font-medium text-[#1A3D24]">{t("tryAnother")}</button>
          </div>
        ) : null}

        {step === "closed" ? (
          <div>
            <h1 className={`${eventDisplayClass} mt-2 text-[2.1rem] font-medium leading-tight text-[#1A3D24]`}>{t("closedTitle")}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5E6F61]">{t("closedBody", { names })}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
