"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronLeft, FileSpreadsheet, Lock, Minus, Plus, Send, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GuestListItem, GuestListStatus } from "@/lib/invitations/guest-list";
import { eventDisplayClass } from "../event-display";

const PILL: Record<GuestListStatus, string> = {
  not_sent: "bg-[#EEECE6] text-[#6a7068]",
  sent: "bg-[#F3ECDD] text-[#6d5320]",
  delivered: "bg-[#E7EEE8] text-[#1A3D24]",
  opened: "bg-[#E4EDE4] text-[#2A592F]",
  attending: "bg-[#1A3D24] text-white",
  declined: "bg-[#EEECE6] text-[#5E6F61]",
  failed: "bg-[#F3E4DE] text-[#8A4A3B]",
  opted_out: "bg-[#F3E4DE] text-[#8A4A3B]",
};

export function HostScreen({
  title,
  eventName,
  backHref,
  children,
  footer,
}: {
  title: string;
  eventName: string;
  backHref?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations("invitations.guestList");
  return (
    <div className="mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#F3EEE4] text-[#14261A]">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          {backHref ? (
            <Link href={backHref} aria-label={t("back")} className="grid size-8 shrink-0 place-items-center rounded-full border border-[#E4DCCE] bg-white text-[#1A3D24]">
              <ChevronLeft className="size-5" />
            </Link>
          ) : null}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-tight text-[#1A3D24]">{title}</div>
            <div className="truncate text-xs text-[#5E6F61]">{eventName}</div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#efe8d6] px-2.5 py-1 text-[11px] font-semibold text-[#6d5320]">
          <Lock className="size-3" aria-hidden="true" />
          {t("hostOnly")}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {footer ? <div className="shrink-0 border-t border-[#E4DCCE] bg-[#FBF8F2]/95 px-5 py-3 backdrop-blur">{footer}</div> : null}
    </div>
  );
}

export function PrimaryButton({ children, type = "button", disabled, onClick }: { children: ReactNode; type?: "button" | "submit"; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1A3D24] px-5 text-[15px] font-medium text-white disabled:opacity-45">
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const className = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1A3D24] bg-transparent px-4 text-[15px] font-medium text-[#1A3D24]";
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <button type="button" onClick={onClick} className={className}>{children}</button>;
}

function StatusPill({ status }: { status: GuestListStatus }) {
  const t = useTranslations("invitations.guestList.status");
  return <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10.5px] font-semibold ${PILL[status]}`}>{t(status)}</span>;
}

function seatMeta(item: GuestListItem, seats: (count: number) => string, seatsOf: (used: number, allowed: number) => string) {
  const counted = item.status === "attending" || item.status === "declined";
  const seatsLabel = counted ? seatsOf(item.partySize && item.partySize > 0 ? item.partySize : item.seatsAllowed, item.seatsAllowed) : seats(item.seatsAllowed);
  return [item.phoneDisplay, seatsLabel, item.household].filter(Boolean).join(" · ");
}

export function EmptyGuestList({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  const t = useTranslations("invitations.guestList");
  return (
    <div className="px-2 pt-8 text-center">
      <div className="mx-auto grid size-[72px] place-items-center rounded-full bg-[#E7EEE8] text-[#1A3D24]">
        <Users className="size-7" />
      </div>
      <h1 className={`${eventDisplayClass} mt-4 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("empty.title")}</h1>
      <p className="mx-auto mt-2 max-w-[30ch] text-[14.5px] leading-relaxed text-[#5E6F61]">{t("empty.body")}</p>
      <div className="mt-7 grid gap-2.5">
        <PrimaryButton onClick={onAdd}><Plus className="size-4" />{t("empty.add")}</PrimaryButton>
        <button type="button" onClick={onImport} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#E4DCCE] bg-white px-4 text-[15px] font-medium text-[#1A3D24]">
          <FileSpreadsheet className="size-4" />{t("empty.import")}
        </button>
      </div>
      <p className="mx-auto mt-5 max-w-[32ch] text-[12.5px] leading-relaxed text-[#5E6F61]">{t("empty.hint")}</p>
    </div>
  );
}

