import assert from "node:assert/strict";
import test from "node:test";
import { connectionLooksSlow, nextVideoSourceAttempt, noteSlowConnection, playWithSoundFallback, resolveVerticalSwipe, videoSourceUrl } from "./video-playback";

test("swipe up advances and swipe down goes back, staying inside the list", () => {
  assert.equal(resolveVerticalSwipe(-60, 0, 3), 1);
  assert.equal(resolveVerticalSwipe(60, 1, 3), 0);
  assert.equal(resolveVerticalSwipe(-60, 2, 3), null);
  assert.equal(resolveVerticalSwipe(60, 0, 3), null);
  assert.equal(resolveVerticalSwipe(-10, 0, 3), null);
});

test("a failed video refreshes its signed url once before the fallback", () => {
  assert.equal(nextVideoSourceAttempt(false), "refresh");
  assert.equal(nextVideoSourceAttempt(true), "fallback");
  assert.equal(videoSourceUrl("/api/memories/media/m1/display", 0), "/api/memories/media/m1/display");
  assert.match(videoSourceUrl("/api/memories/media/m1/display", 5), /[?&]r=5$/);
});

test("autoplay tries sound, then muted, then reports a tap is required", async () => {
  const sound = { muted: true, plays: 0, play() { this.plays += 1; this.muted = false; return Promise.resolve(); } };
  assert.equal(await playWithSoundFallback(sound), "sound");
  assert.equal(sound.muted, false);

  let calls = 0;
  const muted = {
    muted: false,
    play() {
      calls += 1;
      if (!this.muted) return Promise.reject(new Error("blocked"));
      return Promise.resolve();
    },
  };
  assert.equal(await playWithSoundFallback(muted), "muted");
  assert.equal(muted.muted, true);
  assert.equal(calls, 2);

  const blocked = { muted: false, play() { return Promise.reject(new Error("no")); } };
  assert.equal(await playWithSoundFallback(blocked), "blocked");
});

test("a stalled preview marks the connection slow for the rest of the visit", () => {
  assert.equal(connectionLooksSlow(), false);
  noteSlowConnection();
  assert.equal(connectionLooksSlow(), true);
});
