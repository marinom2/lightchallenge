# Operations Runbook

Reference guide for running the LightChallenge off-chain pipeline in development and production.

---

## Pipeline Architecture

```
Provider APIs (Strava, Fitbit, FACEIT, OpenDota, Riot) + Manual uploads (Apple Health, Garmin, Google Fit)
        │
        ▼ progressSyncWorker (active-period, every 15min) + evidenceCollector (proof-window, final reconciliation)
public.evidence
        │
        ▼ evidenceEvaluator
public.verdicts
        │
        ▼ challengeDispatcher (gates on active + verdict)
public.aivm_jobs (queued)
        │
        ▼ challengeWorker
AIVMInferenceV2.requestInferenceV2() [on-chain]
        │
        │ [Lightchain native workers: commit → reveal → attest until quorum]
        │
        ▼ InferenceFinalized event
aivmIndexer → attemptFinalizationBridge()
        → ChallengePay.submitProofFor() → ChallengePayAivmPoiVerifier.verify() + ChallengePay.finalize() [on-chain]
        │
public.aivm_jobs (done)
public.challenges (status = Finalized)

Claims path (parallel):
ChallengePay *Claimed events → claimsIndexer → public.claims

Status sync (parallel):
ChallengePay status events → statusIndexer → public.challenges.status
```

---

## Fitness Activity Isolation Model

Each fitness activity type is isolated end-to-end to prevent cross-contamination
(e.g., walking workouts cannot count toward running challenges).

### Evidence Collection (iOS / HealthKit)

| Activity     | HealthKit Source                          | Evidence `type` | Key Metrics              |
|--------------|-------------------------------------------|-----------------|--------------------------|
| Steps        | `stepCount` (cumulative quantity)          | `steps`         | steps_count              |
| Running      | `HKWorkout(.running)`                     | `run`           | distance_m, duration_s   |
| Walking      | `HKWorkout(.walking)`                     | `walk`          | distance_m, duration_s   |
| Hiking       | `HKWorkout(.hiking)` + flightsClimbed     | `hike`          | distance_m, elev_gain_m  |
| Cycling      | `distanceCycling` (cumulative quantity)    | `cycle`         | distance_m               |
| Swimming     | `distanceSwimming` (cumulative quantity)   | `swim`          | distance_m               |
| Strength     | `HKWorkout(.traditionalStrengthTraining)` | `strength`      | duration_s, sessions     |
| Yoga         | `HKWorkout(.yoga)`                        | `yoga`          | duration_s, sessions     |
| HIIT         | `HKWorkout(.highIntensityIntervalTraining, .crossTraining, .mixedCardio)` | `hiit` | duration_s, sessions |
| Rowing       | `HKWorkout(.rowing)`                      | `rowing`        | distance_m, duration_s   |
| Calories     | `activeEnergyBurned` (cumulative, cross-activity) | `calories` | calories              |
| Exercise     | `appleExerciseTime` (cumulative, cross-activity)  | `exercise_time` | exercise_minutes     |

**Key design decisions:**
- `distanceWalkingRunning` is **not** sent as evidence — it combines walking+running into one ambiguous value. Workout-level queries provide isolated per-type distance.
- `flightsClimbed` sends type `hike` (not `walk`) — stair elevation counts toward hiking.
- `activeEnergyBurned` sends type `calories` (not `steps`) — it's a cross-activity aggregate.
- Steps are always cross-activity (pedometer counts all on-foot motion).
- Calories and exercise time are always cross-activity aggregates.

### Evaluator Isolation (offchain)

**Full Rule path:** `activities.filter(a => a.type === rule.challengeType)` — only activities matching the rule's `challengeType` are considered. A running challenge only sees `type: "run"` records.

**Simplified Rules path:** `activityMatchesSimpleMetric()` enforces type-specific filtering:
- `walking_km` → only `walk` activities
- `hiking_km` → only `hike` activities
- `cycling_km` → only `cycle` activities
- `swimming_km` → only `swim` activities
- `rowing_km` → only `rowing` activities
- `yoga_min` → only `yoga` activities
- `hiit_min` → only `hiit` activities
- `strength_sessions` → only `strength` activities
- Generic metrics (`steps`, `distance_km`, `active_minutes`, `calories`, `exercise_time`) accept all activity types.

### `canonicalType()` Mapping (offchain/evaluators/fitnessEvaluator.ts)

Maps provider-specific type strings to canonical types:
- `run`, `virtualrun`, `trail_run`, `running` → `run`
- `walk`, `walking` → `walk`
- `hike`, `hiking`, `trail`, `mountaineering` → `hike`
- `cycle`, `ride`, `virtualride`, `cycling`, `bike` → `cycle`
- `swim`, `swimming`, `openwater` → `swim`
- `strength`, `weighttraining`, `functional_training` → `strength`
- `yoga`, `pilates`, `flexibility` → `yoga`
- `hiit`, `crossfit`, `crosstraining`, `mixed_cardio`, `circuit_training` → `hiit`
- `rowing`, `rowing_machine`, `indoor_rowing` → `rowing`
- `calories`, `active_energy`, `calorie_burn` → `calories`
- `exercise_time` → `exercise_time`

---

## Prerequisites

- Node.js 22 + `npm install` at repo root
- `webapp/.env.local` with all required variables set (see `.env.example`)
- LightChain testnet RPC accessible (`https://light-testnet-rpc.lightchain.ai`)
- PostgreSQL database (Neon or local) with `DATABASE_URL` set

---

## 1. Database Migration

Run once before starting any workers, and after adding new migration files:

```bash
npx tsx db/migrate.ts
```

Applied migrations are tracked in `public.schema_migrations`.
Re-running is safe — already-applied files are skipped.

Current migrations: `001_evidence_verdicts` through `027_expanded_fitness_models`.
See [db/DATABASE.md](db/DATABASE.md) for full schema documentation.

---

## 2. Identity Seed (one-time)

Migrate legacy `offchain/.state/identity_bindings.json` → `public.identity_bindings`:

```bash
npx tsx db/seed_identity.ts
```

Safe to re-run (upsert on conflict). Only needed if migrating from a pre-DB version of the system.

---

## 3. Evidence Collector

Finds challenges currently in their **proof submission window** (`endTs <= now AND proofDeadlineTs > now`),
identifies participants who have not yet submitted evidence, fetches activity data for exactly
the challenge period (`startTs` to `endTs`), and stores normalized records in `public.evidence`.

The collector uses challenge timeline data from `public.challenges.timeline` (JSONB) to determine
the proof window and the precise date range for data fetching. There is no fixed lookback; each
challenge's own period defines what data to retrieve.