export function AddGuestForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (input: { fullName: string; phone: string; email: string; seatsAllowed: number; household: string }) => void;
}) {
  const t = useTranslations("invitations.guestList");
  const [seats, setSeats] = useState(2);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      fullName: String(data.get("fullName") ?? ""),
      phone: String(data.get("phone") ?? ""),
      email: String(data.get("email") ?? ""),
      household: String(data.get("household") ?? ""),
      seatsAllowed: seats,
    });
  }
  return (
    <form onSubmit={submit} className="pt-2">
      <h1 className={`${eventDisplayClass} text-[2rem] font-medium text-[#1A3D24]`}>{t("add.title")}</h1>
      <p className="mb-5 mt-1 text-[13.5px] text-[#5E6F61]">{t("add.lead")}</p>
      <Field label={t("add.name")}><input name="fullName" required maxLength={120} className={inputClass} /></Field>
      <Field label={t("add.mobile")}><input name="phone" required inputMode="tel" autoComplete="tel" placeholder="+1 (214) 555-0100" className={inputClass} /></Field>
      <Field label={t("add.seats")}>
        <div className="mb-4 flex h-[50px] items-center justify-between rounded-xl border border-[#E4DCCE] bg-white px-2">
          <button type="button" aria-label={t("add.fewer")} onClick={() => setSeats((value) => Math.max(1, value - 1))} className="grid size-9 place-items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] text-[#1A3D24]"><Minus className="size-4" /></button>
          <span className={`${eventDisplayClass} min-w-9 text-center text-[1.6rem] text-[#1A3D24]`}>{seats}</span>
          <button type="button" aria-label={t("add.more")} onClick={() => setSeats((value) => Math.min(20, value + 1))} className="grid size-9 place-items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] text-[#1A3D24]"><Plus className="size-4" /></button>
        </div>
      </Field>
      <Field label={t("add.household")} hint={t("add.optional")}><input name="household" maxLength={80} className={inputClass} /></Field>
      <p className="-mt-2 mb-4 text-[11.5px] text-[#5E6F61]">{t("add.householdHint")}</p>
      <Field label={t("add.email")} hint={t("add.optional")}><input name="email" type="email" maxLength={200} className={inputClass} /></Field>
      {error ? <p role="alert" className="mb-3 text-sm text-[#8A4A3B]">{error}</p> : null}
      <PrimaryButton type="submit" disabled={pending}>{t("add.submit")}</PrimaryButton>
    </form>
  );
}

export function ImportGuestForm({
  pending,
  message,
  onSubmit,
}: {
  pending: boolean;
  message: string | null;
  onSubmit: (csv: string) => void;
}) {
  const t = useTranslations("invitations.guestList");
  return (
    <form className="pt-2" onSubmit={(event) => { event.preventDefault(); onSubmit(String(new FormData(event.currentTarget).get("csv") ?? "")); }}>
      <h1 className={`${eventDisplayClass} text-[2rem] font-medium text-[#1A3D24]`}>{t("import.title")}</h1>
      <p className="mb-4 mt-1 text-[13.5px] leading-relaxed text-[#5E6F61]">{t("import.lead")}</p>
      <textarea name="csv" required rows={8} placeholder={t("import.placeholder")} className="mb-3 w-full rounded-xl border border-[#E4DCCE] bg-white p-3 text-sm" />
      <label className="mb-4 block text-sm font-medium text-[#1A3D24]">
        {t("import.file")}
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const form = event.currentTarget.form;
            if (!file || !form) return;
            void file.text().then((text) => {
              const field = form.elements.namedItem("csv");
              if (field instanceof HTMLTextAreaElement) field.value = text;
            });
          }}
        />
      </label>
      {message ? <p className="mb-3 text-sm text-[#1A3D24]">{message}</p> : null}
      <PrimaryButton type="submit" disabled={pending}>{t("import.submit")}</PrimaryButton>
    </form>
  );
}

const FILTERS: Array<GuestListStatus | "all"> = ["all", "not_sent", "sent", "opened", "attending", "declined", "failed", "opted_out", "delivered"];

