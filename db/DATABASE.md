# Database Schema

PostgreSQL (Neon). All tables live in the `public` schema.
Migration runner: `npx tsx db/migrate.ts` (tracks applied files in `schema_migrations`).

---

## Database Architecture Overview

### Challenge lifecycle data flow

```
User submits evidence (webapp API)
        │
        ▼
public.evidence          ← written by: POST /api/aivm/intake, evidenceCollector worker
        │
        ▼ evidenceEvaluator worker
public.verdicts          ← written by: evidenceEvaluator worker
        │
        ▼ challengeDispatcher (gates on approved + verdict)
public.aivm_jobs         ← written by: challengeDispatcher, challengeWorker, aivmIndexer
        │
        ▼ challengeWorker → requestInferenceV2 on-chain
        │   [Lightchain network: commit → reveal → attest]
        ▼ aivmIndexer → submitProofFor + ChallengePay.finalize()
public.challenges        ← written by: lightchain indexer (status updates)
        │
        ▼ participant claims reward on-chain
public.claims            ← written by: POST /api/me/claims (UI path), claimsIndexer (indexer path)
```

### Write sources per table

| Table | Written by |
|---|---|
| `challenges` | `statusIndexer` (status sync from ChallengePay events), `aivmIndexer` (finalization bridge), webapp API (create) |
| `participants` | `POST /api/challenge/[id]/participant`, `POST /api/aivm/intake` |
| `evidence` | `POST /api/aivm/intake`, `evidenceCollector` worker |
| `verdicts` | `evidenceEvaluator` worker |
| `aivm_jobs` | `challengeDispatcher` (insert), `challengeWorker` (status), `aivmIndexer` (status) |
| `claims` | `POST /api/me/claims` (UI, source=`ui`), `claimsIndexer` (source=`indexer`) |
| `models` | `PUT /api/admin/models` |
| `challenge_templates` | `PUT /api/admin/templates` |
| `linked_accounts` | `POST /api/accounts/link`, OAuth callback routes |
| `identity_bindings` | `POST /api/auth/steam/return`, `offchain/identity/registry.ts` |
| `indexer_state` | `aivmIndexer`, `claimsIndexer` (checkpoint writes) |
| `reminders` | `POST /api/reminders` |
| `challenge_invites` | `POST /api/invites` (wallet invites processed inline; email/steam queued for background worker) |
| `notifications` | `POST /api/invites` (inline for wallet invites), `POST /api/v1/notifications`, offchain alert workers |
| `openid_nonces` | `GET /api/auth/steam` |
| `user_profiles` | `GET/PUT /api/me/profile` |
| `competitions` | `POST /api/competitions` |
| `competition_registrations` | `POST /api/competitions/[id]/register` |
| `organizations` | `POST /api/org/new` |
| `org_members` | `POST /api/org/[slug]/members` |
| `seasons` | Competition admin API |
| `season_competitions` | Competition admin API |
| `season_standings` | Competition scoring worker |
| `teams` | Organization admin API |
| `team_roster` | Organization admin API |
| `bracket_matches` | Competition bracket engine |
| `match_disputes` | `POST /api/competitions/[id]/disputes` |
| `api_keys` | Organization admin API |
| `webhooks` | Organization admin API |
| `webhook_deliveries` | Webhook delivery worker |
| `whitelabel_configs` | Organization admin API |

### Table relationships

```
challenges (1) ──── (N) participants
challenges (1) ──── (N) evidence
challenges (1) ──── (1) aivm_jobs
challenges (1) ──── (N) verdicts
challenges (1) ──── (N) claims
challenges (1) ──── (N) reminders
challenges (1) ──── (N) challenge_invites

participants (challenge_id + subject) ← joined by evidence, verdicts, claims

linked_accounts ── feeds ──► evidenceCollector ──► evidence
identity_bindings ── used by ──► OpenDota / Riot adapters
models ── referenced by ──► challenge_templates, challenge proof params

notifications ── keyed by wallet ── displayed in webapp NotificationBell + iOS Activity

organizations (1) ──── (N) org_members
organizations (1) ──── (N) competitions
organizations (1) ──── (N) teams
organizations (1) ──── (N) api_keys
organizations (1) ──── (N) webhooks
organizations (1) ──── (1) whitelabel_configs
organizations (1) ──── (N) seasons

competitions (1) ──── (N) competition_registrations
competitions (1) ──── (N) bracket_matches
competitions (1) ──── (N) match_disputes

seasons (1) ──── (N) season_competitions
seasons (1) ──── (N) season_standings

teams (1) ──── (N) team_roster
```

---

## Tables overview

