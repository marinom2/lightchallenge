# LightChallenge — System Truth Extraction
> Generated 2026-03-20 from codebase analysis. Every claim backed by file path + function name.

---

## 1. CHALLENGE LIFECYCLE (Source of Truth)

### On-Chain Status Enums
**File:** `contracts/ChallengePay.sol` lines 76-79
```solidity
enum Status   { Active, Finalized, Canceled }  // 0, 1, 2
enum Outcome  { None, Success, Fail }          // 0, 1, 2
```

### Database Challenge Status
**Table:** `public.challenges` — column `status` (text)
- Values: `"Active"`, `"Finalized"`, `"Canceled"`, `"Paused"`
- Column `chain_outcome` (smallint): 0=None, 1=Success, 2=Fail

### User/Participant Status
There is **no single enum** for participant status. It is **derived** from multiple fields:

**File:** `mobile/ios/LightChallengeApp/Sources/Models/Challenge.swift` lines 636-655
```swift
func statusLabel(meta:) → String:
  Active       — challenge time window is open
  Proof needed — ended, proof window open, no evidence
  Evaluating   — evidence submitted, before proof deadline
  Verifying    — evidence submitted, AIVM processing
  Passed       — verdictPass == true
  Failed       — verdictPass == false
```

**Database fields that compose participant state:**
- `participants.joined_at`
- `evidence.submitted_at`, `evidence.provider`
- `verdicts.pass` (boolean), `verdicts.reasons[]`, `verdicts.evaluator`
- `aivm_jobs.status`: `queued → processing → submitted → committed → revealed → done`
- `challenges.status`, `challenges.chain_outcome`
- `claims.claim_type`, `claims.amount_wei`

### Complete State Transition Map

| Transition | Trigger | File | Function |
|---|---|---|---|
| ∅ → Active | User creates challenge on-chain | `contracts/ChallengePay.sol:591` | `createChallenge()` |
| Active → Active (join) | User joins on-chain | `contracts/ChallengePay.sol:695` | `joinChallengeNative()` |
| Active → Active (proof) | Dispatcher submits proof | `contracts/ChallengePay.sol:776` | `submitProofFor()` |
| Active → Finalized | Anyone calls after deadlines pass | `contracts/ChallengePay.sol:834` | `finalize()` |
| Active → Canceled | Creator/admin cancels (no winners) | `contracts/ChallengePay.sol:531` | `cancelChallenge()` |
| Active ↔ Paused | Admin toggles | `contracts/ChallengePay.sol:525` | `pauseChallenge()` |
| Finalized → Claimed | User pulls funds | `contracts/ChallengePay.sol:933` | `claimWinner()` / `claimLoser()` |
| Canceled → Refunded | User pulls refund | `contracts/ChallengePay.sol:981` | `claimRefund()` |

### Off-Chain Indexers That Track On-Chain Events

| Indexer | File | Events Watched |
|---|---|---|
| Status Indexer | `offchain/indexers/statusIndexer.ts` | `ChallengeCreated`, `Finalized`, `Canceled`, `Paused` |
| AIVM Indexer | `offchain/indexers/aivmIndexer.ts` | `InferenceRequestedV2`, `InferenceCommitted`, `InferenceRevealed`, `PoIAttested`, `InferenceFinalized` |
| Claims Indexer | (via statusIndexer) | `WinnerClaimed`, `LoserClaimed`, `RefundClaimed` |

---

## 2. PROGRESS SYSTEM

### Where Progress Is Calculated

| Location | File | How |
|---|---|---|
| **Backend API** | `webapp/app/api/challenge/[id]/my-progress/route.ts` | Sums metric across all evidence rows in DB |
| **iOS (local)** | `mobile/ios/.../Services/HealthKitService.swift` | Queries Apple HealthKit directly |
| **iOS (hero)** | `mobile/ios/.../Views/Detail/ChallengeProgressHero.swift:711` | `max(HealthKit, server)` |

### Backend Progress API

**Route:** `GET /api/challenge/{id}/my-progress?subject=0x...`

**Response:**
```json
{
  "metric": "steps",
  "metricLabel": "Steps",
  "currentValue": 8500,
  "goalValue": 10000,
  "progress": 0.85,
  "updatedAt": "2026-03-20T14:30:00Z"
}
```

**Calculation:** `progress = min(1.0, max(0.0, currentValue / threshold))` — clamped [0,1], rounded 4dp.

**Data source:** Aggregates `sumMetric()` across ALL `public.evidence` rows for (challenge_id, subject). Each evidence row contains a `data` array with activity records.

### iOS Progress Ring Source

