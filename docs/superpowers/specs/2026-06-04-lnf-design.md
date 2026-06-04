# LNF — Design Spec (v1)

**Date:** 2026-06-04
**Status:** Draft, pending stakeholder review
**Authors:** Claude (drafting), Siyuan Hua (approver)

## 0. Context

This spec describes the v1 architecture, data model, request flows, error handling, testing, and explicit Phase 2 deferrals for **LNF** — a service that helps return lost vulnerable persons (children, people with autism or intellectual disability, adults with dementia) to their caregivers using QR-tagged clothing.

Product scope, user roles, and acceptance criteria are defined in:

- [`docs/requirements.en.md`](../../requirements.en.md) (English, source of truth)
- [`docs/requirements.es.md`](../../requirements.es.md) (Spanish, parallel)

This document describes **how** v1 will be built. It does not restate **what** is being built or **why**, except where necessary to motivate a design choice.

Launch region: LATAM. Privacy baseline: Brazil's LGPD. UI languages: Spanish (es) and Portuguese (pt-BR). Team shape: solo / small team, MVP in weeks.

## 1. Architecture

### 1.1 System shape

```
                  ┌──────────────────────────────────────────┐
                  │            Caregivers (auth)             │
                  │   Expo mobile app   ↔   Next.js web      │
                  └──────────────┬───────────────────────────┘
                                 │  Hono RPC over HTTPS (typed)
                                 ▼
┌────────────────────────────────────────────────────────────┐
│                    apps/api (Hono on Node)                 │
│   routes:                                                  │
│     /partner/*    (partner portal + API)                   │
│     /tag/*        (caregiver scan/activate)                │
│     /find/*       (finder report + caregiver view)         │
│     /caregiver/*  (account, channels, history)             │
│     /f/:code      (public finder page, SSR via Next.js)    │
│   ─────────────────────────────────────────────────────    │
│   service modules:                                         │
│     • Auth (Better-Auth) for caregiver and partner users   │
│     • Tag codes (mint / lookup / activate / revoke)        │
│     • Find intake                                          │
│     • Escalation engine (state machine + worker)           │
│     • Notification dispatch (push/email/SMS/voice)         │
└────────┬──────────────────────────────────┬────────────────┘
         │                                  │
         ▼                                  ▼
   ┌──────────────┐                ┌────────────────────┐
   │  Postgres    │                │  Job queue         │
   │  (Drizzle    │◄───records─────│  Graphile Worker   │
   │   + PostGIS) │                │  (Postgres-backed) │
   └──────────────┘                └────────┬───────────┘
                                            │ outbound calls
                                            ▼
                              ┌─────────────────────────────┐
                              │ Expo Push │ Resend │ Twilio │
                              │   (push)  │ (mail) │SMS+voice│
                              └─────────────────────────────┘

                  ┌─────────────────────────────────────────┐
                  │     Finder (no install, no auth)        │
                  │   GET https://lnf.app/f/:code  →  form  │
                  └─────────────────────────────────────────┘

                  ┌─────────────────────────────────────────┐
                  │     Partner (auth)                      │
                  │   Portal (Next.js)  ↔  API (Bearer key) │
                  └─────────────────────────────────────────┘
```

### 1.2 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | **Hono** on Node | Small, fast, typed RPC for free |
| Database | **PostgreSQL + PostGIS + Drizzle ORM** | LATAM data residency available; PostGIS for geo; Drizzle is SQL-first and lighter than Prisma |
| Job queue | **Graphile Worker** | Postgres-backed → no extra infra; same transactional boundary as the rest of the data |
| Web | **Next.js (App Router)** | SSR for the finder page is critical (fast public surface, render before JS boots) |
| Mobile | **Expo (React Native) + Expo Router** | One codebase → iOS + Android; OTA updates; same React mental model as web |
| Auth | **Better-Auth** | Self-hostable, framework-agnostic, supports email+password, social, magic-link |
| Validation | **Zod** in `packages/schemas` | Same schemas validate API boundary, web forms, mobile forms |
| Push | **Expo Push Service** | Free; no separate APNs/FCM credential management for MVP |
| Email | **Resend** (or SES) | Provider behind a `Mailer` interface, swappable |
| SMS + voice | **Twilio** | Best LATAM coverage; behind a `Smser` / `Voicer` interface |
| Maps (caregiver view) | **TBD — Google Maps Platform vs. MapLibre + OSM** | Open question A2; cost-affecting |
| Tests | **Vitest** (unit + integration), **Playwright** (web E2E), **Maestro** (mobile smoke) | ESM-native, fast, low-flake |

### 1.3 Repo layout