### Core challenge tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| [`evidence`](#evidence) | 001 | Raw evidence records submitted for a (challenge, subject) pair |
| [`verdicts`](#verdicts) | 001, 018 | Evaluation outcomes — one per (challenge, subject), upserted. 018 adds `score`, `metadata` |
| [`identity_bindings`](#identity_bindings) | 002 | Wallet ↔ platform account mappings (Steam, Riot, Epic) |
| [`openid_nonces`](#openid_nonces) | 002 | Short-lived nonces for OpenID Connect replay protection |
| [`participants`](#participants) | 003, 014 | Off-chain cache of challenge join records (014 adds `source` column) |
| [`linked_accounts`](#linked_accounts) | 004 | OAuth tokens and external IDs for provider integrations |
| [`challenge_templates`](#challenge_templates) | 005, 031 | Admin-managed challenge templates. 031 renames kind `steps` → `walking` |
| [`challenge_invites`](#challenge_invites) | 006, 029, 030 | Challenge invites with inviter tracking and accept lifecycle |
| [`models`](#models) | 007 | AIVM model registry (migrated from models.json) |
| [`challenges`](#challenges) | 008, 013, 015 | Indexed on-chain challenge state |
| [`aivm_jobs`](#aivm_jobs) | 009 | AIVM job queue (managed by lightchain dispatcher/worker) |
| [`indexer_state`](#indexer_state) | 010 | Key/value checkpoint state for indexer workers |
| [`reminders`](#reminders) | 011 | Email reminder subscriptions for challenge deadlines |
| [`claims`](#claims) | 012 | Persisted on-chain claim events (rewards claimed by participants) |
| [`achievement_mints`](#achievement_mints) | 016 | Soulbound achievement token mints indexed from on-chain events |
| [`reputation`](#reputation) | 016 | Computed reputation scores and levels per wallet |

### Notifications and user tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| [`notifications`](#notifications) | 021 | In-app notifications (invite received, claim available, alerts) |
| [`user_profiles`](#user_profiles) | 022 | Display name, bio, and avatar per wallet |

### Competition platform tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| [`competitions`](#competitions) | 017 | Competitions (challenge bundles, brackets, leaderboards) |
| [`competition_registrations`](#competition_registrations) | 017 | Per-wallet or per-team registration for competitions |
| [`organizations`](#organizations) | 017 | Organizations that own competitions and teams |
| [`org_members`](#org_members) | 017 | Organization membership (owner, admin, member roles) |
| [`seasons`](#seasons) | 017 | Seasons that group competitions for standings |
| [`season_competitions`](#season_competitions) | 017 | Junction: season ↔ competition with weight |
| [`season_standings`](#season_standings) | 017 | Aggregated standings per wallet per season |
| [`teams`](#teams) | 017 | Teams within organizations |
| [`team_roster`](#team_roster) | 017 | Team membership (captain, player roles) |
| [`bracket_matches`](#bracket_matches) | 017 | Bracket/tournament match records |
| [`match_disputes`](#match_disputes) | 021 | Dispute filings for bracket matches |

### API and integration tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| [`api_keys`](#api_keys) | 017 | Scoped API keys for organizations |
| [`webhooks`](#webhooks) | 017 | Webhook endpoint registrations per organization |
| [`webhook_deliveries`](#webhook_deliveries) | 017 | Webhook delivery attempts and retry tracking |
| [`whitelabel_configs`](#whitelabel_configs) | 017 | Per-org white-label branding (domain, colors, logo) |

---

## evidence

Stores normalized evidence records submitted for a `(challenge_id, subject)` pair.
One row is inserted per ingestion event; multiple rows per challenge are allowed —
the most recent row is used for evaluation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | Auto-increment |
| `challenge_id` | `bigint` NOT NULL | References `challenges.id` (no FK constraint) |
| `subject` | `text` NOT NULL | Lowercase `0x` wallet address of the participant |
| `provider` | `text` NOT NULL | Source: `apple` \| `garmin` \| `strava` \| `opendota` \| `riot` \| `steam` \| `manual` |
| `data` | `jsonb` NOT NULL | Array of canonical activity / game records |
| `evidence_hash` | `text` NOT NULL | Deterministic hash of `data` (caller-computed, used for dedup) |
| `raw_ref` | `text` | Optional reference to raw source (S3 key, upload path, etc.) |
| `created_at` | `timestamptz` NOT NULL | Insert time |
| `updated_at` | `timestamptz` NOT NULL | Last update time |

**Indexes:** `(challenge_id)`, `(challenge_id, lower(subject))`

**Key behaviours:**
- The evaluator worker reads the latest row per `(challenge_id, lower(subject), provider)`.
- The evidence collector worker skips insertion when `evidence_hash` matches the previous row (no new data).
- `challenge_id = 0` is used for preview/test submissions that are not linked to a live challenge.

---

## verdicts

Stores the result of evaluating evidence for a `(challenge_id, subject)` pair.
One verdict per pair — subsequent evaluations `UPSERT` the existing row.

**Authoritative for:** verdict/pass status. Written by `offchain/workers/evidenceEvaluator.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | Auto-increment |
| `challenge_id` | `bigint` NOT NULL | |
| `subject` | `text` NOT NULL | Lowercase `0x` wallet address |
| `pass` | `boolean` NOT NULL | Whether the subject satisfied the challenge rules |
| `reasons` | `text[]` NOT NULL | Human-readable failure reasons (empty array on pass) |
| `evidence_hash` | `text` NOT NULL | Hash of the evidence that produced this verdict |
| `evaluator` | `text` NOT NULL | Which evaluator ran: `fitness`, `gaming`, `passthrough`, etc. |
| `score` | `numeric` | Competitive score for ranked challenges (NULL for pass/fail only) |
| `metadata` | `jsonb` | Extra evaluator output (breakdown, daily totals, etc.) |
| `created_at` | `timestamptz` NOT NULL | First evaluation time |
| `updated_at` | `timestamptz` NOT NULL | Last re-evaluation time |

**Unique constraint:** `(challenge_id, subject)` — one verdict per participant per challenge.

**Indexes:** `(challenge_id)`

**Used by:** `/api/challenges/[id]/progress`, `/api/challenges/[id]/claim`, evidence evaluator worker.

---

## identity_bindings

Maps a wallet address to a platform account (Steam, Riot, Epic Games).
Used to verify gaming identity in the challenge flow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `wallet` | `text` NOT NULL | Lowercase `0x` address |
| `platform` | `text` NOT NULL | `steam` \| `riot` \| `epic` |
| `platform_id` | `text` NOT NULL | Platform-specific user ID (Steam64, PUUID, etc.) |
| `handle` | `text` | Display name / username (optional) |
| `signed_by` | `text` | Operator address that countersigned the binding |
| `signature` | `text` | EIP-191 `personal_sign` of the binding JSON |
| `ts` | `bigint` NOT NULL | Unix milliseconds at time of binding |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**Unique constraint:** `(wallet, platform)` — one platform account per wallet.

**Indexes:** `(wallet)`, `(platform, platform_id)`

---

## openid_nonces

Short-lived nonces for OpenID Connect / OAuth state replay protection.
Replaces the previous file-based `openid_nonce.json` store.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `nonce` | `text` NOT NULL UNIQUE | Random nonce string |
| `expires_at` | `timestamptz` NOT NULL | After this time the nonce is invalid |
| `created_at` | `timestamptz` NOT NULL | |

**Indexes:** `(expires_at)` — supports periodic cleanup of expired rows.

---

## participants

Off-chain cache of challenge join records. Populated when a user calls
`POST /api/challenge/[id]/participant` after a successful on-chain `joinChallenge`
transaction, and also upserted automatically when evidence is submitted for a
non-zero `challenge_id`.

The on-chain `Joined` events remain the authoritative record;
this table is a fast queryable cache used by the "My Challenges" page and status APIs.

### Participant row sources

A participant row may be created by two paths:

| Path | `tx_hash` | `joined_at` | Notes |
|---|---|---|---|
| `POST /api/challenge/[id]/participant` | set | set | Called by frontend after on-chain `joinChallenge` tx |
| `POST /api/aivm/intake` (evidence upload) | null | null | Evidence submitted without explicit on-chain join |

**Policy:** Both paths produce valid participant rows. Evidence-intake participants have `joined_at = null`.
This is acceptable — it means the user submitted evidence but may not have staked on-chain via `joinChallenge`.

**Reward integrity is NOT compromised** by evidence-intake participants because:
- All reward/claim eligibility is determined by on-chain simulation (`claimEligible`), not by this table
- `chain_outcome` from `challenges.chain_outcome` is the authoritative final outcome
- If there is no on-chain stake, `claimEligible = false` and no payout is offered

**Lifecycle impact:** Evidence-intake participants appear in "My Challenges" so users can track their submission status.
This is intentional — a user who uploaded garmin data without a formal join tx should still see their evidence status.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `challenge_id` | `bigint` NOT NULL | |
| `subject` | `text` NOT NULL | Lowercase `0x` wallet address |
| `tx_hash` | `text` | On-chain join tx hash — NULL for evidence-intake participants |
| `joined_at` | `timestamptz` | Timestamp of on-chain join — NULL for evidence-intake participants |
| `source` | `text` NOT NULL DEFAULT `'unknown'` | Provenance: `onchain_join` \| `evidence_intake` \| `unknown` |
| `created_at` | `timestamptz` NOT NULL | Row creation time |
| `updated_at` | `timestamptz` NOT NULL | Last upsert time |

**Unique index:** `(challenge_id, lower(subject))` — one row per participant per challenge.

**Indexes:** `(lower(subject))`, `(challenge_id)`

**Used by:** `GET /api/me/challenges`, `GET /api/challenge/[id]/participant`, evidence collector worker.

---

## linked_accounts

Stores OAuth tokens and external IDs for provider accounts connected to a wallet.
Used by the evidence collector worker (`offchain/workers/evidenceCollector.ts`) to
pull live activity/match data from provider APIs on a polling schedule.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `subject` | `text` NOT NULL | Lowercase `0x` wallet address |
| `provider` | `text` NOT NULL | `strava` \| `opendota` \| `riot` \| `apple` |
| `external_id` | `text` | Provider user/athlete ID (required for opendota/riot; optional for strava) |
| `access_token` | `text` | OAuth access token (Strava, Riot) — store encrypted in production |
| `refresh_token` | `text` | OAuth refresh token (Strava) — store encrypted in production |
| `token_expires_at` | `timestamptz` | Token expiry; `NULL` = no expiry or unknown |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | Updated on token refresh |

**Unique index:** `(lower(subject), provider)` — one linked account per provider per wallet.

**Indexes:** `(lower(subject))`, `(provider)`

**API:** `GET/POST/DELETE /api/accounts/link`

**Security note:** `access_token` and `refresh_token` are stored in plaintext.
Use database-level encryption or a secrets vault in production.

---

## challenge_templates

Admin-managed challenge templates. The runtime code-side templates in
`webapp/lib/templates.ts` remain authoritative for the challenge-creation flow
(they carry `paramsBuilder` and `ruleBuilder` functions which cannot be serialised).

This table allows admins to add, edit, or disable templates without a code deploy.
It is the backend for `GET /api/admin/templates` and `PUT /api/admin/templates`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | Matches the code-side template `id`, e.g. `running_window` |
| `name` | `text` NOT NULL | Display name shown in the create UI |
| `hint` | `text` | Short description shown below the name |
| `kind` | `text` NOT NULL | `walking` \| `running` \| `cycling` \| `hiking` \| `swimming` \| `strength` \| `yoga` \| `hiit` \| `rowing` \| `calories` \| `exercise` \| `dota` \| `lol` \| `cs` |
| `model_id` | `text` NOT NULL | AIVM model identifier, e.g. `strava.distance_in_window@1` |
| `fields_json` | `jsonb` NOT NULL | Array of `TemplateField` descriptors (serialisable subset — no function values) |
| `rule_config` | `jsonb` | Canonical `Rule` or `GamingRule` object embedded in `proof.params.rule` |
| `active` | `boolean` NOT NULL DEFAULT `true` | `false` = soft-deleted / hidden from create UI |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**Indexes:** `(kind)`, `(active)`

**Merge behaviour:** At runtime, `templateRegistry.ts` merges DB rows with code-side templates.
The DB row's `name`, `hint`, and `fields_json` override the code-side values;
`paramsBuilder` and `ruleBuilder` always come from code.

**Migration 031:** Renamed kind `steps` → `walking` to unify step-counting and walking-distance challenges under one kind.

---

## challenge_invites

Invites for challenges. Created by `POST /api/invites` and listed by `GET /api/invites`.

**Wallet invites** are processed inline: the API creates a notification for the target wallet
and marks the invite as `sent` immediately. **Email and Steam invites** are queued for a
background worker (`status = 'queued'`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | UUID generated by the API handler |
| `challenge_id` | `bigint` NOT NULL | Target challenge |
| `method` | `text` NOT NULL | `email` \| `wallet` \| `steam` |
| `value` | `text` NOT NULL | Email address, `0x` wallet, or Steam64 ID |
| `status` | `text` NOT NULL DEFAULT `queued` | `queued` → `sent` → `accepted` \| `failed` |
| `inviter_wallet` | `text` | Lowercase `0x` wallet of the user who sent the invite |
| `accepted_by_wallet` | `text` | Lowercase `0x` wallet that accepted the invite (set on accept) |
| `joined_at` | `timestamptz` | Timestamp when the invitee joined the challenge |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**Indexes:** `(challenge_id)`, `(status)`

**Lifecycle:**
```
queued ──► sent ──► accepted (invitee joined challenge)
                └─► failed   (delivery failed or expired)
```

For wallet invites, `queued` → `sent` happens inline in the POST handler.
For email/steam, a background worker polls `queued` rows.

**Accept flow:** `POST /api/invites/[id]/accept` sets `status = 'accepted'`, `accepted_by_wallet`, `joined_at`.

---

## models

AIVM model registry. Migrated from `webapp/public/models/models.json` (migration 007).
Read by `offchain/db/models.ts` and served via `GET /api/admin/models`.

The `webapp/public/models/models.json` file is archived — its content reads:
`"_archived": "Migrated to public.models DB table (migration 007_models.sql)"`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | Model identifier, e.g. `strava.distance_in_window@1` |
| `label` | `text` NOT NULL | Human-readable name |
| `kind` | `text` NOT NULL | Active: `aivm` \| `custom`. Legacy (backward compat only): `zk` \| `plonk` |
| `model_hash` | `text` NOT NULL | On-chain model hash (`bytes32`) |
| `verifier` | `text` NOT NULL | Verifier contract address (AIVM PoI verifier for active models) |
| `plonk_verifier` | `text` | **Legacy** — not used by active product flows. Retained for backward compatibility with existing data. |
| `binding` | `boolean` NOT NULL | Whether this model requires a task binding |
| `signals` | `jsonb` NOT NULL | AIVM signal schema |
| `params_schema` | `jsonb` NOT NULL | JSON schema for proof params validation |
| `sources` | `jsonb` NOT NULL | Accepted evidence source providers |
| `file_accept` | `jsonb` NOT NULL | Accepted file MIME types for evidence upload |
| `notes` | `text` | Free-text notes for admin UI |
| `active` | `boolean` NOT NULL DEFAULT `true` | `false` = hidden from model picker |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**Indexes:** `(kind)`, `(active)`

**API:** `GET /api/admin/models`, `PUT /api/admin/models`

**Legacy compatibility:** The seed data (migration 007) includes one legacy ZK model
(`strava.distance_in_window@1` with `kind='zk'`). This is retained for backward
compatibility only. The `plonk_verifier` column is a legacy field with no active readers.
New models should use `kind='aivm'` or `kind='custom'`.

---

## challenges

Indexed on-chain challenge state. Written by the lightchain indexer as `ChallengePay`
events are observed on-chain. Read by evaluators, APIs, and the evidence collector.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` PK | On-chain challenge ID |
| `title` | `text` | Challenge title |
| `description` | `text` | Challenge description |
| `subject` | `text` | Lowercase `0x` wallet of the challenge creator / subject |
| `tx_hash` | `text` | Creation transaction hash |
| `model_id` | `text` | AIVM model identifier |
| `model_hash` | `text` | On-chain model hash (`bytes32`) |
| `params` | `jsonb` | Legacy / top-level rule fallback |
| `proof` | `jsonb` | Full proof config — `proof.params.rule` contains the evaluator `Rule` |
| `timeline` | `jsonb` | `{start, end}` Unix timestamps |
| `funds` | `jsonb` | Stake and reward amounts |
| `options` | `jsonb` | Miscellaneous challenge options |
| `status` | `text` | `pending` \| `approved` \| `finalized` \| `canceled` \| `rejected` — written by `statusIndexer` |
| `chain_outcome` | `smallint` | `0`=None, `1`=Success, `2`=Fail — from `Finalized` event. NULL until finalized. **AUTHORITATIVE for reward eligibility.** |
| `registry_status` | `text` DEFAULT `'pending'` | MetadataRegistry sync status |
| `registry_tx_hash` | `text` | MetadataRegistry transaction hash |
| `registry_error` | `text` | MetadataRegistry error message |
| `aivm_request_started` | `boolean` | **Deprecated** — superseded by `aivm_jobs.status`; will be dropped |
| `aivm_request_started_at` | `timestamptz` | **Deprecated** — superseded by `aivm_jobs.status`; will be dropped |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Indexes:** `(status)`, `(created_at)`, `(status, created_at)`, and several on `proof` jsonb fields.

**Authoritative source:** on-chain events via `statusIndexer`. Do not write directly.

**Source-of-truth rules for finalized challenges:**
1. `chain_outcome = 2` (Fail) → no reward regardless of DB `verdict_pass`
2. `chain_outcome = 1` (Success) + `verdict_pass = true` + `claimEligible = true` (on-chain simulation) → reward claimable
3. `chain_outcome = null` → outcome not yet indexed; fall back to `verdict_pass` + `claimEligible`

---

## aivm_jobs

AIVM job queue. One row per challenge; the status machine drives the evaluation pipeline.
Managed by `offchain/dispatchers/challengeDispatcher.ts` and `offchain/workers/challengeWorker.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `challenge_id` | `bigint` NOT NULL UNIQUE | References `challenges.id` |
| `status` | `text` NOT NULL | See status flow below |
| `attempts` | `int` NOT NULL | Retry counter |
| `last_error` | `text` | Last error message (for `failed` rows) |
| `worker_address` | `text` | Wallet address of the worker that processed the job |
| `task_id` | `text` | AIVM task identifier (set after `requestInferenceV2`) |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**Unique constraint:** `(challenge_id)` — one job per challenge.

**Indexes:** `(status, created_at)` (for worker polling), `(task_id)` (for indexer lookup)

**Job status flow:**
```
queued → processing → submitted → committed → revealed → done
                    ↘ failed (on error, retried up to max_attempts)
                    ↘ dead   (exhausted max_attempts — terminal, no more retries)
                    ↘ canceled (challenge became Finalized/Rejected/Canceled before submission)
skipped             (challenge was already finalized when worker ran — no-op)
```

**Terminal states:** `done`, `dead`, `canceled`, `skipped` — worker will never pick these up again.

**`canceled` policy:** The `challengeDispatcher` runs `cancelTerminalJobs()` each poll cycle,
setting any `queued`/`failed`/`processing` job to `canceled` when its challenge has reached a
terminal on-chain status. The `challengeWorker` also guards against this at claim time via a
JOIN filter. Run `scripts/ops/cancelTerminalJobs.ts` to fix any pre-existing stale rows.

Worker does **not** call `markJobDone` on success — the `aivmIndexer` transitions to `done`
when it observes an `InferenceFinalized` event for the matching `task_id`.

---

## indexer_state

Key/value checkpoint store for indexer workers. Each indexer stores its last-processed
block number here so it can resume after restart without re-scanning from genesis.

| Column | Type | Notes |
|--------|------|-------|
| `key` | `text` PK | Indexer identifier, e.g. `last_aivm_block`, `last_claims_block` |
| `value` | `text` | Serialised state value (block number as decimal string) |

**Known keys:**
- `last_aivm_block` — used by `offchain/indexers/aivmIndexer.ts`
- `last_claims_block` — used by `offchain/indexers/claimsIndexer.ts`

---

## reminders

Email reminder subscriptions for challenge proof deadlines.
Created when a user opts in on the challenge page.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `email` | `text` NOT NULL | Recipient email address |
| `challenge_id` | `bigint` NOT NULL | FK → `challenges.id` |
| `type` | `text` NOT NULL | Reminder type: `proof_deadline` \| `finalization` |
| `sent` | `boolean` NOT NULL DEFAULT `false` | Whether the reminder has been sent |
| `created_at` | `timestamptz` NOT NULL | |
| `sent_at` | `timestamptz` | Timestamp when the reminder was sent |

**Unique constraint:** `(email, challenge_id, type)` — no duplicate reminders.

**Indexes:** `(sent, created_at)` for pending-reminder worker queries.

**FK:** `challenge_id` → `public.challenges(id)`

---

## claims

Persists on-chain claim events for challenge participants. One row per
`(challenge_id, subject, claim_type)` — upserted on conflict so both write
paths are idempotent and the same claim is never recorded twice.

**Write paths:**
1. **UI path (primary):** After the user's wallet submits a `claimETH` /
   `claimPrincipal` / etc. transaction successfully, the frontend POSTs to
   `POST /api/me/claims` with `source='ui'`.
2. **Indexer path (secondary/hardening):** `offchain/indexers/claimsIndexer.ts`
   watches ChallengePay `*Claimed` events and Treasury `ClaimedETH` events,
   upserting with `source='indexer'`. The indexer is the authoritative source
   of truth — if `source='indexer'`, UI writes do not downgrade it.

**Authoritative for:** `CLAIMED` lifecycle state. `resolveLifecycle()` reads
`hasClaim` (derived from this table) and treats it as the highest-priority
signal for the `CLAIMED` stage.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | Auto-increment |
| `challenge_id` | `bigint` NOT NULL | On-chain challenge ID |
| `subject` | `text` NOT NULL | Lowercase `0x` wallet address of the claimant |
| `claim_type` | `text` NOT NULL | `principal` \| `cashback` \| `validator_reward` \| `validator_reject` \| `reject_creator` \| `reject_contribution` \| `treasury_eth` |
| `amount_wei` | `numeric(78,0)` NOT NULL | Claim amount in wei (0 = unknown at write time) |
| `bucket_id` | `bigint` | Treasury bucket ID (= `challenge_id` for most claims) |
| `tx_hash` | `text` | On-chain transaction hash (null if not yet known) |
| `block_number` | `bigint` | Block where the claim tx was mined |
| `source` | `text` NOT NULL | `ui` or `indexer`; indexer takes precedence on conflict |
| `metadata` | `jsonb` | Optional extra data (gas, raw event args, etc.) |
| `claimed_at` | `timestamptz` NOT NULL | Timestamp of the claim (defaults to `now()`) |
| `created_at` | `timestamptz` NOT NULL | Row creation time |
| `updated_at` | `timestamptz` NOT NULL | Last upsert time |

**Indexes:**

| Index name | Definition | Notes |
|---|---|---|
| `claims_pkey` | `UNIQUE (id)` | Primary key |
| `claims_challenge_subject_type_uq` | `UNIQUE (challenge_id, lower(subject), claim_type)` | Prevents duplicate claims; conflict target for upserts |
| `claims_subject_idx` | `(lower(subject))` | Fast lookup for "my claims" page |
| `claims_challenge_id_idx` | `(challenge_id)` | Fast lookup for challenge-level claim queries |
| `claims_tx_hash_idx` | `(tx_hash) WHERE tx_hash IS NOT NULL` | Indexer dedup by transaction hash |

**API:** `GET /api/me/claims?subject=0x...`, `POST /api/me/claims`

**Claim types ↔ ChallengePay events:**

| `claim_type` | Contract event |
|---|---|
| `principal` | `PrincipalClaimed(id, user, amount)` |
| `cashback` | `CashbackClaimed(id, user, amount)` |
| `validator_reward` | `ValidatorClaimed(id, validator, amount)` |
| `validator_reject` | `ValidatorRejectClaimed(id, validator, amount)` |
| `reject_creator` | `RejectCreatorClaimed(id, creator, amount)` |
| `reject_contribution` | `RejectContributionClaimed(id, user, amount)` |
| `treasury_eth` | `ClaimedETH(bucketId, to, amount)` (Treasury contract) |

---

## achievement_mints

Indexes soulbound achievement token mints from `ChallengeAchievement` on-chain events.
Two achievement types: **completion** (any finalized participant) and **victory** (winners only).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | Auto-increment |
| `token_id` | `bigint` NOT NULL UNIQUE | On-chain ERC-721 token ID |
| `challenge_id` | `bigint` NOT NULL | The challenge this achievement is for |
| `recipient` | `text` NOT NULL | Lowercase `0x` wallet address of the recipient |
| `achievement_type` | `text` NOT NULL | `completion` \| `victory` — enforced by CHECK constraint |
| `tx_hash` | `text` | Mint transaction hash |
| `block_number` | `bigint` | Block where the mint occurred |
| `minted_at` | `timestamptz` NOT NULL | Timestamp of the mint (defaults to `now()`) |
| `created_at` | `timestamptz` NOT NULL | Row creation time |

**Indexes:** `(lower(recipient))`, `(challenge_id)`

**Used by:** `GET /api/me/achievements`, reputation engine.

---

## reputation

Computed reputation scores per wallet, derived from achievement mints. Updated off-chain
after each achievement mint. Drives the level system shown in the user profile.

**Level thresholds:** 1=Newcomer, 2=Challenger, 3=Competitor, 4=Champion, 5=Legend (point-based).

| Column | Type | Notes |
|--------|------|-------|
| `subject` | `text` PK | Lowercase `0x` wallet address |
| `points` | `integer` NOT NULL DEFAULT 0 | Total reputation points |
| `level` | `integer` NOT NULL DEFAULT 1 | Current level (1-5) |
| `completions` | `integer` NOT NULL DEFAULT 0 | Number of completion achievements |
| `victories` | `integer` NOT NULL DEFAULT 0 | Number of victory achievements |
| `updated_at` | `timestamptz` NOT NULL | Last recomputation time |

**Used by:** `GET /api/me/reputation`, achievements page.

---

## notifications

In-app notifications delivered to a wallet. Displayed in the webapp notification bell
and the iOS Activity inbox. Created by invite handlers, alert workers, and the notification API.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `wallet` | `text` NOT NULL | Lowercase `0x` wallet of the recipient |
| `type` | `text` NOT NULL | e.g. `invite_received`, `claim_available`, `claim_reminder`, `proof_window_open`, `challenge_final_push` |
| `title` | `text` NOT NULL | Notification title |
| `body` | `text` | Notification body text |
| `data` | `jsonb` NOT NULL DEFAULT `'{}'` | Structured payload: `{ challengeId, inviteId, deepLink }` |
| `read` | `boolean` NOT NULL DEFAULT `false` | Whether the user has marked this as read |
| `created_at` | `timestamptz` NOT NULL | |

**Indexes:** `(lower(wallet), created_at DESC)`, `(lower(wallet), read)`

**API:** `GET /api/v1/notifications?wallet=`, `POST /api/v1/notifications/mark-read`

---

## user_profiles

Display name, bio, and avatar for each wallet. One row per wallet.

| Column | Type | Notes |
|--------|------|-------|
| `wallet` | `text` PK | Lowercase `0x` wallet address |
| `display_name` | `text` | User-chosen display name |
| `bio` | `text` | Short bio |
| `avatar` | `bytea` | Avatar image binary data |
| `avatar_mime` | `text` DEFAULT `'image/jpeg'` | MIME type of avatar |
| `avatar_hash` | `text` | Content hash for cache busting |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**API:** `GET/PUT /api/me/profile`, `GET /api/player/[wallet]`

---

## competitions

Competitions bundle multiple challenges or bracket matches under one umbrella.
Owned by an organization.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `org_id` | `uuid` | FK → `organizations.id` |
| `title` | `text` NOT NULL | Competition title |
| `description` | `text` | Description |
| `type` | `text` NOT NULL DEFAULT `'challenge'` | `challenge` \| `bracket` \| `leaderboard` |
| `status` | `text` NOT NULL DEFAULT `'draft'` | `draft` \| `open` \| `active` \| `completed` \| `canceled` |
| `category` | `text` | Category label (fitness, gaming, etc.) |
| `rules` | `jsonb` NOT NULL DEFAULT `'{}'` | Competition-specific rules |
| `prize_config` | `jsonb` NOT NULL DEFAULT `'{}'` | Prize structure and distribution |
| `settings` | `jsonb` NOT NULL DEFAULT `'{}'` | Misc settings (max teams, format, etc.) |
| `challenge_ids` | `bigint[]` NOT NULL DEFAULT `'{}'` | On-chain challenge IDs included in this competition |
| `registration_opens_at` | `timestamptz` | |
| `registration_closes_at` | `timestamptz` | |
| `starts_at` | `timestamptz` | |
| `ends_at` | `timestamptz` | |
| `created_by` | `text` | Wallet that created the competition |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**API:** `GET/POST /api/competitions`, `GET /api/competitions/[id]`

---

## competition_registrations

Per-wallet or per-team registration for a competition.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `competition_id` | `uuid` NOT NULL | FK → `competitions.id` |
| `wallet` | `text` | Registered wallet (NULL for team-only registrations) |
| `team_id` | `uuid` | FK → `teams.id` (NULL for individual registrations) |
| `seed` | `integer` | Seeding position for bracket tournaments |
| `checked_in` | `boolean` NOT NULL DEFAULT `false` | Whether the participant has checked in |
| `registered_at` | `timestamptz` NOT NULL | |

---

## organizations

Organizations own competitions, teams, API keys, and webhooks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `name` | `text` NOT NULL | Organization name |
| `slug` | `text` NOT NULL UNIQUE | URL-safe slug |
| `logo_url` | `text` | Logo URL |
| `website` | `text` | Website URL |
| `description` | `text` | |
| `owner_wallet` | `text` NOT NULL | Lowercase `0x` wallet of the owner |
| `theme` | `jsonb` NOT NULL DEFAULT `'{}'` | Theme customization |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

**API:** `GET/POST /api/org`, `GET /api/org/[slug]`

---

## org_members

Organization membership. Roles: `owner`, `admin`, `member`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `organizations.id` |
| `wallet` | `text` NOT NULL | Member wallet |
| `role` | `text` NOT NULL DEFAULT `'member'` | `owner` \| `admin` \| `member` |
| `email` | `text` | Optional contact email |
| `joined_at` | `timestamptz` NOT NULL | |

---

## seasons

Seasons group competitions for aggregated standings and leaderboards.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` | FK → `organizations.id` |
| `name` | `text` NOT NULL | Season name |
| `description` | `text` | |
| `status` | `text` NOT NULL DEFAULT `'active'` | `active` \| `completed` |
| `scoring_config` | `jsonb` NOT NULL DEFAULT `'{"win":3,"draw":1,"loss":0}'` | Points per outcome |
| `starts_at` | `timestamptz` | |
| `ends_at` | `timestamptz` | |
| `created_at` | `timestamptz` NOT NULL | |

---

## season_competitions

Junction table linking seasons to competitions with a weight multiplier.

| Column | Type | Notes |
|--------|------|-------|
| `season_id` | `uuid` NOT NULL | FK → `seasons.id` |
| `competition_id` | `uuid` NOT NULL | FK → `competitions.id` |
| `weight` | `float` NOT NULL DEFAULT `1.0` | Score multiplier for this competition within the season |

**PK:** `(season_id, competition_id)`

---

## season_standings

Aggregated standings per wallet per season. Updated by the competition scoring worker.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `season_id` | `uuid` NOT NULL | FK → `seasons.id` |
| `wallet` | `text` NOT NULL | |
| `points` | `integer` NOT NULL DEFAULT 0 | Total season points |
| `wins` | `integer` NOT NULL DEFAULT 0 | |
| `losses` | `integer` NOT NULL DEFAULT 0 | |
| `draws` | `integer` NOT NULL DEFAULT 0 | |
| `competitions_entered` | `integer` NOT NULL DEFAULT 0 | |
| `updated_at` | `timestamptz` NOT NULL | |

**Unique:** `(season_id, wallet)`

---

## teams

Teams within organizations, used for team-based competitions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `organizations.id` |
| `name` | `text` NOT NULL | Team name |
| `tag` | `text` | Short tag / abbreviation |
| `logo_url` | `text` | |
| `created_at` | `timestamptz` NOT NULL | |

---

## team_roster

Team membership. Roles: `captain`, `player`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `team_id` | `uuid` NOT NULL | FK → `teams.id` |
| `wallet` | `text` NOT NULL | Player wallet |
| `role` | `text` NOT NULL DEFAULT `'player'` | `captain` \| `player` |
| `joined_at` | `timestamptz` NOT NULL | |

---

## bracket_matches

Individual match records within bracket/tournament competitions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `competition_id` | `uuid` NOT NULL | FK → `competitions.id` |
| `round` | `integer` NOT NULL | Round number (1-based) |
| `match_number` | `integer` NOT NULL | Match position within the round |
| `bracket_type` | `text` NOT NULL DEFAULT `'winners'` | `winners` \| `losers` \| `grand_final` |
| `participant_a` | `text` | Wallet or team ID |
| `participant_b` | `text` | Wallet or team ID |
| `score_a` | `integer` | |
| `score_b` | `integer` | |
| `winner` | `text` | Wallet or team ID of the winner |
| `status` | `text` NOT NULL DEFAULT `'pending'` | `pending` \| `in_progress` \| `completed` \| `disputed` |
| `challenge_id` | `bigint` | Optional on-chain challenge backing this match |
| `scheduled_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `created_at` | `timestamptz` NOT NULL | |

---

## match_disputes

Dispute filings for bracket matches. Filed by participants, resolved by org admins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `match_id` | `uuid` NOT NULL | FK → `bracket_matches.id` |
| `competition_id` | `uuid` NOT NULL | FK → `competitions.id` |
| `filed_by` | `text` NOT NULL | Wallet that filed the dispute |
| `reason` | `text` NOT NULL | Dispute reason |
| `evidence_url` | `text` | URL to supporting evidence |
| `status` | `text` NOT NULL DEFAULT `'open'` | `open` \| `resolved` \| `dismissed` |
| `resolution_note` | `text` | Admin resolution explanation |
| `resolved_by` | `text` | Wallet of the admin who resolved |
| `created_at` | `timestamptz` NOT NULL | |
| `resolved_at` | `timestamptz` | |

---

## api_keys

Scoped API keys for organizations. Keys are stored as hashed values;
the raw key is shown once at creation time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `organizations.id` |
| `key_hash` | `text` NOT NULL | SHA-256 hash of the API key |
| `key_prefix` | `text` NOT NULL | First 8 chars of the key (for display) |
| `label` | `text` NOT NULL | Human-readable label |
| `scopes` | `text[]` NOT NULL DEFAULT `'{}'` | Granted scopes |
| `rate_limit` | `integer` NOT NULL DEFAULT `1000` | Requests per hour |
| `last_used_at` | `timestamptz` | |
| `expires_at` | `timestamptz` | NULL = no expiry |
| `created_at` | `timestamptz` NOT NULL | |
| `revoked_at` | `timestamptz` | NULL = active; set to revoke |

---

## webhooks

Webhook endpoint registrations per organization. Events are delivered
to the registered URL with an HMAC signature using the shared secret.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `organizations.id` |
| `url` | `text` NOT NULL | Delivery URL |
| `secret` | `text` NOT NULL | HMAC shared secret |
| `events` | `text[]` NOT NULL DEFAULT `'{}'` | Subscribed event types |
| `active` | `boolean` NOT NULL DEFAULT `true` | `false` = paused |
| `created_at` | `timestamptz` NOT NULL | |

---

## webhook_deliveries

Tracks individual webhook delivery attempts and retries.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `webhook_id` | `uuid` NOT NULL | FK → `webhooks.id` |
| `event` | `text` NOT NULL | Event type that triggered delivery |
| `payload` | `jsonb` NOT NULL | Full event payload sent |
| `response_status` | `integer` | HTTP status code from target |
| `response_body` | `text` | Truncated response body |
| `attempt` | `integer` NOT NULL DEFAULT `1` | Attempt number |
| `delivered_at` | `timestamptz` | Successful delivery time |
| `next_retry_at` | `timestamptz` | Next retry time (NULL if delivered or exhausted) |
| `created_at` | `timestamptz` NOT NULL | |

---

## whitelabel_configs

Per-organization white-label branding configuration.
Applied when the webapp is accessed via the organization's custom domain.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL UNIQUE | FK → `organizations.id` |
| `custom_domain` | `text` | Custom domain (e.g. `challenges.acme.com`) |
| `primary_color` | `text` DEFAULT `'#6B5CFF'` | Brand primary color |
| `logo_url` | `text` | Custom logo URL |
| `favicon_url` | `text` | Custom favicon URL |
| `custom_css` | `text` | Additional CSS overrides |
| `footer_text` | `text` | Custom footer text |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

---

## Authoritative sources summary

| Data | Authoritative source |
|------|----------------------|
| Challenge on-chain state | `public.challenges` (written by lightchain indexer) |
| Challenge outcome | `public.challenges.chain_outcome` (written by `statusIndexer`) |
| Verdict / pass status | `public.verdicts` (written by `evidenceEvaluator.ts`) |
| Claimable state | Live on-chain `simulateContract` check (real-time) |
| Claimed state | `public.claims` (written by UI post-tx + `claimsIndexer.ts`) |
| AIVM job status | `public.aivm_jobs` (written by dispatcher/worker/aivmIndexer) |
| Indexer checkpoints | `public.indexer_state` |
| Achievement mints | `public.achievement_mints` (indexed from on-chain `ChallengeAchievement` events) |
| Reputation | `public.reputation` (computed off-chain from achievement_mints) |
| Notifications | `public.notifications` (written by invite handler, alert workers) |
| User profiles | `public.user_profiles` (written by user via profile API) |
| Competition state | `public.competitions` (written by competition admin API) |
| Organization state | `public.organizations` (written by org creation API) |

---

## Running migrations

Use the migration runner (tracks applied files in `schema_migrations`):

```bash
npx tsx db/migrate.ts
```

This is idempotent — safe to re-run. Already-applied migrations are skipped.

Fallback with raw Node when `tsx` is unavailable:

```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const files = fs.readdirSync('db/migrations').sort().map(f => 'db/migrations/' + f);
(async () => {
  for (const f of files) {
    await pool.query(fs.readFileSync(f, 'utf8'));
    console.log('OK:', f);
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

**Note:** The raw Node fallback does not update `schema_migrations`. Use `npx tsx db/migrate.ts` wherever possible.