```bash
npx tsx offchain/workers/evidenceCollector.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `EVIDENCE_COLLECTOR_POLL_MS` | `300000` | Milliseconds between polls (5 min) |

**Server-side collection providers (fetched automatically during proof window):**
- `strava` — OAuth, token auto-refresh, fetches activities for challenge period
- `fitbit` — OAuth, token auto-refresh, fetches daily steps + activity logs for challenge period
- `opendota` — free API, fetches Dota 2 matches by Steam32 ID for challenge period
- `riot` — API key required, fetches LoL matches by PUUID for challenge period
- `faceit` — API key required, fetches CS2 matches by Steam64→FACEIT player ID for challenge period

**Upload-only providers (skipped by evidence collector — evidence via file upload or auto-proof):**
- `apple` — no server-side API; users upload Apple Health ZIP export (or iOS AutoProofService pushes data)
- `garmin` — no public API (enterprise-only); users upload TCX/GPX/JSON export (or iOS AutoProofService pushes data)
- `googlefit` — API deprecated by Google in 2025; users upload Google Takeout JSON

**Writes to:** `public.evidence`

**Note:** The collector skips insertion when the incoming `evidence_hash` matches the
previous row for the same `(challenge_id, subject, provider)` — no duplicate rows.

### Auto-Proof API Endpoint

`POST /api/challenge/{id}/auto-proof` provides on-demand, per-user evidence collection
as a complement to the background evidence collector.

**Behavior:**
- Triggers immediate evidence collection for the authenticated user and the specified challenge
- Only works during the proof submission window (`endTs <= now AND proofDeadlineTs > now`); returns an error otherwise
- For **server-side providers** (Strava, Fitbit, OpenDota, Riot, FACEIT): pulls data server-side for the exact challenge period (`startTs` to `endTs`) and stores it in `public.evidence`
- For **upload-only providers** (Apple Health, Garmin): returns `"upload-required"` with the date range (`startTs`, `endTs`) so the client can collect and upload data for that period

**Callers:**
- **Webapp**: called when a user views a challenge that is in its proof window (ensures evidence is collected promptly without waiting for the next collector poll)
- **iOS AutoProofService**: called when the iOS app detects a challenge has entered its proof window (allows the app to either upload local health data or trigger server-side fetching)

**Authentication:** Requires standard `x-lc-address` / `x-lc-signature` / `x-lc-timestamp` headers (see section 16).

---

## 3b. Progress Sync Worker

Runs during **active challenges** (not just the proof window) to keep real-time progress
updated from ALL connected API-based providers. Periodically fetches activity data and upserts
evidence, so `/api/challenge/{id}/my-progress` reflects the latest data.

When a challenge enters the proof window, the worker performs a **final reconciliation fetch**
to ensure evidence is complete before the evaluator generates a verdict.

```bash
npx tsx offchain/workers/progressSyncWorker.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `PROGRESS_SYNC_POLL_MS` | `900000` | Milliseconds between polls (15 min) |
| `PROGRESS_SYNC_BATCH` | `50` | Max challenges per tick |

**API-based providers synced automatically:**
- `strava` — OAuth, token auto-refresh, fetches activities for challenge period
- `fitbit` — OAuth, token auto-refresh, fetches daily steps + activity logs
- `opendota` — free public API, fetches Dota 2 matches by Steam32 ID
- `riot` — API key required, fetches LoL matches by PUUID
- `faceit` — API key required, fetches CS2 matches by Steam64→FACEIT player ID

**Upload-only providers (NOT synced by this worker — no server-side API):**
- `apple` — data pushed from iOS AutoProofService (HealthKit)
- `garmin` — users upload TCX/GPX/JSON export files
- `googlefit` — API deprecated by Google in 2025; users upload Google Takeout JSON

**How it works:**
1. Finds active challenges where `startsAt <= now < proofDeadline`
2. For each, finds participants with linked API-provider accounts or gaming identity bindings
3. Fetches activity data for the challenge period (start → now for active, start → end for proof window)
4. Upserts evidence row per (challenge, subject, provider) — replaces stale data
5. Progress is automatically visible via `GET /api/challenge/{id}/my-progress`

**Production:** Included in `ecosystem.config.cjs` as `progress-sync`. Auto-starts with `pm2 start ecosystem.config.cjs`.

**Requires:** Migration 025 (`evidence_challenge_subject_provider_uq` unique index).

**Writes to:** `public.evidence` (upsert)

---

## 4. Evidence Evaluator

Polls `public.evidence` for rows that have no corresponding verdict, runs the appropriate
evaluator per provider, and upserts the result to `public.verdicts`.

```bash
npx tsx offchain/workers/evidenceEvaluator.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `EVIDENCE_EVALUATOR_POLL_MS` | `15000` | Milliseconds between polls |
| `EVIDENCE_EVALUATOR_BATCH` | `50` | Evidence rows evaluated per poll |

**Evaluators:**
- `fitnessEvaluator` — for `apple`, `garmin`, `strava`, `fitbit`, `googlefit`
- `gamingEvaluator` — for `opendota`, `riot`, `steam`, `faceit`

**Writes to:** `public.verdicts`

**Safety:** Unknown providers produce a `pass: false` verdict to drain the queue rather than block it.

**Must run before:** `challengeDispatcher` (dispatcher gates on verdict existence).

---

## 5. Challenge Dispatcher

Scans `public.challenges` for active challenges that have a matching passing verdict
and queues them into `public.aivm_jobs`.

The dispatcher supports two evaluation modes:

**Threshold mode** (default): dispatches as soon as the challenge subject has a passing
verdict. This is the standard pass/fail flow.

**Competitive mode**: for challenges with `rule.mode === "competitive"`. The dispatcher
waits until the proof deadline passes (all evidence is in), then:

1. Fetches all verdicts for the challenge with `score IS NOT NULL`
2. Ranks participants by `score` descending
3. Breaks ties by earliest evidence submission (`created_at` ascending)
4. Marks the top-N participants as winners (`pass=true`), the rest as losers (`pass=false`)
5. Enqueues a single AIVM job (normal flow from here)
6. The AIVM indexer calls `submitProofFor` for each passing participant during finalization

No new environment variables are required for competitive mode. Detection is automatic
based on the challenge's `proof.params.rule.mode` field.

```bash
npx tsx offchain/dispatchers/challengeDispatcher.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `CHALLENGE_DISPATCHER_POLL_MS` | `10000` | Milliseconds between polls |
| `CHALLENGE_DISPATCHER_SCAN_LIMIT` | `200` | Challenges scanned per poll |

