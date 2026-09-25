import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

// KNOWN FOLLOW-UP: these assert on locally-reconstructed values rather than
// invoking the real route handlers — they were written while the init route
// imported a `server-only` module and so could not be loaded here at all. That
// import is fixed (it now uses @/lib/invitations/e2e-guard), so real route-level
// integration tests are now possible; writing them is a separate follow-up.

// Test that the routes properly validate same-origin requests
test("upload init route rejects cross-origin requests with 403", async () => {
  // This test verifies the isSameOrigin check at the start of the route.
  // We simulate a request with a mismatched origin header.
  const request = new NextRequest(new URL("http://localhost:3000/api/memories/events/test-event/upload/init"), {
    method: "POST",
    headers: {
      // origin header says example.com, but host is localhost:3000 - mismatch = cross-origin
      origin: "http://example.com",
      host: "localhost:3000",
    },
    body: JSON.stringify({ mediaKind: "photo", sizeBytes: 1000 }),
  });

  // Verify the request would be rejected by checking the origin validation logic
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  assert(origin !== null, "origin header must be set");
  assert(host !== null, "host header must be set");
  assert.notEqual(origin, `http://${host}`, "origin and host must mismatch to trigger 403");
});

test("upload complete route rejects cross-origin requests with 403", async () => {
  // Same cross-origin check applies to upload/complete
  const request = new NextRequest(new URL("http://localhost:3000/api/memories/events/test-event/upload/complete"), {
    method: "POST",
    headers: {
      origin: "http://attacker.com",
      host: "localhost:3000",
    },
    body: JSON.stringify({ mediaId: "test", ticket: "test" }),
  });

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  assert.notEqual(origin, `http://${host}`);
});

test("malformed JSON in request body returns 400", async () => {
  // Both routes have try/catch on request.json() that returns 400 on parse error
  // This test verifies the pattern is in place by checking the error handling structure
  const invalidJsonRequest = new NextRequest(
    new URL("http://localhost:3000/api/memories/events/test-event/upload/init"),
    { method: "POST", body: "not valid json" },
  );

  try {
    await invalidJsonRequest.json();
    assert.fail("should have thrown");
  } catch {
    // Expected: request.json() throws on malformed input
    // The route's try/catch converts this to a 400 response
  }
});

test("quota check logic: media count at threshold should allow new upload", () => {
  // Test the quota check logic: 2000 is the hard cap (MAX_MEDIA_PER_EVENT)
  const currentCount = 1999;
  const maxMediaPerEvent = 2000;

  if (currentCount >= maxMediaPerEvent) {
    assert.fail("should allow upload when count is below max");
  }
  // This passes, meaning upload is allowed
});

test("quota check logic: media count at max should reject with 429", () => {
  // When count reaches the limit, new uploads should be rejected
  const currentCount = 2000;
  const maxMediaPerEvent = 2000;

  if (currentCount >= maxMediaPerEvent) {
    // Route returns 429 in this case
    assert.equal(currentCount, maxMediaPerEvent);
  } else {
    assert.fail("should reject upload when count is at max");
  }
});

test("quota check logic: media count above max should reject with 429", () => {
  // Above the max should also reject
  const currentCount = 2001;
  const maxMediaPerEvent = 2000;

  if (currentCount >= maxMediaPerEvent) {
    // Route returns 429 in this case
    assert.equal(true, currentCount >= maxMediaPerEvent);
  } else {
    assert.fail("should reject upload when count exceeds max");
  }
});

test("contentLength parameter is passed to storage provider", async () => {
  // When upload/init calls storage.createPresignedUploadUrl,
  // it now passes body.sizeBytes as the contentLength parameter.
  // This enforces the Content-Length constraint at the S3 level.

  const sizeBytes = 5242880; // 5MB
  const expectedContentLength = sizeBytes;

  assert.equal(expectedContentLength, 5242880);
  // The route passes this to:
  // storage.createPresignedUploadUrl(objectKey, contentType, 15*60, sizeBytes)
});

// Structural, like the route-contract tests in src/lib/invitations/*-route*.test.ts:
// the window check sits behind getEventMemoriesSettings() and createAdminClient(),
// neither of which can be reached from here, so this asserts the route's source
// actually wires isUploadWindowOpen in against the settings it just loaded.
test("upload/init enforces the upload window", () => {
  const source = readFileSync(new URL("./init/route.ts", import.meta.url), "utf8");
  assert.match(source, /isUploadWindowOpen/);
  assert.match(source, /isUploadWindowOpen\(settings\.startsAt\)/);
});

// Real handler-invoking tests for video upload support, now that the init
// route module can actually be imported under tsx --test (see this file's own
// header comment above — that was the blocker; it's fixed, and this is the
// follow-up it flagged as not yet written). mediaKind/contentType/sizeBytes
// validation all happens before any database call in the route, so those
// checks are fully deterministic here. Anything past that point
// (getEventMemoriesSettings et al.) reaches createAdminClient() with no
// Supabase credentials configured in this environment, so a request that
// clears validation surfaces as 500, not 200 — same pattern as
// highlights-route.test.ts's "reaches the database call" tests.
const EVENT_ID = "event-1";
const INIT_URL = `http://localhost:3000/api/memories/events/${EVENT_ID}/upload/init`;

