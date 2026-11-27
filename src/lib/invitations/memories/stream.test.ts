import assert from "node:assert/strict";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  copyVideoToStream,
  deleteStreamVideo,
  getStreamConfig,
  getStreamVideoState,
  isStreamPlaybackUrl,
  signStreamToken,
  signedPlaybackUrl,
  type StreamConfig,
} from "./stream";
import { archiveCutoffIso } from "./stream-archive";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" }))).toString("base64");
const config: StreamConfig = { accountId: "acct", apiToken: "token", signingKeyId: "key-1", signingKeyJwk: jwk };

test("Stream stays off until every setting is present", () => {
  assert.equal(getStreamConfig({}), null);
  assert.equal(getStreamConfig({ R2_ACCOUNT_ID: "a", CLOUDFLARE_STREAM_API_TOKEN: "t", CLOUDFLARE_STREAM_SIGNING_KEY_ID: "k" }), null);
  assert.deepEqual(
    getStreamConfig({ R2_ACCOUNT_ID: "a", CLOUDFLARE_STREAM_API_TOKEN: "t", CLOUDFLARE_STREAM_SIGNING_KEY_ID: "k", CLOUDFLARE_STREAM_SIGNING_KEY_JWK: "j" }),
    { accountId: "a", apiToken: "t", signingKeyId: "k", signingKeyJwk: "j" },
  );
  assert.equal(
    getStreamConfig({ R2_ACCOUNT_ID: "a", CLOUDFLARE_STREAM_ACCOUNT_ID: "b", CLOUDFLARE_STREAM_API_TOKEN: "t", CLOUDFLARE_STREAM_SIGNING_KEY_ID: "k", CLOUDFLARE_STREAM_SIGNING_KEY_JWK: "j" })?.accountId,
    "b",
  );
});

test("signed playback tokens are RS256 JWTs Stream can verify", () => {
  const token = signStreamToken(config, "abc123", 1_900_000_000.7);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", kid: "key-1" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString()), { sub: "abc123", kid: "key-1", exp: 1_900_000_000 });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${payload}`);
  assert.equal(verifier.verify(createPublicKey(publicKey.export({ format: "pem", type: "spki" })), Buffer.from(signature, "base64url")), true);
});

test("signed playback links swap the video id for the token, on Stream hosts only", () => {
  assert.equal(
    signedPlaybackUrl("https://customer-x.cloudflarestream.com/abc123/manifest/video.m3u8", "abc123", "TOKEN"),
    "https://customer-x.cloudflarestream.com/TOKEN/manifest/video.m3u8",
  );
  assert.equal(signedPlaybackUrl("https://evil.example/abc123/manifest/video.m3u8", "abc123", "TOKEN"), null);
  assert.equal(signedPlaybackUrl("https://videodelivery.net/other/manifest/video.m3u8", "abc123", "TOKEN"), null);
  assert.equal(isStreamPlaybackUrl("http://videodelivery.net/a"), false);
  assert.equal(isStreamPlaybackUrl("https://cloudflarestream.com.evil.example/a"), false);
});

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, impl };
}

test("copying asks Stream to fetch the R2 original with signed playback required", async () => {
  const { calls, impl } = fakeFetch(200, { success: true, result: { uid: "new-uid" } });
  assert.equal(await copyVideoToStream(config, { sourceUrl: "https://r2.example/v.mp4?sig", name: "m1" }, impl), "new-uid");
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acct/stream/copy");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { url: "https://r2.example/v.mp4?sig", meta: { name: "m1" }, requireSignedURLs: true });
  assert.equal(await copyVideoToStream(config, { sourceUrl: "x", name: "m" }, fakeFetch(400, { success: false }).impl), null);
});

test("Stream's video state is read defensively", async () => {
  const ready = await getStreamVideoState(
    config,
    "u",
    fakeFetch(200, { success: true, result: { readyToStream: true, duration: 72.4, playback: { hls: "https://videodelivery.net/u/manifest/video.m3u8" } } }).impl,
  );
  assert.deepEqual(ready, { ready: true, failed: false, hlsUrl: "https://videodelivery.net/u/manifest/video.m3u8", durationSeconds: 72.4 });
  const foreign = await getStreamVideoState(config, "u", fakeFetch(200, { success: true, result: { readyToStream: true, playback: { hls: "https://evil.example/u" } } }).impl);
  assert.equal(foreign?.ready, false);
  assert.equal((await getStreamVideoState(config, "u", fakeFetch(404, { success: false }).impl))?.failed, true);
  assert.equal(await getStreamVideoState(config, "u", fakeFetch(500, { success: false }).impl), null);
});

test("a delete counts when the copy is gone either way", async () => {
  assert.equal(await deleteStreamVideo(config, "u", fakeFetch(200, {}).impl), true);
  assert.equal(await deleteStreamVideo(config, "u", fakeFetch(404, {}).impl), true);
  assert.equal(await deleteStreamVideo(config, "u", fakeFetch(500, {}).impl), false);
});

test("the archive job stays off unless a positive number of days is set", () => {
  const now = Date.UTC(2026, 10, 27);
  assert.equal(archiveCutoffIso(undefined, now), null);
  assert.equal(archiveCutoffIso("", now), null);
  assert.equal(archiveCutoffIso("0", now), null);
  assert.equal(archiveCutoffIso("-5", now), null);
  assert.equal(archiveCutoffIso("ten", now), null);
  assert.equal(archiveCutoffIso("30", now), new Date(Date.UTC(2026, 9, 28)).toISOString());
});