**Reads from:** `public.challenges` (status = `active`), `public.verdicts` (pass = true for threshold; score IS NOT NULL for competitive)

**Writes to:** `public.aivm_jobs` (status = `queued`), `public.verdicts` (pass and metadata updated during competitive ranking)

**Idempotent:** already-queued challenges are not re-queued (UNIQUE constraint on `challenge_id`).

---

## 6. Challenge Worker

Dequeues jobs from `public.aivm_jobs` and submits them to the Lightchain AIVM network
via `requestInferenceV2`. Sets job status to `submitted`. Does NOT attempt
commit/reveal/attest — those are performed autonomously by Lightchain workers and validators.

```bash
npx tsx offchain/workers/challengeWorker.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `CHALLENGE_WORKER_POLL_MS` | `5000` | Milliseconds between polls |
| `CHALLENGE_WORKER_CONCURRENCY` | `2` | Max simultaneous jobs |
| `CHALLENGE_WORKER_MAX_ATTEMPTS` | `10` | Retry attempts before marking `failed` |

**Required env vars:** `LCAI_WORKER_PK`, `AIVM_INFERENCE_V2_ADDRESS`, `AIVM_TASK_REGISTRY_ADDRESS`

**Reads from:** `public.aivm_jobs` (status = `queued`)

**Writes to:** `public.aivm_jobs` (status → `submitted` or `failed`), `public.challenges` (binding recorded)

---

## 7. AIVM Indexer

Watches events from the Lightchain `AIVMInferenceV2` contract and updates the DB as the
Lightchain network processes submitted tasks. When `InferenceFinalized` is observed, triggers
the finalization bridge to call `submitProofFor` and `ChallengePay.finalize()`.

```bash
npx tsx offchain/indexers/aivmIndexer.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `AIVM_INDEXER_POLL_MS` | `4000` | Milliseconds between polls |
| `CHALLENGEPAY_ADDRESS` | — | Required for finalization bridge |
| `LCAI_FINALIZE_PK` | — | Private key for finalization bridge calls |

**Required env vars:** `AIVM_INFERENCE_V2_ADDRESS`, `NEXT_PUBLIC_RPC_URL`

**Event → DB action:**

| Event | Action |
|---|---|
| `InferenceRequestedV2` | job status → `submitted` |
| `InferenceCommitted` | job status → `committed` |
| `InferenceRevealed` | job status → `revealed` |
| `PoIAttested` | result/slot recorded; no bridge trigger |
| `InferenceFinalized` | `attemptFinalizationBridge()` → job status → `done` |

**Checkpoint:** last processed block stored in `public.indexer_state` under key `last_aivm_block`.

**Finalization bridge:** idempotent — will not retry if `proof.finalizationAttempted` is already set.
If `finalize()` reverts (e.g. BeforeDeadline), the error is logged and processing continues.

---

## 8. Claims Indexer

Watches `ChallengePay` claim events and Treasury `ClaimedETH` events, persisting each
claim into `public.claims`. This is the secondary/hardening source of truth for claimed state.
The UI also writes to `public.claims` immediately after a successful transaction (primary path).

```bash
npx tsx offchain/indexers/claimsIndexer.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `CLAIMS_INDEXER_POLL_MS` | `6000` | Milliseconds between polls |
| `CHALLENGEPAY_ADDRESS` or `NEXT_PUBLIC_CHALLENGEPAY_ADDR` | — | Required |
| `NEXT_PUBLIC_TREASURY_ADDR` or `TREASURY_ADDRESS` | — | Required |

**Events indexed:** `WinnerClaimed`, `LoserClaimed`, `RefundClaimed`, `ClaimedETH`

**Checkpoint:** last processed block stored in `public.indexer_state` under key `last_claims_block`.

**Writes to:** `public.claims` (upsert on conflict — idempotent)

---

## 9. Status Indexer

Watches `ChallengePay` status-changing events and keeps `public.challenges.status`
aligned with on-chain state. This closes the gap where only `aivmIndexer` wrote
`Finalized` — canceled challenges now sync automatically.

```bash
npx tsx offchain/indexers/statusIndexer.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `STATUS_INDEXER_POLL_MS` | `6000` | Milliseconds between polls |
| `CHALLENGEPAY_ADDRESS` or `NEXT_PUBLIC_CHALLENGEPAY_ADDR` | — | Required |

**Events indexed:** `Finalized`, `Canceled`

**Checkpoint:** last processed block stored in `public.indexer_state` under key `last_status_block`.

**Writes to:** `public.challenges.status` (idempotent — only updates when status differs)

---

## 10. Recommended Startup Order

### Option A: PM2 (recommended for persistent deployment)

```bash
# Step 1 — DB migration (run once before starting workers)
npx tsx db/migrate.ts

# Step 2 — Start all workers with PM2
npm install -g pm2      # one-time install
pm2 start ecosystem.config.cjs

# Useful PM2 commands
pm2 status              # check all worker health
pm2 logs                # tail all worker logs
pm2 logs evidence-collector  # tail specific worker
pm2 restart all         # restart everything
pm2 stop all && pm2 delete all  # tear down

# Auto-start on reboot
pm2 startup             # generate startup script
pm2 save                # save current process list
```

### Option B: Manual (separate terminals)

```bash
# Step 1 — DB migration (run once before starting workers)
npx tsx db/migrate.ts

# Step 2 — Workers and indexers (run persistently)
npx tsx offchain/workers/evidenceCollector.ts       # provider APIs → public.evidence
npx tsx offchain/workers/evidenceEvaluator.ts       # public.evidence → public.verdicts
npx tsx offchain/dispatchers/challengeDispatcher.ts # verdicts → public.aivm_jobs queue
npx tsx offchain/workers/challengeWorker.ts         # aivm_jobs → requestInferenceV2 on-chain
npx tsx offchain/indexers/aivmIndexer.ts            # Lightchain AIVM events → finalize
npx tsx offchain/indexers/claimsIndexer.ts          # ChallengePay claim events → public.claims
npx tsx offchain/indexers/statusIndexer.ts         # ChallengePay status events → challenges.status

# Webapp (can run at any time independently)
cd webapp && npm run dev
```

> **Dependency ordering:** `evidenceEvaluator` must be running before `challengeDispatcher`,
> which must be running before `challengeWorker`. The indexers are independent.

---

## 11. Deployed Contract Addresses (Testnet)