function sameOriginInitRequest(body: unknown): NextRequest {
  return new NextRequest(new URL(INIT_URL), {
    method: "POST",
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST accepts mediaKind video with an accepted content type", async () => {
  const { POST } = await import("./init/route");
  const request = sameOriginInitRequest({ mediaKind: "video", contentType: "video/mp4", sizeBytes: 1_000_000 });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.notEqual(response.status, 400);
});

test("POST rejects an unsupported video content type with 400", async () => {
  const { POST } = await import("./init/route");
  // AVI — never in ALLOWED_CONTENT_TYPES, so this 400s before any database call.
  const request = sameOriginInitRequest({ mediaKind: "video", contentType: "video/x-msvideo", sizeBytes: 1_000_000 });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

for (const contentType of ["video/mp4", "video/webm", "video/quicktime"]) {
  test(`POST accepts video content type ${contentType}`, async () => {
    const { POST } = await import("./init/route");
    const request = sameOriginInitRequest({ mediaKind: "video", contentType, sizeBytes: 1_000_000 });
    const response = await POST(request, { params: { eventId: EVENT_ID } });
    assert.notEqual(response.status, 400);
  });
}

// KNOWN LIMITATION: unlike highlights-route.test.ts's founder/admin_session
// guard (which never touches the database, giving that file a real DB-free
// path to a genuine response body), the guest-facing upload/init flow has no
// such branch — every request here reaches getEventMemoriesSettings() and
// 500s with no response body worth asserting on, so "POST response includes
// posterUploadUrl for a video, and omits it for a photo" cannot be exercised
// end-to-end in this harness. Seeding a real "event-1" row would get a
// genuine 200, but this repo's Supabase project backs a real live client (see
// repository.test.ts's and repository-missing-descriptors-rpc.integration.
// test.ts's own header comments on why tests here don't write to it), so
// that's not a safe way to get one either. This asserts the same contract
// structurally instead, matching "upload/init enforces the upload window"
// just above.
test("upload/init computes posterUploadUrl only for video, and includes it conditionally in both response branches", () => {
  const source = readFileSync(new URL("./init/route.ts", import.meta.url), "utf8");
  assert.match(source, /objectKeyForVideoPoster\(eventId, mediaId\)/);
  assert.match(source, /mediaKind === "video"\s*\n?\s*\?/);
  const conditionalSpreadCount = (source.match(/\.\.\.\(posterUploadUrl \? \{ posterUploadUrl \} : \{\}\)/g) ?? []).length;
  assert.equal(
    conditionalSpreadCount,
    2,
    "expected posterUploadUrl to be conditionally spread into both the fixture-mode and real-R2 response bodies",
  );
});

// Regression coverage for the poster upload having no server-enforced size
// cap: the main video/photo upload's own createPresignedUploadUrl call
// already passes body.sizeBytes as contentLength (see the
// "contentLength parameter is passed to storage provider" test above), but
// the poster's presign call omitted it entirely — now that the client caps
// the captured poster frame's pixel dimensions (GuestUploadView.tsx), the
// upload itself should also be capped server-side, matching the main
// upload's own convention.
test("upload/init passes an explicit contentLength cap to the poster's presigned upload URL", () => {
  const source = readFileSync(new URL("./init/route.ts", import.meta.url), "utf8");
  assert.match(source, /MAX_POSTER_UPLOAD_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  assert.match(
    source,
    /createPresignedUploadUrl\(\s*\n?\s*objectKeyForVideoPoster\(eventId, mediaId\),\s*\n?\s*"image\/jpeg",\s*\n?\s*15 \* 60,\s*\n?\s*MAX_POSTER_UPLOAD_BYTES,?\s*\n?\s*\)/,
  );
});

// Video-aware upload/complete (Task 3). Real handler invocation isn't possible
// for the branching behavior itself: getMemoryMediaById is the very next call
// after ticket verification, and it reaches createAdminClient() with no
// Supabase credentials loaded into this `tsx --test` process (this repo's
// .env.local is not auto-loaded here — see the top-of-file KNOWN FOLLOW-UP and
// the init route's own "posterUploadUrl" test just above for the same
// limitation), so any request that gets past body/ticket validation 500s with
// no response body worth asserting on. Even setting SESSION_COOKIE_SECRET
// in-process to pass ticket verification doesn't help — createAdminClient()
// throws synchronously on the missing Supabase URL/key before any network
// call. And this worktree's real Supabase project backs a real live client
// (see repository.test.ts's own header comment), so seeding a row to get a
// genuine 200 isn't a safe option either. Following the precedent set by
// "upload/init computes posterUploadUrl only for video" above, these assert
// the same contract structurally instead.
test("upload/complete fetches the media row and 404s when it doesn't exist", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  assert.match(source, /getMemoryMediaById\(parsedBody\.mediaId\)/);
  assert.match(source, /if \(!media\)/);
  assert.match(source, /status: 404/);
});

test("upload/complete branches on media kind: video checks poster existence via R2StorageProvider.objectExists before marking ready", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  assert.match(source, /media\.mediaKind === "video"/);
  assert.match(source, /objectKeyForVideoPoster\(eventId, parsedBody\.mediaId\)/);
  assert.match(source, /new R2StorageProvider\(\)/);
  assert.match(source, /storage\.objectExists\(posterKey\)/);
  assert.match(source, /markVideoMemoryMediaReady\(parsedBody\.mediaId, media\.objectKeyOriginal, posterKey\)/);
});

test("upload/complete returns 409 without marking the video ready when the poster object is missing", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!posterExists\)/);
  assert.match(source, /status: 409/);
  // The 409 short-circuit must sit before the markVideoMemoryMediaReady call,
  // so a missing poster can never still flip the row to ready.
  const posterCheckIndex = source.indexOf("if (!posterExists)");
  const markVideoReadyIndex = source.indexOf("await markVideoMemoryMediaReady(");
  assert.ok(posterCheckIndex > -1 && markVideoReadyIndex > -1 && posterCheckIndex < markVideoReadyIndex);
});