export function GuestListPanel({
  guests,
  onRemove,
}: {
  guests: GuestListItem[];
  onRemove?: (id: string) => void;
}) {
  const t = useTranslations("invitations.guestList");
  const [filter, setFilter] = useState<GuestListStatus | "all">("all");
  const counts = guests.reduce<Record<string, number>>((total, guest) => {
    total[guest.status] = (total[guest.status] ?? 0) + 1;
    return total;
  }, {});
  const attendingSeats = guests.reduce((total, guest) => total + (guest.status === "attending" ? guest.partySize ?? 0 : 0), 0);
  const seatsReserved = guests.reduce((total, guest) => total + guest.seatsAllowed, 0);
  const visible = filter === "all" ? guests : guests.filter((guest) => guest.status === filter);
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat value={guests.length} label={t("stats.guests")} />
        <Stat value={attendingSeats} label={t("stats.attendingSeats")} />
        <Stat value={seatsReserved} label={t("stats.seatsReserved")} />
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((key) => {
          const count = key === "all" ? guests.length : counts[key] ?? 0;
          if (key !== "all" && count === 0) return null;
          const on = filter === key;
          return (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-medium ${on ? "border-[#1A3D24] bg-[#1A3D24] text-white" : "border-[#E4DCCE] bg-white text-[#5E6F61]"}`}>
              {t(`filters.${key}`)} {count}
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E4DCCE] bg-white">
        {visible.map((guest) => (
          <div key={guest.id} className="flex items-start justify-between gap-3 border-b border-[#E4DCCE] px-3.5 py-2.5 last:border-b-0">
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{guest.fullName}</div>
              <div className="mt-0.5 text-[11.5px] text-[#5E6F61]">{seatMeta(guest, (count) => t("seats", { count }), (used, allowed) => t("seatsOf", { used, allowed }))}</div>
              {onRemove ? <button type="button" onClick={() => onRemove(guest.id)} className="mt-1 text-[11px] font-medium text-[#8A4A3B] underline">{t("remove")}</button> : null}
            </div>
            <StatusPill status={guest.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuestListActionBar({
  notSent,
  remindable,
  onRemind,
  onSend,
}: {
  notSent: number;
  remindable: number;
  onRemind: () => void;
  onSend: () => void;
}) {
  const t = useTranslations("invitations.guestList");
  return (
    <div className="grid grid-cols-[1fr_1.2fr] gap-2">
      <GhostButton onClick={onRemind}><Bell className="size-4" />{t("remind", { count: remindable })}</GhostButton>
      <PrimaryButton onClick={onSend} disabled={notSent === 0}><Send className="size-4" />{t("sendInvites", { count: notSent })}</PrimaryButton>
    </div>
  );
}

export function SendPreview({
  kind,
  sampleName,
  sampleBody,
  ready,
  sendingNow,
  segments,
  perMessage,
  smsConfigured,
  smsMessage,
  pending,
  onSend,
}: {
  kind: "invite" | "reminder";
  sampleName: string | null;
  sampleBody: string;
  ready: number;
  sendingNow: number;
  segments: number;
  perMessage: number;
  smsConfigured: boolean;
  smsMessage: string | null;
  pending: boolean;
  onSend: () => void;
}) {
  const t = useTranslations("invitations.guestList");
  return (
    <div className="pt-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B3945C]">{t("send.kicker")}</p>
      <h1 className={`${eventDisplayClass} mt-1 text-[1.85rem] font-medium leading-tight text-[#1A3D24]`}>{kind === "reminder" ? t("send.remindTitle") : t("send.title")}</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#5E6F61]">{sampleName ? t("send.forGuest", { name: sampleName }) : t("send.none")}</p>
      {sampleBody ? (
        <div className="my-4 rounded-[18px] border border-[#E4DCCE] bg-white px-4 py-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#B3945C]">{t("send.from")}</p>
          <SmsText body={sampleBody} />
        </div>
      ) : null}
      {ready > 0 ? (
        <div className="rounded-[14px] bg-[#E7EEE8] px-3.5 py-3 text-[13.5px] leading-relaxed">
          <b className="font-semibold">{t(kind === "reminder" ? "send.remindReady" : "send.ready", { count: sendingNow })}</b>{" "}
          {t("send.segments", { total: segments, each: perMessage })}
          {sendingNow < ready ? ` ${t("send.more", { count: ready - sendingNow })}` : ""}
        </div>
      ) : <p className="text-sm text-[#5E6F61]">{t("send.none")}</p>}
      <p className="mt-3.5 text-[12.5px] leading-relaxed text-[#5E6F61]">{t("send.reminderHint")}</p>
      {!smsConfigured && smsMessage ? <p role="status" className="mt-3 text-sm text-[#8A4A3B]">{smsMessage}</p> : null}
      <div className="mt-5">
        <PrimaryButton onClick={onSend} disabled={pending || !smsConfigured || sendingNow === 0}>
          <Send className="size-4" />
          {kind === "reminder" ? t("send.submitRemind", { count: sendingNow }) : t("send.submit", { count: sendingNow })}
        </PrimaryButton>
      </div>
    </div>
  );
}

export function RepliesDashboard({
  eventWhen,
  guests,
  onRemind,
  guestListHref,
}: {
  eventWhen: string;
  guests: GuestListItem[];
  onRemind: () => void;
  guestListHref: string;
}) {
  const t = useTranslations("invitations.guestList");
  const attendingParties = guests.filter((guest) => guest.status === "attending").length;
  const declined = guests.filter((guest) => guest.status === "declined").length;
  const opened = guests.filter((guest) => guest.status === "opened" || guest.status === "attending" || guest.status === "declined").length;
  const waiting = guests.filter((guest) => ["not_sent", "sent", "delivered", "opened"].includes(guest.status)).length;
  const attendingSeats = guests.reduce((total, guest) => total + (guest.status === "attending" ? guest.partySize ?? 0 : 0), 0);
  const remindable = guests.filter((guest) => ["sent", "delivered", "opened"].includes(guest.status)).length;
  const total = attendingParties + declined + waiting || 1;
  const recent = [...guests].reverse().slice(0, 6);
  return (
    <div>
      <h1 className={`${eventDisplayClass} text-[2rem] font-medium text-[#1A3D24]`}>{t("replies.title")}</h1>
      <p className="mb-3 text-[12.5px] text-[#5E6F61]">{eventWhen}</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={guests.length} label={t("replies.invited")} large />
        <Stat value={opened} label={t("replies.opened")} large />
        <Stat value={attendingSeats} label={t("replies.attendingSeats")} large />
        <Stat value={declined} label={t("replies.declined")} large />
        <div className="col-span-2 flex items-center justify-between rounded-[14px] border border-[#E4DCCE] bg-white px-3.5 py-3">
          <div>
            <b className={`${eventDisplayClass} block text-[2rem] font-medium leading-none text-[#1A3D24]`}>{waiting}</b>
            <span className="text-[11px] text-[#5E6F61]">{t("replies.waiting")}</span>
          </div>
          <div className="min-w-0 flex-1 pl-4">
            <div className="flex h-2 overflow-hidden rounded bg-[#E4DCCE]">
              <i className="block h-full bg-[#1A3D24]" style={{ width: `${Math.round((attendingParties / total) * 100)}%` }} />
              <i className="block h-full bg-[#C4B8A4]" style={{ width: `${Math.round((declined / total) * 100)}%` }} />
              <i className="block h-full bg-[#D4C2A0]" style={{ width: `${Math.round((waiting / total) * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#5E6F61]">{t("replies.bar", { attending: attendingParties, declined, waiting })}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#E4DCCE] bg-white">
        <h2 className="px-3.5 pb-2 pt-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#B3945C]">{t("replies.recent")}</h2>
        {recent.map((guest) => (
          <div key={guest.id} className="flex items-center justify-between gap-3 border-t border-[#E4DCCE] px-3.5 py-2.5">
            <div>
              <div className="text-[13.5px] font-medium">{guest.fullName}</div>
              <div className="text-[11.5px] text-[#5E6F61]">{guest.status === "opened" ? t("replies.openedNote") : guest.status === "attending" ? t("seats", { count: guest.partySize ?? guest.seatsAllowed }) : t("seats", { count: guest.seatsAllowed })}</div>
            </div>
            <StatusPill status={guest.status} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <GhostButton href={guestListHref}>{t("replies.guestList")}</GhostButton>
        <PrimaryButton onClick={onRemind}><Bell className="size-4" />{t("remind", { count: remindable })}</PrimaryButton>
      </div>
    </div>
  );
}

function SmsText({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[#14261A]">
      {parts.map((part, index) => part.startsWith("http")
        ? <span key={index} className="font-medium text-[#1A3D24] underline decoration-[#1A3D24] underline-offset-2">{part}</span>
        : <Fragment key={index}>{part}</Fragment>)}
    </p>
  );
}

function Stat({ value, label, large = false }: { value: number; label: string; large?: boolean }) {
  return (
    <div className="rounded-[14px] border border-[#E4DCCE] bg-white px-3 py-2.5">
      <b className={`${eventDisplayClass} block font-medium leading-none text-[#1A3D24] ${large ? "text-[2rem]" : "text-2xl"}`}>{value}</b>
      <span className="mt-1 block text-[11px] text-[#5E6F61]">{label}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-1 block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5E6F61]">
        {label}{hint ? <span className="ml-2 font-medium normal-case tracking-normal text-[#a3a99f]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClass = "mb-4 h-[50px] w-full rounded-xl border border-[#E4DCCE] bg-white px-3.5 text-base font-medium text-[#14261A] outline-none focus:border-[#1A3D24] focus:shadow-[0_0_0_4px_rgba(26,61,36,.08)]";
