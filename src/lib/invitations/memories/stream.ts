import { createPrivateKey, createSign } from "node:crypto";

// Cloudflare Stream keeps a phone-sized, adaptive copy of each guest video.
// The original always stays in R2: Stream copies it from a signed R2 link
// after the upload finishes, so a guest's phone uploads the file only once,
// older videos keep playing from R2, and the archive job can drop the Stream
// copy without losing the clip.
//
// Everything here is off until all three settings below are present, so a
// deploy without them behaves exactly as before.
//   CLOUDFLARE_STREAM_API_TOKEN       API token with Stream:Edit
//   CLOUDFLARE_STREAM_SIGNING_KEY_ID  `id` from POST /accounts/{id}/stream/keys
//   CLOUDFLARE_STREAM_SIGNING_KEY_JWK `jwk` from that same response (base64)
// The account id defaults to R2_ACCOUNT_ID, which is the same Cloudflare
// account; CLOUDFLARE_STREAM_ACCOUNT_ID overrides it.

const API_BASE = "https://api.cloudflare.com/client/v4";

export interface StreamConfig {
  accountId: string;
  apiToken: string;
  signingKeyId: string;
  signingKeyJwk: string;
}

type Env = Record<string, string | undefined>;

export function getStreamConfig(env: Env = process.env): StreamConfig | null {
  const accountId = env.CLOUDFLARE_STREAM_ACCOUNT_ID || env.R2_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_STREAM_API_TOKEN;
  const signingKeyId = env.CLOUDFLARE_STREAM_SIGNING_KEY_ID;
  const signingKeyJwk = env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK;
  if (!accountId || !apiToken || !signingKeyId || !signingKeyJwk) return null;
  return { accountId, apiToken, signingKeyId, signingKeyJwk };
}

export function isStreamConfigured(env: Env = process.env): boolean {
  return getStreamConfig(env) !== null;
}

export type StreamFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function callStream<T>(
  config: StreamConfig,
  path: string,
  init: RequestInit,
  fetchImpl: StreamFetch,
): Promise<{ status: number; result: T | null; errors: unknown }> {
  const response = await fetchImpl(`${API_BASE}/accounts/${config.accountId}/stream${path}`, {
    ...init,
    headers: { authorization: `Bearer ${config.apiToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: T; errors?: unknown } | null;
  if (!response.ok || !body?.success) return { status: response.status, result: null, errors: body?.errors ?? null };
  return { status: response.status, result: body.result ?? null, errors: null };
}

// Asks Stream to fetch the clip from a signed R2 link. Returns Stream's id for
// the new video, or null when Stream refused (out of storage, bad link, or an
// outage). Playback then simply stays on the R2 original.
export async function copyVideoToStream(
  config: StreamConfig,
  input: { sourceUrl: string; name: string },
  fetchImpl: StreamFetch = fetch,
): Promise<string | null> {
  const { status, result, errors } = await callStream<{ uid?: string }>(
    config,
    "/copy",
    {
      method: "POST",
      body: JSON.stringify({ url: input.sourceUrl, meta: { name: input.name }, requireSignedURLs: true }),
    },
    fetchImpl,
  );
  if (typeof result?.uid === "string" && result.uid) return result.uid;
  // The row only records "failed"; without this line the reason Stream said no
  // (no subscription, out of storage, could not fetch the link) is lost.
  console.error("[memories/stream] Stream refused the copy (non-fatal)", { name: input.name, status, errors });
  return null;
}

export interface StreamVideoState {
  ready: boolean;
  failed: boolean;
  hlsUrl: string | null;
  durationSeconds: number | null;
}

export async function getStreamVideoState(
  config: StreamConfig,
  uid: string,
  fetchImpl: StreamFetch = fetch,
): Promise<StreamVideoState | null> {
  const { status, result } = await callStream<{
    readyToStream?: boolean;
    status?: { state?: string };
    playback?: { hls?: string };
    duration?: number;
  }>(config, `/${encodeURIComponent(uid)}`, { method: "GET" }, fetchImpl);
  if (!result) return status === 404 ? { ready: false, failed: true, hlsUrl: null, durationSeconds: null } : null;
  const hlsUrl = typeof result.playback?.hls === "string" && isStreamPlaybackUrl(result.playback.hls) ? result.playback.hls : null;
  return {
    ready: result.readyToStream === true && hlsUrl !== null,
    failed: result.status?.state === "error",
    hlsUrl,
    durationSeconds: typeof result.duration === "number" && result.duration > 0 ? result.duration : null,
  };
}

// True when Stream no longer has the video afterwards (deleted now or already gone).
export async function deleteStreamVideo(config: StreamConfig, uid: string, fetchImpl: StreamFetch = fetch): Promise<boolean> {
  const response = await fetchImpl(`${API_BASE}/accounts/${config.accountId}/stream/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${config.apiToken}` },
  });
  return response.ok || response.status === 404;
}

export function isStreamPlaybackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "videodelivery.net" || url.hostname.endsWith(".cloudflarestream.com"));
  } catch {
    return false;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// A signed playback token, made locally with the Stream signing key so a busy
// gallery never waits on (or runs into the limits of) Stream's token API.
export function signStreamToken(config: StreamConfig, uid: string, expiresAtSeconds: number): string {
  const jwk = JSON.parse(Buffer.from(config.signingKeyJwk, "base64").toString("utf8"));
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const header = base64url(JSON.stringify({ alg: "RS256", kid: config.signingKeyId }));
  const payload = base64url(JSON.stringify({ sub: uid, kid: config.signingKeyId, exp: Math.floor(expiresAtSeconds) }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(key).toString("base64url")}`;
}

// Stream's playback links carry the video id as the first path segment; a
// signed link puts the token in its place.
export function signedPlaybackUrl(hlsUrl: string, uid: string, token: string): string | null {
  if (!isStreamPlaybackUrl(hlsUrl)) return null;
  const url = new URL(hlsUrl);
  const segments = url.pathname.split("/");
  const index = segments.indexOf(uid);
  if (index === -1) return null;
  segments[index] = token;
  url.pathname = segments.join("/");
  return url.toString();
}