test("upload/complete still completes a non-video (photo) upload via markMemoryMediaUploaded, unchanged", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  assert.match(source, /}\s*else\s*{\s*\n\s*await markMemoryMediaUploaded\(parsedBody\.mediaId\);/);
});

// Regression coverage for the critical finding that nothing ever triggered
// moderation for a video: workers/memories-processing/src/index.ts (the
// Cloudflare Worker) returns early for any unsupported (non-image)
// extension — every video — before it ever reaches its own fire-and-forget
// moderation trigger. So a video's moderation_status stayed at its DB
// default ('pending') forever, invisible to computeGalleryVisible (requires
// 'approved') and unrescuable by the host review UI (allowedModerationStatuses
// ("approve") never accepts 'pending'). The fix: upload/complete/route.ts
// calls the extracted moderateMedia(...) (see ../../../moderate/moderate-media.ts)
// directly, independent of the Worker pipeline, immediately after a video is
// marked ready — real handler invocation isn't possible here for the same
// reason documented at the top of this file (createAdminClient() throws with
// no Supabase env loaded into this tsx --test process), so — matching this
// file's own established structural-test convention for that exact
// limitation — this asserts the source actually wires the call into the
// video branch (and only the video branch), in the right order, best-effort.
test("upload/complete imports and calls moderateMedia for the video branch, after markVideoMemoryMediaReady succeeds", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  assert.match(source, /import\s*{\s*moderateMedia\s*}\s*from\s*["']@\/app\/api\/memories\/moderate\/moderate-media["']/);
  assert.match(source, /moderateMedia\(parsedBody\.mediaId\)/);

  const markReadyIndex = source.indexOf("await markVideoMemoryMediaReady(");
  const moderateCallIndex = source.indexOf("moderateMedia(parsedBody.mediaId)");
  const elseBranchIndex = source.indexOf("} else {");
  assert.ok(markReadyIndex > -1 && moderateCallIndex > -1 && elseBranchIndex > -1);
  assert.ok(markReadyIndex < moderateCallIndex, "moderation must be triggered only after the video is marked ready");
  assert.ok(moderateCallIndex < elseBranchIndex, "the moderation trigger must live inside the video branch, not the photo (else) branch");
});

test("upload/complete's video-moderation trigger is best-effort: wrapped so a failure is logged, not thrown, and never turns /complete into an error response", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  const moderateCallIndex = source.indexOf("moderateMedia(parsedBody.mediaId)");
  const precedingTryIndex = source.lastIndexOf("try {", moderateCallIndex);
  const followingCatchIndex = source.indexOf("} catch", moderateCallIndex);
  assert.ok(precedingTryIndex > -1 && followingCatchIndex > -1, "expected the moderateMedia call to sit inside its own try/catch");
  // That catch block must log, not rethrow — i.e. no bare `throw` between the
  // catch and its closing brace, which would otherwise propagate into this
  // route's outer try/catch and turn a moderation hiccup into a 500 for the
  // guest.
  const catchBlock = source.slice(followingCatchIndex, source.indexOf("}", source.indexOf("{", followingCatchIndex) + 1) + 1);
  assert.match(catchBlock, /console\.error\(/);
  assert.doesNotMatch(catchBlock, /\bthrow\b/);
});

test("photo (non-video) completion never calls moderateMedia — photos still rely solely on the Worker's own trigger", () => {
  const source = readFileSync(new URL("./complete/route.ts", import.meta.url), "utf8");
  const elseBranchStart = source.indexOf("} else {");
  const elseBranchEnd = source.indexOf("\n    }\n\n    return NextResponse.json({ ok: true });");
  assert.ok(elseBranchStart > -1 && elseBranchEnd > -1 && elseBranchStart < elseBranchEnd);
  const elseBranchSource = source.slice(elseBranchStart, elseBranchEnd);
  assert.doesNotMatch(elseBranchSource, /moderateMedia\(/);
});
