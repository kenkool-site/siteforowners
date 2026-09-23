import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { OwnerMemoriesReviewQueue } from "./OwnerMemoriesReviewQueue";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

Object.assign(globalThis, { React });

const flagged: MemoryMedia = {
  id: "media-1", eventId: "event-1", uploaderRsvpId: null, uploaderSessionId: "session-1",
  uploaderDisplayName: "Oyin", guestSessionLevel: "anonymous", mediaKind: "photo",
  objectKeyOriginal: "original.jpg", objectKeyDisplay: "display.webp", objectKeyThumbnail: "thumb.webp",
  capturedAt: null, uploadedAt: "2026-09-22T12:00:00Z", uploadStatus: "uploaded",
  processingStatus: "ready", moderationStatus: "flagged", aiStatus: "not_started",
  moderationScore: 0.5, moderationCategories: ["suggestive"],
};

test("auto-publish moderation keeps live and flagged media in separate views", () => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><OwnerMemoriesReviewQueue eventId="event-1" mode="auto_publish" initialLive={[]} initialFlagged={[flagged]} initialRemoved={[]} initialPending={[]} initialPublished={[]} initialRejected={[]} mediaBasePath="/api/invitations/events/event-1/memories/media" /></NextIntlClientProvider>);
  assert.match(html, /Live/);
  assert.match(html, /Needs review/);
  assert.match(html, /Removed/);
  assert.match(html, /Needs review \(1\)/);
});
