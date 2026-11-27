import assert from "node:assert/strict";
import test from "node:test";
import {
  LONG_VIDEO_MAX_BYTES,
  SHORT_VIDEO_MAX_BYTES,
  checkVideoLimits,
  countedVideoSeconds,
  eventVideoMinutesCap,
  isLongClip,
  longestAllowedVideoSeconds,
  maxVideoBytes,
  multipartPartCount,
  usesMultipartUpload,
} from "./video-limits";

const base = {
  streamConfigured: true,
  guestHasLongClip: false,
  guestIdentified: true,
  eventVideoSecondsUsed: 0,
  eventVideoMinutesCap: 600,
};

test("long clips only open up once Stream is set up", () => {
  assert.equal(longestAllowedVideoSeconds(false), 60);
  assert.equal(longestAllowedVideoSeconds(true), 300);
  assert.equal(checkVideoLimits({ ...base, streamConfigured: false, durationSeconds: 90 }), "too_long");
  assert.equal(checkVideoLimits({ ...base, streamConfigured: false, durationSeconds: 60.8 }), null);
  assert.equal(checkVideoLimits({ ...base, durationSeconds: 90 }), null);
  assert.equal(checkVideoLimits({ ...base, durationSeconds: 301 }), null);
  assert.equal(checkVideoLimits({ ...base, durationSeconds: 302 }), "too_long");
});

test("each guest gets one long clip and any number of short ones", () => {
  assert.equal(isLongClip(61), false);
  assert.equal(isLongClip(62), true);
  assert.equal(checkVideoLimits({ ...base, guestHasLongClip: true, durationSeconds: 120 }), "long_clip_used");
  assert.equal(checkVideoLimits({ ...base, guestHasLongClip: true, durationSeconds: 45 }), null);
  assert.equal(checkVideoLimits({ ...base, guestIdentified: false, durationSeconds: 120 }), "too_long");
});

test("the event's video minutes cap counts unknown lengths as a full short clip", () => {
  assert.equal(countedVideoSeconds(null), 60);
  assert.equal(countedVideoSeconds(12), 12);
  assert.equal(checkVideoLimits({ ...base, eventVideoMinutesCap: 10, eventVideoSecondsUsed: 560, durationSeconds: 40 }), null);
  assert.equal(checkVideoLimits({ ...base, eventVideoMinutesCap: 10, eventVideoSecondsUsed: 560, durationSeconds: 41 }), "video_minutes_full");
  assert.equal(checkVideoLimits({ ...base, eventVideoMinutesCap: 10, eventVideoSecondsUsed: 560, durationSeconds: null }), "video_minutes_full");
});

test("an event's own cap wins over the platform setting, which wins over the default", () => {
  assert.equal(eventVideoMinutesCap(90, "300"), 90);
  assert.equal(eventVideoMinutesCap(null, "300"), 300);
  assert.equal(eventVideoMinutesCap(null, undefined), 600);
  assert.equal(eventVideoMinutesCap(null, "abc"), 600);
  assert.equal(eventVideoMinutesCap(0, "0"), 600);
});

test("long clips may be bigger files and upload in pieces", () => {
  assert.equal(maxVideoBytes(30), SHORT_VIDEO_MAX_BYTES);
  assert.equal(maxVideoBytes(240), LONG_VIDEO_MAX_BYTES);
  assert.equal(multipartPartCount(1), 1);
  assert.equal(multipartPartCount(10 * 1024 * 1024), 1);
  assert.equal(multipartPartCount(10 * 1024 * 1024 + 1), 2);
  assert.equal(usesMultipartUpload("video", 31 * 1024 * 1024), false);
  assert.equal(usesMultipartUpload("video", 32 * 1024 * 1024), true);
  assert.equal(usesMultipartUpload("photo", 64 * 1024 * 1024), false);
});