```
apps/
  api/        # Hono server — exports an AppType for RPC
  web/        # Next.js — public finder page + caregiver web fallback + partner portal
  mobile/     # Expo — caregiver app
packages/
  schemas/    # Zod schemas shared across all clients + server
  api-client/ # Hono RPC wrapper, tree-shakeable
  ui/         # Shared React primitives usable by web (and React Native via NativeWind, if needed)
  config/     # eslint/tsconfig/tailwind base configs
docs/         # requirements.en.md, requirements.es.md, this spec
```

API contracts live in `packages/schemas`, never duplicated per client.

### 1.4 Conventions

- **Server is the source of truth for business rules.** Clients render and submit; they don't compute. The mobile client is deliberately "thin" — no pricing, escalation, or state-machine logic on device.
- **All shared types come from Zod.** No hand-written DTOs.
- **Hono RPC, not hand-written fetch wrappers.** `import type { AppType } from '@app/api'` on the client gives typed routes without codegen.
- **Drizzle migrations are checked in.** Never edit a migration that's been merged.
- **Notification dispatchers are pluggable.** Each channel implements `send(payload) → {messageId, status}`. The escalation engine talks to the interface, not Twilio directly.

### 1.5 Out-of-process pieces (NOT in v1)

- WhatsApp channel
- Object/asset tags
- Realtime "caregiver is on the way" signal
- Multi-tenant operator UI as product

These are addressed in §6.

## 2. Data model

### 2.1 Entity-relationship summary

```
partner ──┬── 1..N ── partner_user
          ├── 1..N ── partner_api_key
          ├── 1..N ── tag_batch ── 1..N ── tag

caregiver ──┬── 1..N ── protected_person ──┬── 0..N ── tag (after activation)
            │                              └── 0..N ── find ──┬── 1..N ── location_sample
            │                                                 └── 1..N ── notification_attempt
            ├── 1..N ── notification_channel
            └── 1..N ── device

audit_event (caregiver_id, partner_id, find_id — all nullable)
spend_ledger (per caregiver, per day, per kind)
```

### 2.2 State machines

**`tag.state`** (monotonic forward):
```
unactivated  →  active  →  revoked
```
No reactivation. No transfer in v1.

**`find.status`**:
```
reported ──► acknowledged ──┬──► claimed ──► resolved
                            ├──► resolved        (skip claimed)
                            └──► false_positive
reported ──► expired       (terminal from reported only)
```
`claimed` is optional — caregiver may go straight from `acknowledged` to `resolved`. There is no `unclaim`.

### 2.3 Tables

#### `partner`
- `id` (uuid, pk), `name`, `billing_email`, `status` (`active` | `suspended`), `settings` (jsonb — reserved for Phase 2 theming), `created_at`, `deleted_at`.

#### `partner_user`
- `id`, `partner_id` (fk), `email` (unique), `role` (`admin` | `member`), `created_at`, `deleted_at`.

#### `partner_api_key`
- `id`, `partner_id` (fk), `key_prefix` (visible, indexed), `key_hash` (bcrypt), `label`, `last_used_at`, `created_at`, `revoked_at`.

#### `tag_batch`
- `id`, `partner_id` (fk), `size`, `label`, `created_at`, `csv_token_hash`, `csv_token_expires_at`, `csv_downloaded_at` (nullable).