| Contract | Address |
|---|---|
| `ChallengePay` (V1) | `0xBeA3b508a5Ce2E6C8462108f42c732Da7454c5cb` |
| `EventChallengeRouter` | `0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D` |
| `Treasury` | `0xe84c197614d4fAAE1CdA8d6067fFe43befD9e961` |
| `MetadataRegistry` | `0xe9bAA8c04cd77d06A736fc987cC13348DfF0bfAb` |
| `ChallengeTaskRegistry` | `0x0e079C693Bd177Fa31baab70EfCD5b9D625c355E` |
| `ChallengePayAivmPoiVerifier` | `0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123` |
| `ChallengeAchievement` | `0xFD6344e9f0d88C6E72563027503734270094e0cF` |
| `TrustedForwarder` | `0xedF522094Ce3F497BEAA9f730d15a7dd554CaB4d` |
| `AIVMInferenceV2` (Lightchain source, our deploy) | `0x2d499C52312ca8F0AD3B7A53248113941650bA7E` |
| `LCAIValidatorRegistry` (Lightchain source, our deploy) | `0xB4024725f6B4Fb6C069EfdA842E05CFb2dDaEC0D` |

> All addresses also stored in `webapp/public/deployments/lightchain.json`.

### Archived contracts (deployed on-chain historically, not part of active product)

| Contract | Address | Status |
|---|---|---|
| `AivmProofVerifier` | `0x1aE8272CfB105A3ec14b2cDff85521C205D9dd35` | Path A (EIP-712 trusted-signer) — archived to `.attic/contracts_archive/`. Not part of the AIVM PoI verification path. Admin scripts in `scripts/_archive/`. |

### Previous contract addresses (superseded)

| Contract | Address | Status |
|---|---|---|
| `ChallengePay` (pre-V1) | `0xEF52411a2f13DbE3BBB60A8474808D4d4F7F4CA2` | Superseded by V1 rewrite |
| `EventChallengeRouter` (old) | `0x2c33B069E86EaF1D8b413eD32D7A35995499b5D2` | Superseded (pointed at old ChallengePay) |

### Roles and admin (current)

| Role | Wallet | Notes |
|---|---|---|
| ChallengePay admin | `0x8176735dE44c6a6e64C9153F2448B15F2F53cB31` | `ADMIN_PRIVATE_KEY` wallet; accepted via `acceptAdmin()` |
| Treasury DEFAULT_ADMIN | `0x8176735dE44c6a6e64C9153F2448B15F2F53cB31` | Same admin wallet |
| Treasury OPERATOR_ROLE | `0xBeA3b508a5Ce2E6C8462108f42c732Da7454c5cb` | ChallengePay V1 contract |
| Deployer / Protocol | `0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217` | `PRIVATE_KEY` wallet |
| EventChallengeRouter owner | `0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217` | Deployer (set at construction) |

### Post-deploy checklist (after any ChallengePay redeploy)

1. **Accept admin**: Call `ChallengePay.acceptAdmin()` from the `ADMIN_PRIVATE_KEY` wallet
2. **Grant OPERATOR_ROLE**: Call `Treasury.grantRole(OPERATOR_ROLE, <new ChallengePay address>)` from the Treasury admin wallet
3. **Register dispatcher**: Register the worker wallet on `ChallengeTaskRegistry` (automated by `scripts/deployPoiVerifierV2.ts` if `LCAI_WORKER_PK` is set)
4. **Update env**: Set `CHALLENGEPAY_ADDRESS` / `NEXT_PUBLIC_CHALLENGEPAY_ADDR` in `.env.local` to the new address
5. **Rebuild webapp**: `cd webapp && npm run build` to pick up new ABI and addresses

### Dispatcher setup (one-time after deploy)

When `ChallengeTaskRegistry` is redeployed, register the worker wallet as a dispatcher
so it can call `recordBinding()`. This is automated in `scripts/deployPoiVerifierV2.ts`
if `LCAI_WORKER_PK` is set during deploy.

### Testnet AIVM workers

The Lightchain testnet has active native workers that process inference requests for any model.
Native workers commit + reveal automatically; native validators attest until quorum, emitting
`InferenceFinalized`. Our `aivmIndexer` then drives `ChallengePay.finalize()`.

Verified: requests for `apple_health.steps@1` and other LightChallenge model IDs are picked
up and finalized by native workers — no local simulation needed.

To drive the pipeline locally (e.g. no active workers for a given model):
```bash
PRIVATE_KEY=0x... CHALLENGE_TASK_REGISTRY_ADDRESS=0x... \
  CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS=0x... DATABASE_URL=... \
  LIGHTCHAIN_RPC=https://light-testnet-rpc.lightchain.ai \
  npx tsx scripts/_e2e_simulate_aivm.ts
```

> This script is testnet-only. Do not use in production.

---

## 12. Ops Scripts Reference

The scripts below are located in `scripts/ops/`. Each has a clear lifecycle classification.

| Script | When to run | Recurring? |
|---|---|---|
| `seedStatusIndexer.ts` | First-time deploy only, before starting statusIndexer | One-time |
| `backfillChainOutcome.ts` | After deploy on existing DB, or whenever chain_outcome IS NULL rows appear | On-demand |
| `cancelTerminalJobs.ts` | After deploy on existing DB; also run after any manual job surgery | On-demand |
| `backfillRegistry.ts` | After deploy, or whenever DB has challenges with `registry_status != 'success'` | On-demand |

### `seedStatusIndexer.ts` — one-time, first deploy

Run **once** before starting `statusIndexer` on a fresh or newly deployed environment.
Sets `last_status_block` checkpoint to `current_block - LOOKBACK` so the indexer does not
scan from genesis. Safe to re-run (uses `ON CONFLICT DO UPDATE`).

```bash
npx tsx scripts/ops/seedStatusIndexer.ts
# Optional: override lookback (default 50000 blocks ≈ ~12hrs on this chain)
STATUS_INDEXER_SEED_LOOKBACK=100000 npx tsx scripts/ops/seedStatusIndexer.ts
```

After seeding, start the indexer and it will backfill only recent blocks.

### `backfillChainOutcome.ts` — on-demand, idempotent

Queries `challenges WHERE status='Finalized' AND chain_outcome IS NULL` and reads the
`outcome` field directly from `ChallengePay.getChallenge()` on-chain for each one.
Run after a new deployment on an existing DB, or if the statusIndexer missed events.

```bash
npx tsx scripts/ops/backfillChainOutcome.ts
```

Safe to run any number of times — only updates rows where `chain_outcome IS NULL`.

### `cancelTerminalJobs.ts` — on-demand, idempotent

Cancels any `queued`/`failed`/`processing` aivm_jobs rows whose challenges have reached
a terminal state (Finalized/Canceled). The `challengeDispatcher` handles this
automatically each poll cycle going forward — this script is only needed for pre-existing
stale rows on a fresh deployment.