**File:** `ChallengeProgressHero.swift` lines 711-755

```swift
let hkValue = await healthService.queryMetricTotal(metric, from: start, to: end)
let serverValue = try? await APIClient.shared.fetchMyProgress(...)?.currentValue ?? 0
let value = max(hkValue, serverValue)  // TAKES THE HIGHER VALUE
animatedProgress = goalValue > 0 ? min(1.0, value / goalValue) : 0
```

### Web Progress Source

**File:** `webapp/app/challenge/[id]/page.tsx` line ~814

- Fetches `GET /api/challenge/{id}/my-progress?subject={address}`
- **Only for Fitness challenges** and **only when user has joined**
- Server-only (no local device data on web)

### Known Inconsistency: `distance` Metric

| Platform | `distance` queries... | Source |
|---|---|---|
| **iOS** | Running workouts only (`HKWorkoutActivityType.running`) | HealthKitService |
| **Backend** | ALL distance data generically (`distance_m` or `distance_km` from any type) | Evidence DB rows |

**Impact:** iOS user doing cycling but not running shows 0 distance locally, but server may show cycling distance from Strava/Fitbit sync. The `max()` resolves this in practice, but the semantic mismatch exists.

### Supported Metrics (14 types)

| Metric | iOS HealthKit | Backend API |
|---|---|---|
| `steps` | `HKQuantityType(.stepCount)` | Sum from evidence |
| `distance`/`distance_km` | Running workouts only | Generic distance |
| `cycling_km` | `HKQuantityType(.distanceCycling)` | Type-filtered |
| `swimming_km` | `HKQuantityType(.distanceSwimming)` | Type-filtered |
| `hiking_km` | Hiking workouts | Type-filtered |
| `walking_km` | Walking workouts | Type-filtered |
| `strength_sessions` | Strength workouts count | Count of records |
| `active_minutes` | All workouts duration | Sum durations |
| `yoga_min` | Yoga workouts | Sum durations |
| `hiit_min` | HIIT/CrossTraining/MixedCardio | Sum durations |
| `rowing_km` | Rowing workouts | Sum / 1000 |
| `exercise_time` | `HKQuantityType(.appleExerciseTime)` | Sum minutes |
| `calories` | `HKQuantityType(.activeEnergyBurned)` | Sum kcal |
| `elev_gain_m` | Hiking + flights climbed | Sum |

---

## 3. NOTIFICATION SYSTEM

### Verdict: REAL, backend-triggered notifications

Notifications are **NOT placeholders**. They are created by backend workers, stored in PostgreSQL, and consumed via API.

### Database

**Table:** `public.notifications`
- Schema: `id (uuid)`, `wallet (text)`, `type (text)`, `title (text)`, `body (text)`, `data (jsonb)`, `read (bool)`, `created_at (timestamptz)`
- Dedup index: `(wallet, data->>'challengeId', data->>'tier')` prevents duplicate alerts

### 18 Notification Types

**File:** `offchain/db/notifications.ts` lines 18-38

| Type | Trigger | Source |
|---|---|---|
| `challenge_behind_pace` | Progress < expected at time checkpoint | challengeAlertWorker (cron 5min) |
| `challenge_final_push` | ≤6h or ≤24h remaining | challengeAlertWorker |
| `challenge_goal_reached` | Progress ≥ 100% | challengeAlertWorker |
| `challenge_finalized` | Verdict evaluated | evidenceEvaluator (cron 15s) |
| `claim_available` | Finalized + unclaimed reward | challengeAlertWorker |
| `claim_reminder` | 3d and 7d post-finalization | challengeAlertWorker |
| `challenge_joined` | Someone joins your challenge | POST /api/challenge/[id]/participant (sync) |
| `proof_submitted` | Evidence submitted | challengeAlertWorker |
| `challenge_starting` | Challenge starts within 24h | challengeAlertWorker |
| `proof_window_open` | Challenge ended, proof deadline open | challengeAlertWorker |
| `match_upcoming` | Competition match scheduled | challengeAlertWorker |
| `match_result` | Competition match completed | challengeAlertWorker |
| `competition_started` | Competition begins | challengeAlertWorker |
| `competition_completed` | Competition ends | challengeAlertWorker |
| `registration_confirmed` | Competition registration | challengeAlertWorker |
| `dispute_filed` | Dispute created | POST /api/v1/disputes (sync) |
| `dispute_resolved` | Dispute resolved | challengeAlertWorker |
| `achievement_earned` | Achievement unlocked | challengeAlertWorker |

### Platform Handling

