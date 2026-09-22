# InviteSpot Memories — deployment setup

One-time infrastructure setup to take the Memories feature (guest photo/video
sharing) from merged code to a working production pipeline. Do this before
merging `feat/invitation-reference-recreation` into `main`, or right after —
the feature ships dormant (`invitation_events.memories_enabled = false` by
default) so there's no guest-facing risk either way.

## 0. Prerequisite: Workers Paid plan

Cloudflare's dashboard gates R2 event notifications behind the **Workers
Paid** plan ($5/mo + usage), separate from Queues' own free tier. Upgrade at
Cloudflare dashboard → Workers & Pages → Plans, before step 2.

Even without that gate, the processing Worker decodes and resizes images via
`@cf-wasm/photon` (WASM), which routinely exceeds the Free plan's 10ms
CPU-time-per-request cap. Paid is required either way.

## 1. Install and authenticate wrangler

Wrangler is already pinned as a devDependency in
`workers/memories-processing/package.json`.

```bash
cd workers/memories-processing
npm install
npx wrangler login       # opens a browser OAuth flow
npx wrangler whoami       # confirm — note the Account ID printed here, needed below
```

Headless/remote shell: `wrangler login` prints a URL to open on another
device instead of popping a browser.

Alternative to interactive login — a Cloudflare API token (dashboard → My
Profile → API Tokens → Create Token, "Edit Cloudflare Workers" template, or
custom with Workers Scripts + Queues + R2 edit permissions):

```bash
export CLOUDFLARE_API_TOKEN=<token>
```

## 2. Cloudflare infrastructure

All names below are hardcoded in `workers/memories-processing/wrangler.toml`
— create them with exactly these names.

**R2 bucket:** `invitespot-memories`

**Queues** — create two:
- `memories-processing` (main queue)
- `memories-processing-dlq` (dead-letter queue)

**R2 → Queue event notification** — on the `invitespot-memories` bucket,
create an event notification rule:
- Event type: object create (PutObject)
- Prefix filter: `originals/`
- Destination queue: `memories-processing`

Getting the prefix wrong silently breaks the entire pipeline — the object
key convention is `{stage}/{eventId}/{mediaId}.{ext}` (stage segment first,
e.g. `originals/…`, `display/…`, `thumbnails/…`), specifically so one
bucket-wide `originals/` prefix filter matches every event's uploads.

**Deploy the Worker:**

```bash
cd workers/memories-processing
npx wrangler deploy
```

**Set the Worker's secret** (not in `wrangler.toml`, which is committed —
`MEMORIES_APP_BASE_URL` is already there as a plaintext `[vars]` entry
pointing at `https://www.siteforowners.com`, the canonical `www` host):

```bash
npx wrangler secret put MEMORIES_INTERNAL_SECRET
```

Use the **same value** you set for `MEMORIES_INTERNAL_SECRET` in Vercel
(step 4) — the app verifies the Worker's calls to `/api/memories/moderate`
and `/api/memories/processing-complete` against this shared secret.

## 3. AWS Rekognition (moderation)

The code makes exactly one AWS call (`ai-provider.ts`: `DetectModerationLabelsCommand`),
so the IAM user needs exactly one permission. `DetectModerationLabels` doesn't
support resource-level scoping — per AWS's own service authorization
reference, it operates on image bytes passed in the request rather than a
stored resource ARN, so `Resource: "*"` is the only valid value, not an
over-broad grant.

Policy JSON: `docs/aws-rekognition-memories-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InviteSpotMemoriesModeration",
      "Effect": "Allow",
      "Action": "rekognition:DetectModerationLabels",
      "Resource": "*"
    }
  ]
}
```

