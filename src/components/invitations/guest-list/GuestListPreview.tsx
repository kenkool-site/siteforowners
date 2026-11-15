"use client";

import { useState } from "react";
import { PrivateGuestListCard } from "./PrivateGuestListCard";
import { InviteOnlyGate } from "./InviteOnlyGate";
import { PersonalRsvp } from "./PersonalRsvp";
import {
  AddGuestForm,
  EmptyGuestList,
  GuestListActionBar,
  GuestListPanel,
  HostScreen,
  RepliesDashboard,
  SendPreview,
} from "./HostGuestListViews";
import type { GuestListItem } from "@/lib/invitations/guest-list";

export function GuestListPreview({
  screen,
  eventName,
  eventWhen,
  guests,
  sampleBody,
  segments,
  perMessage,
  coverUrl,
}: {
  screen: "founder" | "empty" | "list" | "send" | "rsvp" | "confirm" | "gate" | "code" | "missing" | "replies" | "flow";
  eventName: string;
  eventWhen: string;
  guests: GuestListItem[];
  sampleBody: string;
  segments: number;
  perMessage: number;
  coverUrl: string;
}) {
  const [local, setLocal] = useState(screen === "flow" ? [] : guests);
  const [flow, setFlow] = useState<"list" | "add" | "send" | "sent">("list");
  if (screen === "flow") {
    const notSent = local.filter((guest) => guest.status === "not_sent").length;
    return (
      <HostScreen
        title={flow === "add" ? "Add a guest" : flow === "send" ? "Send invites" : "Guest list"}
        eventName={eventName}
        backHref={flow === "list" ? "#back" : undefined}
        footer={flow === "list" && local.length > 0 ? (
          <GuestListActionBar
            notSent={notSent}
            remindable={local.filter((guest) => guest.status === "sent" || guest.status === "opened" || guest.status === "delivered").length}
            onRemind={() => setFlow("send")}
            onSend={() => setFlow("send")}
          />
        ) : undefined}
      >
        {flow !== "list" ? <button type="button" onClick={() => setFlow("list")} className="mb-2 text-sm font-medium text-[#1A3D24] underline">Back</button> : null}
        {flow === "list" && local.length === 0 ? <EmptyGuestList onAdd={() => setFlow("add")} onImport={() => setFlow("add")} /> : null}
        {flow === "list" && local.length > 0 ? (
          <GuestListPanel guests={local} />
        ) : null}
        {flow === "add" ? (
          <AddGuestForm
            pending={false}
            error={null}
            onSubmit={(input) => {
              setLocal((current) => [...current, {
                id: `new-${current.length}`,
                fullName: input.fullName,
                phoneDisplay: input.phone,
                seatsAllowed: input.seatsAllowed,
                partySize: null,
                household: input.household || null,
                status: "not_sent",
              }]);
              setFlow("list");
            }}
          />
        ) : null}
        {flow === "send" ? (
          <SendPreview
            kind="invite"
            sampleName={local.find((guest) => guest.status === "not_sent")?.fullName ?? null}
            sampleBody={sampleBody}
            ready={notSent}
            sendingNow={notSent}
            segments={perMessage * notSent}
            perMessage={perMessage}
            smsConfigured
            smsMessage={null}
            pending={false}
            onSend={() => {
              setLocal((current) => current.map((guest) => guest.status === "not_sent" ? { ...guest, status: "sent" } : guest));
              setFlow("sent");
            }}
          />
        ) : null}
        {flow === "sent" ? <p role="status">Invitations marked sent only after the host pressed send.</p> : null}
      </HostScreen>
    );
  }
  if (screen === "founder") {
    return (
      <div className="min-h-screen bg-[#F6F3EC] px-4 py-6 text-[#14261A]">
        <p className="mb-1 text-xs text-[#5E6F61]">Events / <b className="font-medium text-[#14261A]">{eventName}</b></p>
        <h1 className="mb-1 font-[family-name:var(--font-event-display),Georgia,serif] text-4xl font-medium text-[#1A3D24]">{eventName}</h1>
        <p className="mb-5 text-sm text-[#5E6F61]">Wedding · Saturday, December 19, 2026 · The Bliss at Aubrey, TX</p>
        <form>
          <PrivateGuestListCard enabled={false} />
        </form>
      </div>
    );
  }
  if (screen === "empty") {
    return (
      <HostScreen title="Guest list" eventName={eventName} backHref="#list">
        <EmptyGuestList onAdd={() => undefined} onImport={() => undefined} />
      </HostScreen>
    );
  }
  if (screen === "send") {
    return (
      <HostScreen title="Send invites" eventName={eventName} backHref="#list">
        <SendPreview
          kind="invite"
          sampleName="Chanelle"
          sampleBody={sampleBody}
          ready={3}
          sendingNow={3}
          segments={segments}
          perMessage={perMessage}
          smsConfigured
          smsMessage={null}
          pending={false}
          onSend={() => undefined}
        />
      </HostScreen>
    );
  }
  if (screen === "rsvp" || screen === "confirm") {
    return (
      <PersonalRsvp
        token="K7mQ2pLx9aWc4nRb"
        firstName="Chanelle"
        lead="to the wedding of Mercy & John"
        whenLabel="Saturday, December 19, 2026 · 1:00 PM"
        venue="The Bliss at Aubrey"
        seatsAllowed={2}
        initialAttending={screen === "confirm" ? true : null}
        initialPartySize={screen === "confirm" ? 2 : null}
        closed={false}
        googleCalendarUrl="https://calendar.google.com/calendar/render"
        icsHref="data:text/calendar,BEGIN:VCALENDAR"
        memoriesHref={null}
      />
    );
  }
  if (screen === "gate" || screen === "code" || screen === "missing") {
    return (
      <InviteOnlyGate
        slug="mercy-john"
        names={eventName}
        eventType="wedding"
        title={eventName}
        coverUrl={coverUrl}
        preview
        initialPhone="+1 (214) 555-0144"
        initialStep={screen === "gate" ? "phone" : screen === "code" ? "code" : "missing"}
        initialDigits={screen === "code" ? "482" : ""}
      />
    );
  }
  if (screen === "replies") {
    return (
      <HostScreen title="RSVP" eventName={eventName} backHref="#list">
        <RepliesDashboard
          eventWhen={eventWhen}
          guests={[
            ...guests.filter((guest) => !["Grace Egwuatu", "Psalmy", "Abimbola", "Chanelle Wyche-Afolabi"].includes(guest.fullName)),
            ...["Grace Egwuatu", "Psalmy", "Abimbola", "Chanelle Wyche-Afolabi"].map((name) => guests.find((guest) => guest.fullName === name)).filter((guest): guest is GuestListItem => Boolean(guest)),
          ]}
          onRemind={() => undefined}
          guestListHref="#list"
        />
      </HostScreen>
    );
  }
  const notSentCount = guests.filter((guest) => guest.status === "not_sent").length;
  const remindableCount = guests.filter((guest) => guest.status === "sent" || guest.status === "opened" || guest.status === "delivered").length;
  return (
    <HostScreen
      title="Guest list"
      eventName={eventName}
      backHref="#back"
      footer={<GuestListActionBar notSent={notSentCount} remindable={remindableCount} onRemind={() => undefined} onSend={() => undefined} />}
    >
      <GuestListPanel guests={local} />
    </HostScreen>
  );
}
