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

// A video item has no distinct rendering branch here (see the component's
// generic `item.objectKeyThumbnail && <img .../>`) — its poster thumbnail
// (stored in objectKeyThumbnail by markVideoMemoryMediaReady, see
// repository.ts) rides the exact same <img> path a photo's thumbnail does.
// This confirms that genericity holds, matching the sibling "flagged" fixture
// above but for mediaKind "video".
test("a video item's poster thumbnail renders via the same generic <img> path as a photo's", () => {
  const flaggedVideo: MemoryMedia = {
    ...flagged,
    id: "media-2",
    mediaKind: "video",
    objectKeyOriginal: "original.mp4",
    objectKeyDisplay: "original.mp4",
    objectKeyThumbnail: "posters/event-1/media-2.jpg",
  };
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><OwnerMemoriesReviewQueue eventId="event-1" mode="auto_publish" initialLive={[]} initialFlagged={[flaggedVideo]} initialRemoved={[]} initialPending={[]} initialPublished={[]} initialRejected={[]} mediaBasePath="/api/invitations/events/event-1/memories/media" /></NextIntlClientProvider>);
  assert.match(html, /<img[^>]*src="\/api\/invitations\/events\/event-1\/memories\/media\/media-2\/thumbnail"/);
});