```bash
npx tsx scripts/ops/cancelTerminalJobs.ts
```

Safe to run any number of times — only updates rows that match the stale condition.

### Run AIVM job for a specific challenge manually

```bash
DATABASE_URL=... LCAI_WORKER_PK=0x... AIVM_INFERENCE_V2_ADDRESS=0x... \
  npx tsx offchain/runners/runChallengePayAivmJob.ts <challengeId>
```

### Sign an AIVM proof manually (fitness / file-based)

```bash
LIGHTCHAIN_RPC=https://light-testnet-rpc.lightchain.ai \
PRIVATE_KEY=0x... \
AIVM_VERIFIER=0x... \
CHALLENGE_ID=42 \
SUBJECT=0x... \
EXPECTED_CALLER=0x... \
RULE_JSON=data/examples/rule_10k_3x_week.json \
ACTIVITIES_JSON=data/examples/activities_run.json \
  npx hardhat run scripts/ops/signAivmProof.ts --network lightchain
```

### `backfillRegistry.ts` — on-demand, idempotent

Finds challenges in `public.challenges` where `registry_status != 'success'` and attempts
`MetadataRegistry.ownerSet()` for each. The write-once contract policy means `AlreadySet`
reverts are treated as success (the URI is already on-chain).

```bash
DATABASE_URL=... BASE_URL=https://app.lightchallenge.ai \
  npx hardhat run scripts/ops/backfillRegistry.ts --network lightchain
```

| Env var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `BASE_URL` or `NEXT_PUBLIC_BASE_URL` | Yes | Base URL for metadata URI construction |
| `METADATA_REGISTRY` | No | Override registry address (else from deployments) |
| `CHALLENGEPAY` | No | Override ChallengePay address (else from deployments) |
| `DRY_RUN` | No | `true` = report only, no writes |
| `BATCH_SIZE` | No | Max challenges per run (default 50) |

Safe to run any number of times. The signer must be the MetadataRegistry owner.

---

## 13. MetadataRegistry Architecture

### Source model

| Layer | Role | Authoritative for |
|---|---|---|
| **ChallengePay** (on-chain) | Protocol truth | Challenge lifecycle, money, verification, payouts |
| **MetadataRegistry** (on-chain) | Metadata pointer | Canonical URI for external/third-party discovery |
| **DB** (`public.challenges`) | Product index | Rich metadata, search, filtering, app rendering |

### Write policy

- `ownerSet()` — **write-once**. Reverts with `AlreadySet` if URI already exists.
- `ownerForceSet()` — explicit overwrite for corrections. Emits distinct `MetadataForceSet` event with old+new URI.
- `ownerClear()` — removes URI. Emits `MetadataCleared`.
- All writes are owner-only. The owner is the system/admin wallet (`METADATA_REGISTRY_KEY`).
- Creators do not write to MetadataRegistry directly.

### Active flow

1. Frontend creates challenge on-chain (`ChallengePay.createChallenge`)
2. Frontend calls `POST /api/challenges` → DB upsert (`public.challenges`)
3. API route attempts `MetadataRegistry.ownerSet(challengePay, id, uri)` using `METADATA_REGISTRY_KEY`
4. Result stored in `public.challenges.registry_status` / `registry_tx_hash` / `registry_error`
5. If write fails → `registry_status = 'failed'` → `backfillRegistry.ts` retries later

### Failure policy

**Soft failure with retry.** Challenge creation never fails because of a registry write failure.
The DB is the primary metadata store for the product. The on-chain registry is for external discovery.
Failed writes are logged in `registry_status` and retried via `backfillRegistry.ts`.

### DB tracking columns

| Column | Type | Purpose |
|---|---|---|
| `registry_status` | text | `pending` / `success` / `failed` / `skipped` |
| `registry_tx_hash` | text | Tx hash on success |
| `registry_error` | text | Error message on failure |

### Monitoring

- Query: `SELECT id, registry_status, registry_error FROM public.challenges WHERE registry_status IN ('pending', 'failed');`
- Any `MetadataForceSet` event on-chain indicates an admin correction — investigate.
- `MetadataCleared` events indicate an admin removal.

---

## 14. DB Quick-Checks

```sql
-- Pending evidence (no verdict yet)
SELECT e.id, e.challenge_id, e.subject, e.provider, e.created_at
FROM   public.evidence e
LEFT   JOIN public.verdicts v
         ON v.challenge_id = e.challenge_id
        AND lower(v.subject) = lower(e.subject)
WHERE  v.id IS NULL
ORDER  BY e.created_at;

-- Latest verdicts
SELECT challenge_id, subject, pass, evaluator, updated_at
FROM   public.verdicts
ORDER  BY updated_at DESC
LIMIT  20;

-- All AIVM job statuses
SELECT challenge_id, status, attempts, task_id, last_error, updated_at
FROM   public.aivm_jobs
ORDER  BY updated_at DESC
LIMIT  30;

-- Jobs stuck waiting on Lightchain network
SELECT challenge_id, status, task_id, updated_at
FROM   public.aivm_jobs
WHERE  status IN ('submitted', 'committed', 'revealed')
ORDER  BY updated_at ASC;

-- Recent claims
SELECT challenge_id, subject, claim_type, amount_wei, source, claimed_at
FROM   public.claims
ORDER  BY claimed_at DESC
LIMIT  20;

-- Indexer checkpoints
SELECT key, value FROM public.indexer_state ORDER BY key;

-- Achievement mints
SELECT token_id, challenge_id, recipient, achievement_type, minted_at
FROM   public.achievement_mints
ORDER  BY minted_at DESC
LIMIT  20;

-- Reputation leaderboard
SELECT subject, points, level, completions, victories
FROM   public.reputation
ORDER  BY points DESC
LIMIT  20;
```

---

## 15. Troubleshooting

### Evidence evaluator not creating verdicts

1. Check `public.evidence` has rows: `SELECT count(*) FROM public.evidence;`
2. Check evaluator logs for unknown provider errors — these produce `pass: false` verdicts immediately
3. Verify `DATABASE_URL` is set and the evaluator process can reach the DB

### Jobs stuck in `queued` (never submitted)

1. Check `challengeWorker` is running
2. Verify `LCAI_WORKER_PK` wallet has sufficient LCAI for gas
3. Check `AIVM_INFERENCE_V2_ADDRESS` and `AIVM_TASK_REGISTRY_ADDRESS` are set correctly
4. Check `AIVM_REQUEST_FEE_WEI` — if set too low, `requestInferenceV2` may revert

### Jobs stuck in `submitted`/`committed`/`revealed` (Lightchain not finalizing)

