"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { GuestListItem } from "@/lib/invitations/guest-list";
import {
  AddGuestForm,
  EmptyGuestList,
  GuestListActionBar,
  GuestListPanel,
  HostScreen,
  ImportGuestForm,
  RepliesDashboard,
  SendPreview,
} from "./HostGuestListViews";

type View = "list" | "add" | "import" | "send" | "remind" | "replies";

type Preview = {
  kind: "invite" | "reminder";
  sampleName: string | null;
  sampleBody: string;
  ready: number;
  sendingNow: number;
  estimate: { segments: number; perMessage: number };
  smsConfigured: boolean;
  smsMessage: string | null;
};

export function HostGuestListApp({
  eventId,
  eventName,
  eventWhen,
  initialGuests,
  smsConfigured,
  smsMessage,
  backHref,
  initialView = "list",
}: {
  eventId: string;
  eventName: string;
  eventWhen: string;
  initialGuests: GuestListItem[];
  smsConfigured: boolean;
  smsMessage: string | null;
  backHref: string;
  initialView?: View;
}) {
  const t = useTranslations("invitations.guestList");
  const router = useRouter();
  const [view, setView] = useState<View>(initialGuests.length === 0 && initialView === "list" ? "list" : initialView);
  const [guests, setGuests] = useState(initialGuests);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function reload() {
    const response = await fetch(`/api/invitations/events/${eventId}/guests`);
    const body = await response.json() as { ok?: boolean; guests?: GuestListItem[] };
    if (body.guests) setGuests(body.guests);
    router.refresh();
  }

  function errorText(code: string | undefined): string {
    if (code === "duplicate_phone") return t("errors.duplicate_phone");
    if (code === "sms_not_configured") return smsMessage ?? t("errors.sms");
    if (code === "rate_limited") return t("errors.rate_limited");
    return t("errors.generic");
  }

  async function add(input: { fullName: string; phone: string; email: string; seatsAllowed: number; household: string }) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invitations/events/${eventId}/guests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json() as { ok?: boolean; code?: string; errors?: Record<string, string> };
    setPending(false);
    if (!response.ok || !body.ok) {
      setError(body.errors ? Object.values(body.errors)[0] ?? errorText(body.code) : errorText(body.code));
      return;
    }
    await reload();
    setView("list");
  }

  async function importCsv(csv: string) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invitations/events/${eventId}/guests/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const body = await response.json() as { ok?: boolean; added?: number; skipped?: number; code?: string; errors?: { message: string }[] };
    setPending(false);
    if (!response.ok || !body.ok) {
      setError(body.errors?.[0]?.message ?? errorText(body.code));
      return;
    }
    await reload();
    setError(t("import.result", { added: body.added ?? 0, skipped: body.skipped ?? 0 }));
  }

  async function openPreview(kind: "invite" | "reminder") {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invitations/events/${eventId}/guests/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, action: "preview" }),
    });
    const body = await response.json() as Preview & { ok?: boolean; code?: string };
    setPending(false);
    if (!response.ok || !body.ok) {
      setError(errorText(body.code));
      return;
    }
    setPreview(body);
    setView(kind === "reminder" ? "remind" : "send");
  }

  async function send() {
    if (!preview) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/invitations/events/${eventId}/guests/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: preview.kind, action: "send" }),
    });
    const body = await response.json() as { ok?: boolean; code?: string; sent?: number };
    setPending(false);
    if (!response.ok || !body.ok) {
      setError(errorText(body.code));
      return;
    }
    await reload();
    setView("list");
  }

  async function remove(guestId: string) {
    const response = await fetch(`/api/invitations/events/${eventId}/guests?guestId=${encodeURIComponent(guestId)}`, { method: "DELETE" });
    if (response.ok) await reload();
  }

  const title = view === "add" ? t("add.screen") : view === "import" ? t("import.screen") : view === "send" || view === "remind" ? t("send.screen") : view === "replies" ? t("replies.screen") : t("list.screen");
  const back = view === "list" ? backHref : undefined;
  const notSent = guests.filter((guest) => guest.status === "not_sent").length;
  const remindable = guests.filter((guest) => guest.status === "sent" || guest.status === "delivered" || guest.status === "opened").length;
  return (
    <HostScreen
      title={title}
      eventName={eventName}
      backHref={view === "list" ? back : undefined}
      footer={view === "list" && guests.length > 0 ? <GuestListActionBar notSent={notSent} remindable={remindable} onRemind={() => void openPreview("reminder")} onSend={() => void openPreview("invite")} /> : undefined}
    >
      {view !== "list" ? <button type="button" onClick={() => { setError(null); setView("list"); }} className="mb-2 text-sm font-medium text-[#1A3D24] underline">{t("back")}</button> : null}
      {view === "list" && guests.length === 0 ? <EmptyGuestList onAdd={() => setView("add")} onImport={() => setView("import")} /> : null}
      {view === "list" && guests.length > 0 ? (
        <GuestListPanel guests={guests} onRemove={(id) => void remove(id)} />
      ) : null}
      {view === "list" && guests.length > 0 ? (
        <button type="button" onClick={() => setView("replies")} className="mt-4 text-sm font-medium text-[#1A3D24] underline">{t("replies.open")}</button>
      ) : null}
      {view === "list" && guests.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setView("add")} className="h-10 rounded-full border border-[#E4DCCE] bg-white text-sm font-medium text-[#1A3D24]">{t("empty.add")}</button>
          <button type="button" onClick={() => setView("import")} className="h-10 rounded-full border border-[#E4DCCE] bg-white text-sm font-medium text-[#1A3D24]">{t("empty.import")}</button>
        </div>
      ) : null}
      {view === "add" ? <AddGuestForm pending={pending} error={error} onSubmit={(input) => void add(input)} /> : null}
      {view === "import" ? <ImportGuestForm pending={pending} message={error} onSubmit={(csv) => void importCsv(csv)} /> : null}
      {(view === "send" || view === "remind") && preview ? (
        <SendPreview
          kind={preview.kind}
          sampleName={preview.sampleName}
          sampleBody={preview.sampleBody}
          ready={preview.ready}
          sendingNow={preview.sendingNow}
          segments={preview.estimate.segments}
          perMessage={preview.estimate.perMessage}
          smsConfigured={preview.smsConfigured}
          smsMessage={preview.smsMessage}
          pending={pending}
          onSend={() => void send()}
        />
      ) : null}
      {view === "replies" ? (
        <RepliesDashboard eventWhen={eventWhen} guests={guests} onRemind={() => void openPreview("reminder")} guestListHref={`/invitations/manage/${eventId}/guests`} />
      ) : null}
      {error && view !== "add" && view !== "import" ? <p role="alert" className="mt-3 text-sm text-[#8A4A3B]">{error}</p> : null}
      {!smsConfigured && view === "list" ? <p className="mt-4 text-[12.5px] leading-relaxed text-[#8A4A3B]">{smsMessage}</p> : null}
    </HostScreen>
  );
}