#### `tag`
- `id`, `code` (unique, indexed; ~22 chars base32), `partner_id` (fk, NOT NULL), `batch_id` (fk, NOT NULL), `state` (enum), `protected_person_id` (fk, nullable), `caregiver_id` (denormalized fk, nullable), `label` (nullable), `activated_at` (nullable), `revoked_at` (nullable).
- `caregiver_id` is denormalized for hot read path on scan; `protected_person.caregiver_id` remains the source of truth for transfers (which v1 doesn't support).

#### `caregiver`
- `id`, `email` (unique, nullable until upgraded from anonymous), `phone` (nullable), `name`, `preferred_locale` (`es` | `pt-BR` | `en`), `is_anonymous` (bool), `created_at`, `deleted_at` (soft-delete).

#### `device`
- `id`, `caregiver_id` (fk), `platform` (`ios` | `android`), `expo_push_token` (unique), `last_seen_at`.

#### `notification_channel`
- `id`, `caregiver_id` (fk), `protected_person_id` (fk, nullable; nullable means default for the account), `kind` (`push` | `email` | `sms` | `voice`), `target` (token / address / e164), `verified_at` (nullable), `priority` (int, 0 = first), `escalation_delay_seconds` (int), `is_active`.

#### `protected_person`
- `id`, `caregiver_id` (fk), `private_nickname`, `public_note` (≤200 chars), `created_at`, `archived_at` (nullable).
- v1 carries no name, photo, or medical fields. Phase 2.

#### `find`
- `id`, `tag_id` (fk), `status` (enum), `reported_at`, `acknowledged_at` (nullable), `claimed_at` (nullable), `resolved_at` (nullable), `expired_at` (nullable), `finder_fingerprint` (hashed device/IP — for forensics, not v1 rate-limiting), `finder_message` (≤500 chars), `finder_contact` (nullable, free text), `initial_location_text`, `initial_location_geo` (PostGIS point), `initial_location_accuracy_m`, `is_collapsed_into` (fk to another `find.id`, nullable; set when this find was a follow-up scan within the per-tag 5-min collapse window — see §4.2 #10).

#### `location_sample`
- `id`, `find_id` (fk), `recorded_at`, `geo`, `accuracy_m`, `received_at`.
- Append-only, indexed `(find_id, recorded_at)`. Hard-deleted 24 h after parent find terminates.

#### `notification_attempt`
- `id`, `find_id` (fk), `channel_kind`, `channel_target`, `attempted_at`, `provider_message_id`, `delivery_status` (`queued` | `sent` | `delivered` | `failed`), `failure_reason`, `cost_minor_units`.

#### `spend_ledger`
- `id`, `caregiver_id`, `day` (date), `kind` (`sms` | `voice`), `cost_minor_units`, `country_code`.
- Daily aggregate; checked just-in-time at dispatch.

#### `audit_event`
- `id`, `caregiver_id` (nullable), `partner_id` (nullable), `find_id` (nullable), `kind`, `payload` (jsonb), `at`.
- Kinds: `find.created`, `find.acknowledged`, `find.claimed`, `find.resolved`, `find.false_positive`, `find.expired`, `tag.activated`, `tag.revoked`, `partner.batch.minted`, `partner.batch.csv_downloaded`, `partner.api_key.created`, `partner.api_key.revoked`, `caregiver.exported_data`, `caregiver.deleted_account`.

### 2.4 Indexes

- `tag(code)` unique — hottest read path (sub-millisecond).
- `tag(partner_id, batch_id, state)` — partner analytics.
- `tag(caregiver_id)` partial `WHERE caregiver_id IS NOT NULL` — caregiver "my tags" view.
- `find(tag_id, reported_at desc)` — caregiver history view.
- `find(status, reported_at)` — escalation worker scans for pending escalations and stale finds.
- `location_sample(find_id, recorded_at)` — live-tracking subscription read pattern and cleanup job.
- `notification_channel(caregiver_id, protected_person_id, priority)` — fast lookup of next channel.
- `partner_api_key(key_prefix)` — fast routing for incoming API requests.

### 2.5 Retention & deletion

- **Find history:** retained indefinitely in v1 (no anonymization job). Caregiver-facing history is permanent until account deletion.
- **`location_sample`:** hard-deleted 24 h after parent find terminates (`resolved` / `expired` / `false_positive`). Operator-configurable.
- **`audit_event`:** retained 24 months by default. Operator-configurable.
- **Caregiver soft-delete:** `caregiver.deleted_at` flips on user request. 14-day grace period (recoverable). Hard-delete cascades all caregiver-owned rows; `audit_event.caregiver_id` is anonymized to NULL rather than deleted.
- **`location_sample`** always hard-deletes per its own policy regardless of caregiver state.

### 2.6 Things deliberately not in the model

- **No "session" or "rate-limit" tables.** Auth sessions live in Better-Auth tables; rate limits (when added in Phase 2) belong in a separate `rate_limit_bucket` table or in advisory locks.
- **No "finder" table.** Finders are anonymous and ephemeral; their fingerprint is a column on `find`.
- **No "garment" table separate from `tag`.** They are 1:1 conceptually.
- **No `payment` / `subscription` tables.** Partner billing is an open question and a Phase 2 module.
- **No SKU / product table.** Partners run their own commerce; LNF only sees the code.

## 3. Data flow

Five flows: partner mints, caregiver scans, caregiver activates, finder reports, escalation, live tracking.

### 3.1 Flow 0 — Partner mints a batch

```
[Partner portal session]   OR   [Partner backend, with API key]
        │                                │
        └────────► POST /partner/batches ◄──┘
                   body: { size, label? }
                   auth: portal session  OR  Authorization: Bearer <api_key>
                                              + HMAC of body for replay protection
                          │
                          ▼
              [apps/api: POST /partner/batches]
                  1. authn → partner_id
                  2. validate (size ≤ MAX_BATCH = 100k)
                  3. INSERT tag_batch
                  4. generate `size` CSPRNG codes (base32, 22 chars,
                     uniqueness retry up to 8 attempts per code)
                  5. INSERT tag rows (state=unactivated) ×size in chunked txns
                  6. mint single-use csv_token; INSERT csv_token_hash on tag_batch
                  7. emit audit_event(partner.batch.minted)
                  8. respond 201 with: { batchId, downloadUrl, expiresAt }
                          │
                          ▼
              [Partner downloads CSV — separate request]
                   GET /partner/batches/:id/codes.csv?token=<one-shot>
                          │
                          ▼
                   server validates token (constant-time hash compare)
                   marks tag_batch.csv_downloaded_at
                   streams CSV: code (one per line, no headers)
                   emit audit_event(partner.batch.csv_downloaded)
```

CSV is single-use by default; re-issue requires operator action (audit-logged), not a partner self-serve button.

### 3.2 Flow A — Phone scans `https://lnf.app/f/<code>`

```
[Phone scans QR]
        │
        ├─ App installed (universal link / Android App Link)?
        │
        ├── yes → mobile app receives the URL
        │           │
        │           ▼
        │      app calls GET /tag/:code (caregiver-authed)
        │      response: { state, ownership ∈ {unowned, self, other} }
        │           │
        │           ┌───────────────┬──────────────┬──────────────┐
        │           ▼               ▼              ▼              ▼
        │     state=unactivated   state=active   state=active   state=revoked
        │     ownership=unowned   ownership=self ownership=other (any ownership)
        │           │               │              │              │
        │           ▼               ▼              ▼              ▼
        │     activation flow    info screen    finder flow    "tag is no
        │     (see 3.3)         (revoke /      (in-app surface  longer active"
        │                        relabel)      using finder
        │                                      web semantics)
        │
        └── no → Next.js public route /f/[code] (SSR)
                   │
              GET /api/tag/:code/public
              response: { state }   (NO ownership info to public)
                   │
              ┌────┴───────────────┬────────────────────┐
              ▼                    ▼                    ▼
            unactivated          active                revoked
              │                    │                    │
              ▼                    ▼                    ▼
        "Install the app   render finder form    "tag is no longer
         to activate"     (see 3.4)               active"
         + store links
```

`unactivated` and `revoked` paths log a lightweight `audit_event` for partner-side analytics (theft / lost-in-shipment signals) but never create finds.

### 3.3 Flow B — Caregiver activates a tag

```
[Mobile app, after scan, sees state=unactivated, ownership=unowned]
        │
        ▼
   "Activate this tag" screen:
     • pick existing protected_person   OR   create one
     • optional public note (≤200 chars)
     • garment label
     • notification channels (with verification gates for SMS/voice)
        │
        ▼
   POST /tag/:code/activate
     body: { protectedPersonId, label }
     auth: caregiver session
        │
        ▼
   Server (single transaction):
     1. SELECT tag FOR UPDATE WHERE code=:code AND state='unactivated'
     2. assert protected_person.caregiver_id == session.caregiver_id
     3. UPDATE tag SET state='active',
                       protected_person_id=:pid,
                       caregiver_id=session.caregiver_id,
                       label=:label,
                       activated_at=now()
     4. emit audit_event(tag.activated)
     5. respond { tag }
```

`SELECT … FOR UPDATE` prevents two-caregiver activation races; loser gets 409.

### 3.4 Flow C — Finder reports

```
[Finder fills form on /f/[code], submits POST /api/find]
     body: { code, locationGeo? , locationText?, message?, contact? }
     ▼
[apps/api: POST /find]
     1. validate Zod schema
     2. resolve code → tag (state must be 'active')
     3. INSERT find (status=reported)
     4. INSERT audit_event(find.created)
     5. enqueue job: escalate_find(find.id, 0)
     ▼
[Respond 200 with find_token (signed JWT, find_id-scoped, 60-min ttl)]
     ▼
[Page renders confirmation + "Share live location" opt-in]
```

Find creation and escalation enqueue are in **one Postgres transaction** (Graphile Worker is Postgres-backed). No path exists where the find is committed but the job isn't.

The `find_token` is the only credential the finder has — used to authorize live location samples for this find only.

### 3.5 Flow D — Escalation state machine

```
                    ┌─────────────────────────────────────┐
                    │  job: escalate_find(find_id, step)  │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    Re-read find. Is status still 'reported'?
                          ack'd     │     still reported
                          ┌─────────┴────────┐
                          ▼                  ▼
                    [ STOP, no-op ]    Load active channels
                                       for protected_person
                                       ordered by priority
                                            │
                                            ▼
                                  Channel at index `step` exists?
                                       │  yes              │  no
                                       ▼                   ▼
                              Spend cap OK?        status=expired
                                  │  yes  │  no    audit_event
                                  ▼       ▼        surface in app
                              dispatch    log notification_attempt
                              via         (failure_reason='spend_cap')
                              provider          │
                                  │             ▼
                                  ▼      re-enqueue at step+1, delay=0
                              insert notification_attempt(sent)
                                  │
                                  ▼
                              enqueue escalate_find(find_id, step+1)
                              with delay = channel.escalation_delay_seconds
```

Properties:
- **Idempotent:** every job invocation re-reads `find.status`; ack between steps → next job no-ops.
- **Acknowledgement is a write, not a callback:** push tap, email link, SMS link, voice keypress all hit `POST /find/:id/ack` with an HMAC signed against the specific `notification_attempt.id`.
- **Delays are per-channel and per-account:** `notification_channel.escalation_delay_seconds` on channel `N` means "wait this long *after* channel N is dispatched before invoking channel N+1." First channel always fires immediately. Default proposal (matches the requirements doc's 2 / 5 / 5 minutes): `push.delay=120` (push fires immediately, then 2 min wait for email), `email.delay=300` (5 min wait for SMS), `sms.delay=300` (5 min wait for voice), `voice.delay=0` (last channel, ignored). Operator-configurable.
- **Spend cap is checked just-in-time** at dispatch, not at schedule time.
- **No per-channel retry on provider 5xx:** worker proceeds to next step immediately. Saves money on duplicate sends.
- **Stop conditions:** `find.status` ≠ `reported`; or no more channels (→ `expired`).

### 3.6 Flow E — Live tracking

```
[Finder confirmation page]
     │ taps "Share live location"
     │ browser geolocation prompt
     ▼
[Service Worker registered]
     │ watchPosition() callback fires every ~5–15 s
     ▼
[POST /find/:id/location  with bearer find_token]
     │ body: { recordedAt, lat, lng, accuracyM }
     │ keepalive: true
     ▼
[apps/api]
     │ verify find_token, scope to find_id
     │ guard: find.status ∈ {reported, acknowledged, claimed}
     │       AND now() - cap_anchor < 60 min
     │       (cap_anchor = claimed_at if claimed_at, else reported_at)
     │ INSERT location_sample
     │ broadcast to caregiver SSE subscribers
     ▼
[Caregiver app]
     │ subscribed via SSE: GET /find/:id/stream  (caregiver-authed)
     │ receives newline-delimited JSON of new samples
     │ renders moving pin + trail on map view
```

Stop sources: finder taps Stop, caregiver marks resolved, 60-min cap (resets on `claimed`). All three close the SSE stream from the server side.

SSE chosen over WebSocket: server → client only, no protocol upgrade, plays nice with HTTP/2, trivially reverse-proxied.

EventSource auto-reconnects with `Last-Event-ID`; we replay missed samples since that ID, or send only the latest plus a "reconnected" event if the gap is > 60 s.

### 3.7 Cross-cutting: rate limits & analytics

- **Per-partner rate limits** on `POST /partner/batches`: small (e.g., 10/hour) per key. Stored in advisory locks or a small `rate_limit_bucket` table.
- **No finder-side rate limits in v1.** Deferred to Phase 2 (§6 A9).
- **Unactivated-scan analytics:** scans of `unactivated` tags log `finder_fingerprint` only (no IP), retention bounded to a short window. Surfaced to partners as a theft signal.

## 4. Error handling & edge cases

Concrete handling for failure modes. Grouped by surface.

### 4.1 Tag minting & activation

| # | Scenario | Handling |
|---|---|---|
| 1 | Code collision during mint | Unique-violation retry up to 8 times per code; on exhaustion, abort the batch with 500. Fails loudly if entropy source is broken. |
| 2 | Partner loses the CSV | Single-use download by default. Re-issue via operator action only (audit-logged). Default re-issue window: 7 days. |
| 3 | Partner CSV download URL leaks publicly | Token is single-use and 24 h-expiring. After download, token invalidated. Even leaked URL gets attacker nothing. Codes themselves are unactivated until claimed by a caregiver account. |
| 4 | Two caregivers race on the same code | `SELECT … FOR UPDATE`. Loser → 409 with clear message. |
| 5 | Caregiver scans a friend's tag | App fetches `state=active, ownership=other` → routes to finder flow. Correct behavior, no special dialog. |
| 6 | Caregiver tries to activate a `revoked` tag | 410. UI: "This tag was revoked and cannot be reactivated." Reactivation deliberately unsupported. |
| 7 | Caregiver activates against a `protected_person` belonging to a different account | 403. Endpoint asserts `protected_person.caregiver_id == session.caregiver_id`. |
| 8 | Mass scanning of unactivated codes (warehouse theft) | Per-batch counter on unactivated scans; alert operator if > 5 in 24 h on a single batch. Doesn't auto-revoke. |

### 4.2 Finder reporting

| # | Scenario | Handling |
|---|---|---|
| 9 | Finder spam-scans the same active tag | **No client rate-limiting in v1** (§6 A9). Per-tag escalation collapse window (#10) prevents N pushes. |
| 10 | Burst of distinct-fingerprint finders against the same tag | Per-`tag` global escalation collapse: when a `find` for the tag is in `reported`/`acknowledged`/`claimed` state and < 5 min old, additional submissions create new `find` rows but are flagged `is_collapsed_into = <existing find_id>` and do NOT enqueue a new escalation chain. Caregiver UI surfaces them under the open find as "3 people have reported this in the last 4 minutes". |
| 11 | Finder submits without GPS *and* without typed location | 400 server-side; client also blocks submit until at least one is filled. |
| 12 | Malicious finder reports a fake location | We trust the signal; caregiver's `false_positive` mark records the fingerprint for forensics. |
| 13 | Browser GPS returns very low accuracy | Stored as-is; UI shows accuracy radius. We do not silently discard. |
| 14 | Finder closes browser mid-submit | Single transaction; either the find exists and chain starts, or not. No half-finds. |
| 15 | `POST /find` succeeds but enqueue fails | Atomic — both writes in the same Postgres txn. Path doesn't exist. |

### 4.3 Escalation & notification

| # | Scenario | Handling |
|---|---|---|
| 16 | Caregiver acks via push while SMS is mid-send | Idempotent worker; SMS-in-flight to provider can't be cancelled but redundant SMS is acceptable. |
| 17 | Push token stale (`DeviceNotRegistered`) | Mark `device.expo_push_token` invalid; advance to next channel **with no delay**. |
| 18 | Email hard-bounces (Resend webhook) | `notification_attempt.delivery_status='failed'` updated post-hoc. Channel **not auto-disabled**; surface a warning in caregiver app instead. |
| 19 | SMS provider 5xx | Logged failed; advance immediately. No provider retry. |
| 20 | Spend cap hit mid-chain | Channel skipped, attempt logged with `failure_reason='spend_cap'`, chain proceeds without delay. |
| 21 | Voice call answered, no key pressed | TTS finishes, hangs up, `delivery_status=delivered`, no ack. Chain continues. |
| 22 | Caregiver clicks email "Acknowledge" link from desktop browser | Public route signed with HMAC over `notification_attempt.id`. Sets `find.acknowledged_at`, shows minimal "Got it" page. No deep-link required. |
| 23 | Email link forwarded / clicked twice | Idempotent (`WHERE acknowledged_at IS NULL`). Second click re-renders same confirmation. |
| 24 | Voice ack: wrong key pressed | TTS allows up to 3 attempts; on failure, call ends without ack, chain continues. |
| 25 | Twilio webhook arrives 30 min after delivery | Pure observability update. Doesn't influence escalation. |
| 26 | Two concurrent finds on same tag | Two parallel chains; caregiver may get two pushes (different finders, both worth knowing). The 5-min collapse (#10) only suppresses *additional* finds within the window, not concurrent independent ones. |
| 27 | Worker process dies mid-step | Graphile Worker holds a row-level lock; on crash, lock released after timeout, another worker picks up. Idempotency makes re-running safe. |
| 28 | Clock skew between worker and DB | Delays scheduled relative to DB time (`run_at`), not worker wall-clock. |

### 4.4 Live tracking

| # | Scenario | Handling |
|---|---|---|
| 29 | Finder loses network mid-stream | `keepalive: true` + retry-on-failure (small backoff, max 3). Failed samples dropped (no local queue). UI: "Last update 47s ago"; pin dims after 60 s threshold. |
| 30 | iOS Safari backgrounds the tab | `watchPosition` throttled / paused. UX: "Tracking paused — return to this page to resume." |
| 31 | Finder revokes browser geolocation | `watchPosition` error → UI message → `DELETE /find/:id/location` invalidates streaming side of `find_token`. |
| 32 | `find_token` expired but page still open | Each sample POST verifies; on 401/403 client stops cleanly. |
| 33 | Caregiver marks resolved while finder streaming | Server rejects next sample with 410. Client UI: "Caregiver has marked this resolved." |
| 34 | Stream cap (60 min) elapses | Server stops accepting samples; same UX as #33. |
| 35 | Finder shares but never moves | Steady pin. No special-casing. |
| 36 | Caregiver opens find before any sample | "Live location not available yet." or "Live location not shared." |
| 37 | Two finders streaming for separate finds on same tag | Each find has its own stream; caregiver sees them as separate find detail screens (Phase 2: merge on one map). |
| 38 | Caregiver SSE reconnects | EventSource auto-reconnect with `Last-Event-ID`; replay or "reconnected" event. |

### 4.5 Authentication & sessions

| # | Scenario | Handling |
|---|---|---|
| 39 | Anonymous caregiver loses phone | Data is gone. Onboarding warns: "Add an email or you'll lose access if you change phones." SMS/voice opt-in forces account creation. |
| 40 | Caregiver logs into second device | Better-Auth issues new session; new device row; both devices receive push. |
| 41 | Partner API key compromised | Operator revokes (`partner_api_key.revoked_at`). All in-flight requests rejected on next check (hash verify per request, not cached). Audit which tags minted with that key; operator decides whether to revoke whole batch. |
| 42 | Partner-portal account compromised | Standard email-reset recovery. Per-batch revocation supported. |
| 43 | Caregiver wants account deletion (LGPD subject erasure) | Soft-delete + 14-day grace; hard-delete cascades. `audit_event.caregiver_id → NULL` to keep operational history without retaining the person. |
| 44 | Caregiver requests data export (LGPD subject access) | Async job assembles JSON bundle, emails signed download link. Same single-use, expiring pattern as partner CSV. |

### 4.6 Data retention & cleanup

| # | Scenario | Handling |
|---|---|---|
| 45 | `location_sample` retention | Daily cleanup: delete where parent find terminated > 24 h ago. Operator-configurable. |
| 46 | `find` rows older than retention | **Kept indefinitely in v1** (per product decision). Caregiver-facing history is permanent until account deletion. |
| 47 | `audit_event` retention | 24 months default. Operator-configurable. |
| 48 | Stale `unactivated` tags from never-shipped batches | No auto-expiry. Operator can revoke an entire batch on partner request. |
| 49 | Cleanup job fails partway | Idempotent; next-day run resumes. Metric on rows deleted; alert on zero when expecting > 0. |

### 4.7 Things we explicitly accept

These failure modes are *not* engineered around in v1:

- Caregiver in airplane mode missing all push attempts — email/SMS/voice catch them when they reconnect.
- Finder forging a fake location — caregiver decides what to do; geofence sanity checks deferred.
- Determined attacker scraping finder pages — codes are unguessable; each scan only reveals tag state, no protected-person info.
- Partner intentionally minting and never printing — they burn their own quota; mint rate-limit prevents fan-out.
- iOS Safari geolocation throttling — documented constraint, "Tap to resume" UX. Native finder app is Phase 2 conversation.

## 5. Testing

### 5.1 Layers

**L1 — Zod schema snapshots.** `packages/schemas/__tests__/contracts.snapshot.test.ts`. Every public boundary type has its JSON-schema serialization snapshotted. Privacy boundaries (`find.public.schema.json` vs. `find.private.schema.json`) are explicit snapshots so any leak is loud in review.

**L2 — Unit tests (Vitest).** State machines (`tag.state`, `find.status`) tested directly. Notification dispatchers tested via fake providers. Escalation worker tested with a mock clock — no real waits.

Concrete cases:
- Acknowledged before step 2 → step 2 no-ops.
- All channels exhaust → `find.status='expired'`.
- Spend cap on SMS → SMS attempt logged failed, voice tried immediately.
- Push token `DeviceNotRegistered` → email tried with no delay.

**L3 — Integration tests (Vitest + testcontainers).** Real Postgres per test file, real migrations, real Drizzle, Hono test client (no HTTP).

Critical cases:
- Activation race: two concurrent `POST /tag/:code/activate` → exactly one 200, other 409, row state consistent.
- Find creation atomicity: inject queue-enqueue failure → `find` rolled back.
- Acknowledgement idempotency: same email-ack link twice → set once, second returns same response.
- Cross-account access: caregiver A requests caregiver B's find → 404 (not 403 — don't reveal existence).
- Revoked tag: `POST /find` against revoked → 410, no row, no enqueue.
- Live-sample auth: `POST /find/:id/location` with token for *different* find → 403.

**L4 — Web E2E (Playwright).** One test: full scan-to-acknowledgement happy path on the public finder page, against real backend with fake Twilio/Resend/Expo Push.

**L5 — Mobile smoke (Maestro).** Two flows: tag activation, push acknowledgement.

### 5.2 What's faked vs. real

| Layer | DB | Twilio | Resend | Expo Push | Map tiles |
|---|---|---|---|---|---|
| L1 schema | — | — | — | — | — |
| L2 unit | stub | fake | fake | fake | — |
| L3 integration | **real** | fake | fake | fake | — |
| L4 web E2E | real | fake | fake | fake | — |
| L5 mobile smoke | real (staging) | fake | fake | **fake** | real |

### 5.3 CI

- **PR pipeline (must pass, < 3 min):** typecheck, lint, schema snapshots, all unit tests, all integration tests, web E2E happy path. Mobile smoke excluded (too slow / flaky for PRs).
- **Nightly:** PR pipeline + Maestro mobile smoke against a published Expo dev client.

### 5.4 What we don't test in v1

- Load testing — not at the scale where it matters.
- Fuzz / property-based — overkill for this domain.
- Visual regression — design tokens + PR review covers it.
- Real Twilio / Resend / Expo Push integration — provider sandboxes lie about delivery; the abstraction means swapping providers is a config change.
- `audit_event` payload shapes — append-only logs; over-testing creates churn.

## 6. Phase 2 — what is NOT in v1

### 6.1 Product

| # | Item | Why deferred | Door left open |
|---|---|---|---|
| A1 | WhatsApp channel | Meta Business API onboarding scope | `notification_channel.kind` is open enum |
| A2 | In-app caregiver↔finder chat | Real-time + storage + moderation | None needed; new table when added |
| A3 | Object/asset tags | Different UX, dilutes v1 story | `tag.kind` discriminator can split person/object later |
| A4 | "Caregiver is on the way" signal to finder | Two-way comm; breaks one-way model | None — additive |
| A5 | Per-tag opt-in for richer finder info | LGPD review + UI complexity | `protected_person.public_note` exists; richer columns add cleanly |
| A6 | LNF-manufactured garments | Whole separate company motion | Partner model is the abstraction |
| A7 | Self-service partner signup | Antifraud + billing + KYC | `partner.status` enum exists |
| A8 | Partner-branded finder pages | Per-tenant theming, cache complexity | `partner.settings` jsonb reserved |
| A9 | **Finder rate-limiting** (per product decision) | Faster launch, simpler code | `finder_fingerprint` already on every find row |
| A10 | Find-history anonymization | Per product decision: keep indefinitely in v1 | LGPD subject-erasure on account deletion still hard-deletes |
| A11 | Multi-region launch | Compliance scope explodes | Codebase locale-aware; data residency is deployment concern |
| A12 | Tag transfer between caregivers | Edge case (gifting, secondhand) | Monotonic activation; transfer needs `tag.transfer_log` |
| A13 | Caregiver web app beyond "manage account" | Most caregiver actions are mobile-native | Next.js project exists; adding routes later is just files |
| A14 | Multi-stream live tracking on one map | Niche; UI complexity vs. real-world frequency | Each find has its own samples; merge is purely UI when added |
| A15 | iOS Safari geolocation throttling fix beyond "tap to resume" | True fix is a native finder app | Documented constraint |

### 6.2 Engineering / ops

| # | Item | Why deferred |
|---|---|---|
| B1 | Load testing & autoscaling | Not at the scale where this matters |
| B2 | Real-provider integration tests | Sandbox semantics ≠ production; manual QA + observability |
| B3 | Visual regression tests | Design tokens + PR review |
| B4 | Multi-region DB / read replicas | Single São Paulo region is acceptable for v1 |
| B5 | Job system swap (Redis / BullMQ) | Graphile Worker is sufficient |
| B6 | Operator UI as product | v1 operators use Postgres + scripts |

### 6.3 Compliance — handled in v1, not deferred

- LGPD-aligned consent flows.
- LGPD subject-access export (JSON, signed download URL).
- LGPD subject-erasure on account deletion (14-day grace, hard-delete cascade).
- Data residency in São Paulo.
- es / pt-BR localization at launch.

### 6.4 Forcing rule

Anything in §6 is a "no for v1" decision. Slipping an item back into v1 scope requires a one-paragraph spec delta + approval — not silent expansion mid-task.

## 7. Open questions

- **A2 — Maps provider:** Google Maps Platform (familiar, costs per map load + per direction request) vs. MapLibre + OpenStreetMap tiles (free, less polished). Decision affects cost model.
- **Partner billing model:** per-code-minted, per-activated-tag, per-find, monthly fee, hybrid? Determines whether a billing module is needed in v1 or stays Phase 2.
- **CSV download policy default:** single-use vs. N-times within a window vs. operator-anytime. Current default proposal: single-use with operator re-issue at 7 days.
- **Default daily spend cap per account:** needs country-by-country pricing table before a number is set.
- **Escalation default delays:** push fires immediately; 2 min wait → email; 5 min wait → SMS; 5 min wait → voice. Confirm or revise.
- **Acknowledgement-via-SMS UX:** link-tap (recommended) vs. reply-with-code. Reply handling adds Twilio inbound complexity.
- **Caregiver web app at launch?** v1 plan is mobile-first; may add a thin "manage account" web view if the App Store review process slows mobile launch.

## 8. References

- [Requirements (English)](../../requirements.en.md)
- [Requirements (Spanish)](../../requirements.es.md)
- [Repo README (bilingual)](../../../README.md)
- [Agent guidance (CLAUDE.md)](../../../CLAUDE.md)