1. Confirm the `aivmIndexer` is running and checkpointing (query `indexer_state`)
2. Verify `AIVM_INFERENCE_V2_ADDRESS` in `.env.local` matches the live address
3. Check if the AIVM request deadline has expired (~1hr on testnet) — expired requests cannot be finalized. A new request must be submitted.
4. The testnet has active native workers — check whether the `task_id` appears in AIVM contract events

### `InferenceFinalized` observed but `ChallengePay.finalize()` reverted with `BeforeDeadline`

This is normal when the challenge `finalize` window has not opened yet. The indexer logs the revert and continues. Finalization will succeed when the challenge period ends.

### Claims indexer not persisting claims

1. Verify `CHALLENGEPAY_ADDRESS` and `NEXT_PUBLIC_TREASURY_ADDR` are set
2. Query `indexer_state` to check the `last_claims_block` checkpoint value
3. If checkpoint is far behind current block, the indexer may need time to catch up

### AIVM request deadlines on testnet

AIVM requests expire approximately 1 hour after creation on the Lightchain testnet.
If an old request has an expired deadline, the finalization bridge will revert.
Create a fresh request by re-running the challenge worker job.

---

## 16. API Authentication Headers

Webapp API routes that perform writes or return user-specific data support two
authentication methods.

### Method 1: Wallet Signature (primary — web app)

The frontend sends these automatically via middleware; external callers (scripts,
monitoring) must set them manually.

| Header | Value | Purpose |
|---|---|---|
| `x-lc-address` | `0x<wallet-address>` | Wallet address of the caller |
| `x-lc-signature` | `0x<EIP-191 signature>` | Signature of `lightchallenge:{timestamp}` by the wallet |
| `x-lc-timestamp` | Unix epoch milliseconds (string) | Must be within 5 minutes of server time |

The server verifies that `x-lc-signature` is a valid EIP-191 signature of the
`lightchallenge:{x-lc-timestamp}` message by `x-lc-address`. Stale timestamps
(older than 5 minutes) are rejected.

### Method 2: Transaction Receipt Verification (fallback — mobile clients)

Mobile wallets (via WalletConnect) can perform `eth_sendTransaction` but not
`personal_sign` reliably on LightChain's custom chain (ID 504). For routes that
involve an on-chain transaction, the API accepts a fallback:

1. Client sends `txHash` and `subject` (wallet address) in the request body
   (no signature headers needed)
2. Server fetches the on-chain transaction receipt via RPC
3. Server verifies `receipt.status == 0x1` (success) and `receipt.from == subject`
4. Optionally verifies `receipt.to` matches the expected contract (e.g. ChallengePay)

**Routes supporting tx-receipt auth:**
- `POST /api/challenges` — challenge metadata save after `createChallenge()` tx
- `PATCH /api/challenges` — challenge metadata update
- `POST /api/challenge/[id]/participant` — join record after `joinChallengeNative()` tx

**Security notes:**
- Only succeeds if a real on-chain tx was sent from the claimed wallet
- The tx must have succeeded (status 0x1)
- When `expectedTo` is checked, the tx must target the correct contract
- Implementation: `verifyByTxReceipt()` in `webapp/lib/auth.ts`

### Admin Endpoints

Admin endpoints (e.g. `/api/admin/*`) additionally require the `ADMIN_KEY` env var
to be set on the server, and the calling address must match the configured admin wallet.

---

## 17. Dispatcher Role for submitProofFor

The `aivmIndexer` finalization bridge calls `ChallengePay.submitProofFor()` to submit AIVM
proofs on behalf of challenge participants. This function is restricted to addresses with
the **dispatcher** role on ChallengePay.

The dispatcher is set via `ChallengePay.setDispatcher(address)` by the contract admin.
The `LCAI_FINALIZE_PK` wallet must be registered as the dispatcher before the indexer can
finalize challenges.

If `submitProofFor` reverts with an authorization error, check:

1. The `LCAI_FINALIZE_PK` address is the current dispatcher: query `ChallengePay.dispatcher()`
2. The admin has called `setDispatcher()` after the most recent ChallengePay deployment
3. The finalization wallet has sufficient LCAI for gas

See [DEPLOY.md](DEPLOY.md) Step 4 for setup instructions.

---

## 18. Deprecated Columns

`public.challenges.aivm_request_started` and `aivm_request_started_at` have no writers
or readers in the codebase. They are superseded by `public.aivm_jobs.status`. Safe to ignore;
will be removed in a future migration.

---

## 19. Legacy Compatibility

**Active product architecture:** Lightchain AIVM + PoI (Proof of Inference) via `ChallengePayAivmPoiVerifier`. No alternate signer-based or manual verifier is part of the active product.

**Active verification path:** evidence → verdict → AIVM request → Lightchain commit/reveal/attest → `InferenceFinalized` → `ChallengePay.submitProofFor()` → `ChallengePayAivmPoiVerifier.verify()` → `ChallengePay.finalize()`.

**Contract classification:**
- **Core product:** ChallengePay, Treasury, ChallengePayAivmPoiVerifier, ChallengeTaskRegistry
- **Core product:** ChallengeAchievement (soulbound ERC-721 + ERC-5192; read-only dependency on ChallengePay)
- **Core product:** MetadataRegistry (active on-chain metadata pointer layer; write-once by default, system-managed)
- **Admin-only optional:** EventChallengeRouter (multi-outcome event routing; admin scripts only, not on user-facing product path)
- **Dormant infrastructure:** TrustedForwarder (EIP-2771 gasless relay; deployed but not activated, relay disabled by default via `RELAY_ENABLED`)
- **Archived:** AivmProofVerifier (Path A EIP-712 trusted-signer; moved to `.attic/contracts_archive/`, admin scripts archived, not part of active product)

The following legacy artifacts exist in the codebase for backward compatibility but are
**not part of the active product**:

| Item | Location | Status |
|---|---|---|
| ZK/Plonk contracts | `.attic/contracts_archive/` | Removed from compilation; deployed on testnet but not used |
| ZK/Plonk deploy scripts | `scripts/_archive_deploy/` | Archived out of `deploy/` |
| ZK operational scripts | `scripts/zk/`, `scripts/ops/zk/` | Legacy tools; not used in production |
| AutoApprovalStrategy | `.attic/contracts_archive/`, `scripts/_archive_deploy/` | Replaced by `useCreatorAllowlist` on ChallengePay V1 |
| MultiSigProofVerifier | `.attic/contracts_archive/` | M-of-N attestation; removed from compilation |
| AivmProofVerifier (Path A) | `.attic/contracts_archive/AivmProofVerifier.sol` | Archived; EIP-712 trusted-signer path, not part of active product. Admin scripts in `scripts/_archive/`. ABI removed from webapp. |
| Validator/peer scripts | `scripts/_archive/stakeValidator.ts.bak` etc. | Validator staking/voting removed in V1 |
| `plonk_verifier` DB column | `public.models` | Legacy field; no active readers/writers |
| ZK seed data | `db/migrations/007_models.sql` (one row with `kind='zk'`) | Immutable migration; seed row retained |
| ZK/Plonk model kinds | `offchain/db/models.ts`, `webapp/lib/modelRegistry.ts` | In type union for compat; active kinds are `aivm` and `custom` |