**Console:** IAM → Users → Create user (e.g. `invitespot-memories-rekognition`)
→ skip groups, attach permissions directly → Create policy → JSON tab →
paste the above → name it `InviteSpotMemoriesModeration` → attach to the
user → Security credentials tab → Create access key ("Application running
outside AWS") → copy into `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

**CLI:**

```bash
aws iam create-policy --policy-name InviteSpotMemoriesModeration \
  --policy-document file://docs/aws-rekognition-memories-policy.json
aws iam create-user --user-name invitespot-memories-rekognition
aws iam attach-user-policy --user-name invitespot-memories-rekognition \
  --policy-arn arn:aws:iam::<your-account-id>:policy/InviteSpotMemoriesModeration
aws iam create-access-key --user-name invitespot-memories-rekognition
```

Don't reuse a broader existing AWS key for this — this credential should
only ever be able to call `DetectModerationLabels`.

## 4. Environment variables — Vercel (Production)

Already live in production (the invitations feature depends on them —
verify present, nothing new to do):
- `SESSION_COOKIE_SECRET`
- `CRON_SECRET`

New variables this feature introduces:

| Variable | Value / source |
|---|---|
| `R2_ACCOUNT_ID` | from `wrangler whoami` (step 1) |
| `R2_ACCESS_KEY_ID` | R2 API token, S3-compatible credentials scoped to `invitespot-memories` |
| `R2_SECRET_ACCESS_KEY` | same R2 API token |
| `R2_BUCKET_MEMORIES` | `invitespot-memories` |
| `CLOUDFLARE_QUEUES_API_TOKEN` | Cloudflare API token with Queues read/write (used by the DLQ-drain cron's pull/ack HTTP calls — can be the same token as `CLOUDFLARE_API_TOKEN` if its permissions cover both) |
| `MEMORIES_DLQ_ID` | the **queue ID** (not name) of `memories-processing-dlq`, from the Cloudflare dashboard |
| `MEMORIES_INTERNAL_SECRET` | generate: `openssl rand -base64 32` — must exactly match the Worker secret set in step 2 |
| `AWS_ACCESS_KEY_ID` | the Rekognition IAM user (step 3) |
| `AWS_SECRET_ACCESS_KEY` | same IAM user |
| `AWS_REGION` | `us-east-1` |

Full list also documented inline in `.env.example`.

## 5. Supabase migration

No linked local Supabase project in this repo, so `supabase db push` isn't
pre-wired. Apply `supabase/migrations/056_invitation_memories_foundation.sql`
the same way prior invitation migrations were applied (per
`docs/invitations-pilot-runbook.md`): in numeric order, against the
production project.

- **Supabase Studio SQL editor** — paste and run the file directly. It's
  idempotent (`IF NOT EXISTS` throughout every `CREATE TABLE`/`CREATE INDEX`),
  safe to re-run if you're ever unsure it applied.
- **Or CLI** — `npx supabase link --project-ref <ref>` once, then
  `npx supabase db push`.

Order relative to the code deploy doesn't matter much — nothing reads/writes
these tables until a real request comes in, and the feature is gated off by
default (`memories_enabled = false`).

## 6. Merge and deploy

This repo ships `feat/invitation-reference-recreation` → `main` via GitHub
PR (see merged PRs #224–229), not a local `git merge`. Vercel deploys
production from `main`; pushing the branch alone only creates a preview
deployment.

```bash
git push origin feat/invitation-reference-recreation
gh pr create --title "..." --body "..." --base main
# merge the PR once ready — production deploys automatically on merge
```

## 7. Post-deploy smoke check

- Confirm the migration applied: `memory_media`, `memory_upload_sessions`,
  `memory_moments`, `memory_moment_media`, `memory_processing_jobs` exist in
  Supabase, and `invitation_events` has `memories_enabled`/`memories_mode`.
- Call `/api/cron/memories-dlq-drain` once with `Authorization: Bearer
  $CRON_SECRET` — expect `200`, not `500`, even with zero messages queued.
- A full guest-upload end-to-end check needs Plan B's guest upload UI, which
  doesn't exist yet — until then this ships dormant with no live guest-facing
  surface.

## Known limitations at this stage (Plan A / V1 Foundation)

- **Video uploads are rejected (400)** at `/upload/init` — no video
  moderation path exists yet (the spec's client-captured poster-frame
  moderation mechanism was never built). Deliberate, temporary; lifting it
  is a one-line change once video moderation ships in a later plan.
- **HEIC is rejected, not supported** — the iPhone default camera format
  isn't decodable by the Worker's image pipeline yet. Needs either
  client-side transcoding before upload or a HEIC-capable decode path.
- **No per-guest-session rate limiting** — only a same-origin check and a
  2,000-completed-upload-per-event ceiling. Full rate limiting was
  explicitly descoped from V1 Foundation.
- **`ON DELETE CASCADE` on `memory_media.event_id` doesn't clean up R2
  objects.** Deleting an `invitation_events` row will orphan the bucket
  objects behind its memories. No object-lifecycle cleanup exists yet.