| Platform | Method | Real? |
|---|---|---|
| **iOS** | Polls `GET /api/v1/notifications` on app launch + pull-to-refresh | YES |
| **iOS** | Local `UNTimeIntervalNotificationTrigger` for progress/proof alerts | YES (device-local) |
| **iOS** | APNs token registered, stored in UserDefaults | YES (token ready, backend push NOT yet wired) |
| **Web** | API routes exist and work | YES (backend) |
| **Web** | **No UI component consumes notifications** | NO DISPLAY |

**Web gap:** The webapp has notification API routes but no React component fetches or displays them. Notifications are **mobile-only** for display purposes.

---

## 4. INVITE / JOIN FLOW

### Join Flow (COMPLETE, works end-to-end)

```
User clicks "Join"
  → Web: writeContractAsync(joinChallengeNative) → on-chain tx
  → iOS: ContractService.joinChallengeNative() → WalletConnect → on-chain tx
    → Funds deposited to Treasury bucket
    → Joined(id, user, amount) event emitted
  → POST /api/challenge/{id}/participant { subject, txHash }
    → upsertParticipant() in DB (source: "onchain_join")
    → Notification sent to challenge creator
```

**API:** `POST /api/challenge/[id]/participant`
- **File:** `webapp/app/api/challenge/[id]/participant/route.ts`
- **Auth:** EIP-191 wallet signature OR tx-receipt fallback (mobile)
- **DB:** Upserts `public.participants` row

**Contract:** `ChallengePay.joinChallengeNative(id)` — validates Active, not paused, join window open, participant cap.

### Invite Flow (PARTIALLY IMPLEMENTED)

| Component | Status | Details |
|---|---|---|
| **UI (InviteSheet)** | REAL | `webapp/app/challenges/create/components/InviteSheet.tsx` — email/wallet/Steam tabs |
| **API endpoint** | REAL | `POST /api/invites` — creates `challenge_invites` row with `status: "queued"` |
| **Database table** | REAL | `public.challenge_invites` — `(id, challenge_id, method, value, status)` |
| **Processing worker** | **MISSING** | No worker processes queued invites |
| **Email delivery** | **MISSING** | No mailer implementation |
| **Claim linking** | **MISSING** | No auto-join when invited wallet visits |

**Status lifecycle defined but never progressed:** `queued → sent → accepted → failed` — invites stay `queued` forever.

---

## 5. iOS APP — Real Capabilities

### What Works (end-to-end verified)

| Capability | Real? | How |
|---|---|---|
| Browse/explore challenges | YES | `GET /api/challenges` |
| View challenge detail | YES | `GET /api/challenge/{id}?viewer={address}` + chain reads |
| Join challenge | YES | On-chain tx via WalletConnect → `joinChallengeNative()` |
| Track fitness progress | YES | Apple HealthKit local reads + server fallback |
| Submit proof/evidence | YES | AutoProofService → `POST /api/aivm/intake` multipart |
| Active-period sync | YES | Every ~15min, Apple Health → server |
| Claim rewards | YES | On-chain `claimWinner()`/`claimLoser()`/`claimRefund()` via WalletConnect |
| Create challenges | YES | 4-step wizard → on-chain + API |
| View achievements | YES | `GET /api/me/achievements` (NFT badges) |
| View leaderboard | YES | `GET /api/leaderboard` |
| OAuth linking (Strava/Fitbit/Garmin) | YES | Web-based OAuth flow |
| Notifications (fetch) | YES | Polls API on launch |
| Profile/wallet | YES | WalletConnect v2 (Reown AppKit) |

### What Does NOT Work on iOS

| Capability | Status | Why |
|---|---|---|
| Gaming challenges | DESKTOP ONLY | `GamingHandoffView` shows "Continue on Desktop" |
| Push notifications | NOT ACTIVE | APNs token registered but backend push not wired |
| Direct message signing | NOT POSSIBLE | LightChain + WalletConnect = no `personal_sign`; uses tx-receipt auth fallback |

### HealthKit Data Types (14 workout templates)

Steps, distance (running), cycling, swimming, hiking, walking, strength sessions, active minutes, yoga, HIIT, rowing, exercise time, calories, elevation gain.

### Authentication Model

**File:** `mobile/ios/.../Services/WalletManager.swift`