**Policy:** Do not use legacy ZK/Plonk concepts for new models, admin UX, product flows, or
documentation unless explicitly reactivated by a product decision.

---

## 20. Health Checks & Monitoring

### Process health

All 7 worker/indexer processes log their service name on every poll cycle. A healthy system
produces periodic log output. If a process goes silent, it has crashed or hung.

**Recommended:** Run all workers under a process manager (PM2, systemd, Docker) that
auto-restarts on crash. All workers handle `SIGINT`/`SIGTERM` gracefully and drain DB
connections before exit.

### Indexer lag detection

```sql
-- Check indexer checkpoint vs chain head
-- If (chain_head - checkpoint) > 100 blocks, the indexer is lagging
SELECT key, value::bigint AS last_block FROM public.indexer_state ORDER BY key;
```

Compare against chain head: `cast block-number --rpc-url $LCAI_RPC`

Expected lag: ≤ 12 blocks (CONFIRMATION_BLOCKS) + MAX_BLOCK_RANGE (2000) in worst case.

### Job pipeline health

```sql
-- Jobs stuck for >1 hour (needs investigation)
SELECT challenge_id, status, attempts, updated_at, last_error
FROM   public.aivm_jobs
WHERE  status NOT IN ('done', 'canceled', 'dead')
  AND  updated_at < now() - interval '1 hour'
ORDER  BY updated_at ASC;

-- Dead jobs (exhausted all retries)
SELECT challenge_id, last_error, attempts, updated_at
FROM   public.aivm_jobs WHERE status = 'dead'
ORDER  BY updated_at DESC LIMIT 20;
```

### Wallet balance monitoring

Worker and finalizer wallets must maintain LCAI balance for gas + AIVM request fees.

```bash
# Check worker wallet balance
cast balance $LCAI_WORKER_ADDRESS --rpc-url $LCAI_RPC

# Check finalizer wallet balance (if separate)
cast balance $LCAI_FINALIZE_ADDRESS --rpc-url $LCAI_RPC
```

**Alert threshold:** < 0.1 LCAI (100 finalize transactions at ~0.001 LCAI each).

### Evidence pipeline throughput

```sql
-- Evidence waiting for evaluation (should stay near 0)
SELECT count(*) AS pending_evidence
FROM   public.evidence e
LEFT   JOIN public.verdicts v
         ON v.challenge_id = e.challenge_id
        AND lower(v.subject) = lower(e.subject)
WHERE  v.id IS NULL;
```

---

## 21. Failure Recovery Procedures

### Worker crash and restart

All workers are safe to restart at any time. On restart:
- **evidenceCollector**: resumes polling; no checkpoint needed (re-scans proof-window challenges and fills missing evidence)
- **evidenceEvaluator**: picks up unevaluated evidence from DB (idempotent)
- **challengeDispatcher**: re-scans eligible challenges; `ON CONFLICT` prevents duplicates
- **challengeWorker**: claims jobs via `FOR UPDATE SKIP LOCKED`; in-flight jobs remain in `processing` and will be retried after timeout
- **aivmIndexer**: resumes from `last_aivm_block` checkpoint in DB
- **statusIndexer**: resumes from `last_status_block` checkpoint
- **claimsIndexer**: resumes from `last_claims_block` checkpoint

### RPC failure

If the Lightchain RPC is unreachable:
- Indexers log errors and continue polling (next cycle retries)
- Worker's AIVM request submission fails → job marked `failed`, retried on next cycle
- Finalization bridge failures are logged without setting `finalizationAttempted`, allowing automatic retry

### Database failure

- All workers crash on fatal DB errors (correct behavior — process manager restarts them)
- `pg.Pool` handles transient connection drops automatically — no manual reconnection needed
- On DB recovery, all workers resume normal operation immediately

### Stuck jobs recovery

```bash
# Reset stuck processing jobs back to queued (safe — FOR UPDATE SKIP LOCKED prevents conflicts)
UPDATE public.aivm_jobs
SET    status = 'queued', updated_at = now()
WHERE  status = 'processing'
  AND  updated_at < now() - interval '30 minutes';

# Cancel jobs for challenges that are already finalized
npx tsx scripts/ops/cancelTerminalJobs.ts
```

### Reorg recovery

If a reorg deeper than CONFIRMATION_BLOCKS (12) is suspected:
1. Check `indexer_state` checkpoint values
2. Run `scripts/ops/reconcileDemo.ts` to reconcile DB state with on-chain state
3. Run `scripts/ops/backfillChainOutcome.ts` to fix any stale `chain_outcome` values

---

## 22. Production Deployment Checklist

### Pre-deployment

- [ ] All env vars from `.env.example` sections 1-5 are set in `webapp/.env.local`
- [ ] `DATABASE_URL` points to production PostgreSQL with SSL
- [ ] `LCAI_WORKER_PK` and `LCAI_FINALIZE_PK` wallets are funded with LCAI
- [ ] `ADMIN_KEY` is set (random secret string, ≥32 chars)
- [ ] `OAUTH_ENCRYPTION_KEY` is set (`openssl rand -hex 32`)
- [ ] `NEXT_PUBLIC_RPC_URL` and `LCAI_RPC` point to a reliable RPC endpoint
- [ ] Contract addresses in `webapp/public/deployments/lightchain.json` match live deployment

### Database

- [ ] `npx tsx db/migrate.ts` completes without errors
- [ ] `npx tsx scripts/ops/seedStatusIndexer.ts` (first deploy only)
- [ ] Verify `public.schema_migrations` shows all migrations applied

### Contracts

- [ ] `ChallengePay.admin()` returns the expected admin address
- [ ] `Treasury.hasRole(OPERATOR_ROLE, <ChallengePay>)` returns true
- [ ] `ChallengePay.dispatchers(<finalize_wallet>)` returns true
- [ ] `ChallengePayAivmPoiVerifier` is set as verifier on relevant challenges

### Workers

