"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock3, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { eventDisplayClass } from "../event-display";

export function PersonalRsvp({
  token,
  firstName,
  lead,
  whenLabel,
  venue,
  seatsAllowed,
  initialAttending,
  initialPartySize,
  closed,
  googleCalendarUrl,
  icsHref,
  memoriesHref,
}: {
  token: string;
  firstName: string;
  lead: string;
  whenLabel: string | null;
  venue: string | null;
  seatsAllowed: number;
  initialAttending: boolean | null;
  initialPartySize: number | null;
  closed: boolean;
  googleCalendarUrl: string | null;
  icsHref: string | null;
  memoriesHref: string | null;
}) {
  const t = useTranslations("invitations.public.personalRsvp");
  const locale = useLocale();
  const [attending, setAttending] = useState(initialAttending !== false);
  const [party, setParty] = useState(initialPartySize && initialPartySize > 0 ? initialPartySize : seatsAllowed);
  const [saved, setSaved] = useState(initialAttending !== null ? { attending: initialAttending, partySize: initialPartySize ?? 0 } : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/invitations/guest-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, attending, partySize: attending ? party : 0 }),
    });
    const body = await response.json() as { ok?: boolean; code?: string; attending?: boolean; partySize?: number };
    setPending(false);
    if (!response.ok || !body.ok) {
      setError(body.code === "over_seats" ? t("overSeats", { count: seatsAllowed }) : body.code === "rsvp_closed" ? t("closed") : t("error"));
      return;
    }
    setSaved({ attending: Boolean(body.attending), partySize: body.partySize ?? 0 });
  }

  if (saved) {
    return (
      <main data-invitation-layout="luxury" className="flex min-h-screen flex-col bg-[#F3EEE4] px-6 pb-10 pt-14 text-center text-[#14261A]">
        <div className="mx-auto grid size-[72px] place-items-center rounded-full bg-[#1A3D24] text-white"><Check className="size-7" /></div>
        <h1 className={`${eventDisplayClass} mt-4 text-[2.1rem] font-medium text-[#1A3D24]`}>{t("thanks", { name: firstName })}</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-relaxed text-[#5E6F61]">
          {saved.attending ? t("savedSeats", {
            count: saved.partySize,
            when: whenLabel ? `${locale === "es" ? " el" : " on"} ${whenLabel}` : "",
            venue: venue ? `${locale === "es" ? ", en" : ", at"} ${venue}` : "",
          }) : t("savedDecline")}
        </p>
        {saved.attending && googleCalendarUrl && icsHref ? (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <a href={googleCalendarUrl} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1A3D24] text-sm font-medium text-[#1A3D24]"><CalendarDays className="size-4" />{t("google")}</a>
            <a href={icsHref} download="event.ics" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1A3D24] text-sm font-medium text-[#1A3D24]"><Clock3 className="size-4" />{t("calendarFile")}</a>
          </div>
        ) : null}
        {memoriesHref ? <p className="mt-4 text-[12.5px] text-[#5E6F61]">{t("memories")}</p> : null}
        {!closed ? <button type="button" onClick={() => setSaved(null)} className="mt-6 text-sm font-medium text-[#1A3D24] underline">{t("change")}</button> : null}
      </main>
    );
  }

  return (
    <main data-invitation-layout="luxury" className="flex min-h-screen flex-col bg-[#F3EEE4] px-6 pb-8 pt-6 text-[#14261A]">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B3945C]">{t("kicker")}</p>
      <h1 className={`${eventDisplayClass} mt-2 text-[2.15rem] font-medium leading-tight text-[#1A3D24]`}>{t("title", { name: firstName })}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5E6F61]">{lead}{whenLabel ? <><br />{whenLabel}</> : null}{venue ? <><br />{venue}</> : null}</p>
      <p className="my-4 text-[13.5px] text-[#5E6F61]">{t("allowance", { count: seatsAllowed })}</p>
      <div className="grid gap-2.5">
        <Choice on={attending} title={t("yes")} detail={t("yesDetail")} onClick={() => setAttending(true)} />
        <Choice on={!attending} title={t("no")} detail={t("noDetail")} onClick={() => setAttending(false)} />
      </div>
      {attending ? (
        <div className="mt-4 rounded-2xl border border-[#E4DCCE] bg-white px-4 py-3.5">
          <p className="text-[13px] text-[#5E6F61]">{t("howMany")} <b className="font-semibold text-[#14261A]">{t("ofSeats", { count: party, allowed: seatsAllowed })}</b></p>
          <div className="mt-2.5 flex items-center gap-2.5">
            <button type="button" aria-label={t("fewer")} onClick={() => setParty((value) => Math.max(1, value - 1))} className="grid size-9 place-items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] text-[#1A3D24]"><Minus className="size-4" /></button>
            <span className={`${eventDisplayClass} min-w-8 text-center text-[1.6rem] text-[#1A3D24]`}>{party}</span>
            <button type="button" aria-label={t("more")} onClick={() => setParty((value) => Math.min(seatsAllowed, value + 1))} className="grid size-9 place-items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] text-[#1A3D24]"><Plus className="size-4" /></button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[#8A4A3B]">{error}</p> : null}
      {closed ? <p className="mt-4 text-sm text-[#5E6F61]">{t("closed")}</p> : (
        <button type="button" disabled={pending} onClick={() => void submit()} className="mt-auto inline-flex h-12 w-full items-center justify-center rounded-full bg-[#1A3D24] text-[15px] font-medium text-white disabled:opacity-50">{t("submit")}</button>
      )}
    </main>
  );
}

function Choice({ on, title, detail, onClick }: { on: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-[14px] border px-4 py-4 text-left ${on ? "border-[#1A3D24] bg-white shadow-[0_0_0_3px_rgba(26,61,36,.1)]" : "border-[#E4DCCE] bg-[#FBF8F2]"}`}>
      <span className={`size-5 shrink-0 rounded-full border-[1.5px] ${on ? "border-[#1A3D24] bg-[#1A3D24] shadow-[inset_0_0_0_4px_#fff]" : "border-[#E4DCCE]"}`} />
      <span>
        <b className="block text-base font-medium">{title}</b>
        <small className="block text-[12.5px] text-[#5E6F61]">{detail}</small>
      </span>
    </button>
  );
}