- WalletConnect v2 via Reown AppKit
- Custom headers: `x-lc-address` + `x-lc-timestamp`
- Backend validates via tx-receipt lookup (can't `personal_sign` on LightChain)

---

## 6. WEB APP (Next.js 14)

### Key Pages

| Page | Data Source | Status |
|---|---|---|
| `/explore` | `GET /api/dashboard` (on-chain events, polls 10s) + `GET /api/challenges` (metadata) | WORKING |
| `/challenge/[id]` | `GET /api/challenge/{id}` (full detail + timeline) + `GET /api/challenge/{id}/my-progress` (fitness only) | WORKING |
| `/me/challenges` | `GET /api/me/challenges?subject=0x` + per-challenge meta fetch | WORKING |
| `/claims` | Same as `/me/challenges` + on-chain claim simulation | WORKING |
| `/proofs` | `GET /api/me/challenges` filtered for proof-eligible | WORKING |
| `/proofs/[challengeId]` | `GET /api/challenges/meta/{id}` | WORKING |
| `/challenges/create` | On-chain `createChallenge()` + `POST /api/challenges` | WORKING |

### What Web Has That iOS Doesn't
- Gaming challenge participation (Dota 2, LoL, CS2 proof submission)
- Gaming account OAuth linking
- Invite sending UI (post-create)
- Full dashboard with live on-chain event stream

### What Web Is Missing
- **Notification display** — API exists but no UI component
- **Push/real-time updates** — No WebSocket, SSE, or service worker
- **Mobile health data** — No HealthKit equivalent; relies on Strava/Fitbit OAuth

---

## 7. API LAYER — Complete Endpoint Map

### Challenge Data

| Endpoint | Method | Auth | Used By |
|---|---|---|---|
| `/api/dashboard` | GET | None | Web explore |
| `/api/challenges` | GET | None | Web + iOS explore |
| `/api/challenges` | POST/PATCH | Wallet sig | Web + iOS create |
| `/api/challenges/meta/{id}` | GET | None | Web + iOS |
| `/api/challenge/{id}` | GET | None | Web + iOS detail |
| `/api/challenge/{id}/participant` | GET | None | Web + iOS (check join) |
| `/api/challenge/{id}/participant` | POST | Wallet sig / tx-receipt | Web + iOS (record join) |
| `/api/challenge/{id}/my-progress` | GET | None | Web + iOS (fitness) |
| `/api/challenges/{id}/progress` | GET | None | Web + iOS (aggregate) |

### User Data

| Endpoint | Method | Auth | Used By |
|---|---|---|---|
| `/api/me/challenges` | GET | None (subject param) | Web + iOS |
| `/api/me/claims` | GET/POST | Wallet sig | Web + iOS |
| `/api/me/achievements` | GET | None | Web + iOS |
| `/api/me/reputation` | GET | None | iOS |
| `/api/me/stats` | GET | None | iOS |
| `/api/leaderboard` | GET | None | iOS |

### Evidence & Proof

| Endpoint | Method | Auth | Used By |
|---|---|---|---|
| `/api/aivm/intake` | POST (multipart) | Wallet sig / evidence token | Web + iOS |
| `/api/challenge/{id}/auto-proof` | POST | Wallet sig | iOS (server-side auto-proof) |

### Notifications

| Endpoint | Method | Auth | Used By |
|---|---|---|---|
| `/api/v1/notifications` | GET | None (wallet param) | iOS |
| `/api/v1/notifications/{id}/read` | POST | x-lc-address header | iOS |
| `/api/v1/notifications/read-all` | POST | x-lc-address header | iOS |

### Invites

| Endpoint | Method | Auth | Used By |
|---|---|---|---|
| `/api/invites` | GET/POST | Wallet sig | Web (create page) |

### Database

- **ORM:** Direct PostgreSQL via `pg` library (no Prisma/Drizzle)
- **Connection:** Singleton pool via `offchain/db/pool.ts`
- **Schema:** SQL migrations in `db/migrations/`
- **Core tables:** challenges, participants, evidence, verdicts, claims, aivm_jobs, notifications, challenge_invites, reminders

---

## 8. SYSTEM INCONSISTENCIES

### Confirmed Inconsistencies

| Issue | iOS | Web | Backend |
|---|---|---|---|
| **`distance` metric** | Queries running workouts only | Uses server value | Aggregates all distance types |
| **Notification display** | Full activity inbox with read/unread | **No notification UI** | Full API + backend workers |
| **Progress source** | `max(HealthKit, server)` | Server only | Evidence DB rows |
| **Gaming participation** | Desktop handoff only | Full participation | Full pipeline |
| **APNs push** | Token registered, **not wired** | N/A | Notifications stored but not pushed |
| **Invite processing** | N/A | UI queues invites | **No worker processes them** |

### Display State Derivation Differences

**iOS** derives display state from timeline + verdict fields in `Challenge.statusLabel(meta:)`.

**Web** derives display state from `computePublicStatus()` which reads on-chain status + snapshot + timeline. The two derivation functions use **different logic paths** and may produce different labels for edge cases (e.g., "Evaluating" vs "Verifying" timing windows).

### Inconsistency: Fee Snapshot Visibility

Fees are snapshotted per-challenge at creation time on-chain but **not stored in the database**. Off-chain systems must reconstruct fee terms from chain events. No API exposes fee terms to the user before joining.

---

## 9. RISK AREAS (Do Not Change Without Care)

### Critical (Fund-Affecting)

| Risk | Location | Impact |
|---|---|---|
| **`finalize()` is irreversible** | `ChallengePay.sol:834` | Once called, outcome is permanent. No undo. |
| **`_snapshotAndBook()` grants Treasury allowances** | `ChallengePay.sol:861` | Miscalculation = wrong fund distribution |
| **Claim functions move real ETH** | `ChallengePay.sol:933-994` → `Treasury.sol:233-293` | Direct ETH transfers to users |
| **Admin can `pauseAll()`** | `ChallengePay.sol:121` | Global kill switch for all operations |
| **OPERATOR_ROLE on Treasury** | `Treasury.sol:164` | ChallengePay has operator access to ALL buckets |

### High (State-Breaking)

| Risk | Location | Impact |
|---|---|---|
| **Dispatcher can batch-submit proofs** | `ChallengePay.sol:786` | No rate limit; DoS vector |
| **Verifier address not validated** | `ChallengePay.sol:551` | Setting wrong verifier = no proofs can pass |
| **EventChallengeRouter silent try-catch** | `EventChallengeRouter.sol:139` | Proof failure invisible; finalize proceeds |
| **AIVM Indexer drives proof pipeline** | `offchain/indexers/aivmIndexer.ts` | If indexer stops, no proofs get finalized |
| **evidenceEvaluator creates verdicts** | `offchain/workers/evidenceEvaluator.ts` | If evaluator miscalculates, wrong pass/fail |

### Medium (AIVM-Coupled)

| Risk | Location | Impact |
|---|---|---|
| **AIVM quorum can change** | `ChallengePayAivmPoiVerifier.sol:127` | Retroactive quorum change affects proof validity |
| **Reorg recovery limited to 12 blocks** | `aivmIndexer.ts` | Deeper reorgs need manual intervention |
| **recordBinding links challenge↔AIVM** | `ChallengeTaskRegistry.sol:59` | Wrong binding = proofs never validate |

---

## 10. FINAL SUMMARY

### What Is Actually Working

- **Full challenge lifecycle**: create → join → track → prove → finalize → claim (on-chain + off-chain)
- **iOS fitness challenges**: End-to-end with Apple HealthKit, auto-proof submission, real claims
- **Web fitness + gaming challenges**: Full participation with provider OAuth
- **Notification system**: 18 types, backend-triggered, stored in DB, displayed on iOS
- **Progress tracking**: Dual-source (HealthKit + server) on iOS, server-only on web
- **AIVM verification pipeline**: Orchestrator → indexer → proof dispatch → on-chain verification
- **Leaderboard, achievements, reputation**: All backed by real API data

### What Is Placeholder or Incomplete

| Item | Status |
|---|---|
| **Invite processing** | UI + DB table exist, NO worker processes queued invites, NO email delivery |
| **Web notifications** | API works, NO UI component displays them |
| **APNs push** | Token registered on device, backend delivery NOT wired |
| **TrustedForwarder (gasless tx)** | Deployed, NOT configured (dormant) |
| **AivmProofVerifier (Path A)** | Deployed, confirmed INACTIVE — no callers |

### What Is Inconsistent

| Item | Details |
|---|---|
| **`distance` metric** | iOS = running only; backend = all distances |
| **Display state derivation** | iOS and web use different derivation logic |
| **Notification availability** | iOS has full inbox; web has none |
| **Progress computation** | iOS = max(local, server); web = server only |

### What Is Dangerous to Change

1. **`ChallengePay.finalize()` + `_snapshotAndBook()`** — Fund distribution math. Any change requires full audit.
2. **Treasury grant/claim flow** — Real ETH movement. Never change without testing against existing allowances.
3. **AIVM indexer event processing** — Drives the entire proof pipeline. Downtime = stuck challenges.
4. **Proof verification chain** (`ChallengePayAivmPoiVerifier` → `ChallengeTaskRegistry` → `AIVMInferenceV2`) — Cryptographic binding. Any break = all proofs fail.
5. **Fee snapshot logic** — Fees captured at creation time. Changing calculation affects all future challenges.
6. **`participants` upsert logic** — Used by both join and evidence flows. Changing constraints can break recording.