- [ ] All 7 workers start without errors
- [ ] `evidenceCollector` logs provider accounts on first poll
- [ ] `aivmIndexer` logs finalization bridge status (ENABLED/DISABLED)
- [ ] `statusIndexer` and `claimsIndexer` log their ChallengePay addresses

### Webapp

- [ ] `cd webapp && npm run build` succeeds
- [ ] `/explore` page loads and shows challenges
- [ ] `/challenge/<id>` page loads for a known challenge
- [ ] Admin panel at `/admin` authenticates correctly with `ADMIN_KEY`

### Post-deployment

- [ ] Monitor indexer lag (section 20) for first 10 minutes
- [ ] Verify wallet balances are sufficient
- [ ] Run a test challenge through the full pipeline (create → evidence → verdict → AIVM → finalize → claim)

---

## 23. Competitive Challenges

Competitive challenges rank participants by score rather than applying a pass/fail
threshold. The on-chain contract (`ChallengePay`) still uses binary outcome
(winner/loser), so competitive ranking is resolved off-chain before finalization.

### Flow

```
Participants submit evidence during proof window
        │
        ▼ evidenceEvaluator
public.verdicts (score + metadata populated)
        │
        │ [proof deadline passes]
        │
        ▼ challengeDispatcher (competitive mode)
Ranks all verdicts by score DESC, tie-breaks by earliest created_at
Top-N marked pass=true, rest pass=false
        │
        ▼ AIVM job queued → challengeWorker → requestInferenceV2
        │
        │ [Lightchain network: commit → reveal → attest]
        │
        ▼ InferenceFinalized → aivmIndexer
submitProofFor() for each winner → ChallengePay.finalize()
```

### Migration

- `018_verdicts_score_competitive.sql` — adds `score` (numeric) and `metadata` (jsonb) columns to `public.verdicts`. The `score` column stores the evaluated metric value used for competitive ranking (e.g. total steps, total kills). The `metadata` column stores structured evaluation details (e.g. match IDs, per-day breakdowns).
- `019_seed_demo_challenges.sql` — seeds demo competitive and threshold challenges for testing.

Apply with the standard migration runner:

```bash
npx tsx db/migrate.ts
```

### Detection

A challenge is competitive if its rule config contains `mode: "competitive"`. The
dispatcher checks the following paths in order:

1. `proof.params.rule.mode`
2. `proof.params.mode`
3. `params.rule.mode`
4. `params.mode`

The `topN` value (number of winners) is read from the same paths. Defaults to 1 if
not specified.

### Tie-breaking

When multiple participants have the same score, the tie is broken by `created_at` on
the verdict row — the participant who submitted evidence earliest wins. This is
deterministic and auditable.

### DB queries for competitive challenges

```sql
-- All competitive challenges
SELECT id, subject, status,
       proof->'params'->'rule'->>'mode' AS mode,
       proof->'params'->'rule'->>'topN' AS topN
FROM   public.challenges
WHERE  proof->'params'->'rule'->>'mode' = 'competitive';

-- Ranking for a specific competitive challenge
SELECT subject, score, pass, metadata, created_at
FROM   public.verdicts
WHERE  challenge_id = <ID>
ORDER  BY score DESC NULLS LAST, created_at ASC;
```

---

## 24. PM2 Worker Management

All off-chain workers are managed via [PM2](https://pm2.keymetrics.io/) using `ecosystem.config.cjs` at the project root.

### Workers

| # | Name | Script | Poll Interval | Purpose |
|---|------|--------|--------------|---------|
| 0 | evidence-collector | `offchain/workers/evidenceCollector.ts` | 5 min | Fetches evidence from API providers (Strava, Fitbit) for challenges in proof window |
| 1 | evidence-evaluator | `offchain/workers/evidenceEvaluator.ts` | 15 sec | Evaluates evidence against challenge rules, writes verdicts |
| 2 | challenge-dispatcher | `offchain/dispatchers/challengeDispatcher.ts` | 10 sec | Dispatches challenges with verdicts to AIVM jobs queue |
| 3 | challenge-worker | `offchain/workers/challengeWorker.ts` | 5 sec | Submits AIVM inference requests on-chain |
| 4 | aivm-indexer | `offchain/indexers/aivmIndexer.ts` | 6 sec | Watches AIVM events, bridges finalization to ChallengePay |
| 5 | status-indexer | `offchain/indexers/statusIndexer.ts` | 6 sec | Watches ChallengePay status events, syncs to DB |
| 6 | claims-indexer | `offchain/indexers/claimsIndexer.ts` | 6 sec | Watches ChallengePay claim events, syncs to DB |
| 7 | progress-sync | `offchain/workers/progressSyncWorker.ts` | 15 min | Syncs live progress from API providers during active challenges |

### Starting Workers

```bash
# Start all workers
pm2 start ecosystem.config.cjs

# Start a specific worker
pm2 start ecosystem.config.cjs --only evidence-evaluator

# Restart all (picks up code changes)
pm2 restart all --update-env

# Check status
pm2 status

# Tail logs (all workers)
pm2 logs

# Tail logs (specific worker)
pm2 logs evidence-evaluator --lines 50

# Save current process list (for auto-restart)
pm2 save
```

### Auto-Start on Boot (macOS)

PM2 uses `launchd` on macOS to auto-start workers on system boot:

```bash
# Generate and install launchd startup script (requires sudo)
sudo env PATH=$PATH:/opt/homebrew/bin \
  $(which pm2) startup launchd -u $(whoami) --hp $HOME

# Save the current process list so PM2 knows what to start
pm2 save
```

After running these commands, PM2 will automatically restore saved workers on reboot.

To remove auto-start:
```bash
pm2 unstartup launchd
```

### Troubleshooting

```bash
# Check for crashed workers
pm2 status  # look for "errored" or high restart count (↺)

# View recent errors for a specific worker
pm2 logs evidence-evaluator --err --lines 100

# Flush all logs (if disk fills up)
pm2 flush

# Kill all PM2 processes and daemon
pm2 kill

# Restart from scratch
pm2 start ecosystem.config.cjs && pm2 save
```

### Environment

All workers load environment variables from `webapp/.env.local` via `dotenv`. Key variables:

- `DATABASE_URL` — PostgreSQL connection string (required)
- `NEXT_PUBLIC_RPC_URL` — LightChain RPC endpoint (required for indexers)
- `NEXT_PUBLIC_CHALLENGEPAY_ADDR` — ChallengePay contract address (required for indexers)
- `KEEPER_PRIVKEY` — Private key for on-chain transactions (required for challengeWorker, aivmIndexer)

When contract addresses change (e.g. after redeployment), update `webapp/.env.local` and restart all workers:
```bash
pm2 restart all --update-env && pm2 save
```
