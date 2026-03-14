# LightChallenge

A stake-weighted, permissionless challenge protocol built on the [Lightchain](https://lightchain.ai) testnet (chain ID 504). Participants create challenges backed by on-chain stakes, submit activity or gaming evidence off-chain, and earn rewards when an AI model verifies their performance.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  webapp/ (Next.js 14)                                               │
│  • Challenge creation, evidence upload, claims UI                    │
│  • Wallet connection (Wagmi + WalletConnect)                         │
│  • Server-side API routes under webapp/app/api/                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP + on-chain reads/writes
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SMART CONTRACTS                              │
│  Lightchain testnet (chain ID 504)                                   │
│  • ChallengePay.sol        — challenge lifecycle, stakes, payouts    │
│  • ChallengeTaskRegistry   — binds challenges to AIVM task IDs       │
│  • ChallengePayAivmPoiVerifier — AIVM PoI adapter (main verifier)   │
│  • ChallengeAchievement   — soulbound ERC-721 + ERC-5192 NFTs       │
│  • Treasury.sol            — DAO treasury                            │
│  • MetadataRegistry.sol    — on-chain metadata URI pointers (write-once) │
│  • TrustedForwarder.sol    — EIP-2771 gasless transactions           │
│  • AIVMInferenceV2         — Lightchain-owned AIVM contract          │
└───────────────────┬────────────────────────┬────────────────────────┘
                    │ requestInferenceV2      │ InferenceFinalized event
                    ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         OFFCHAIN PIPELINE                            │
│                                                                      │
│  Evidence intake                                                     │
│  evidenceCollector  ──→  public.evidence                            │
│  (polls linked_accounts, fetches from provider APIs)                │
│                                                                      │
│  Evaluation                                                          │
│  evidenceEvaluator  ──→  public.verdicts                            │
│  (fitnessEvaluator / gamingEvaluator per provider)                  │
│                                                                      │
│  AIVM dispatch                                                       │
│  challengeDispatcher ─→  public.aivm_jobs (queued)                  │
│  challengeWorker    ──→  requestInferenceV2 on-chain                 │
│                                                                      │
│  Finalization                                                        │
│  aivmIndexer  ─────→  watches AIVMInferenceV2 events                │
│                         → submitProofFor + ChallengePay.finalize()   │
│                                                                      │
│  Claims                                                              │
│  claimsIndexer ────→  watches ChallengePay *Claimed events          │
│                         → public.claims                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           DATABASE                                   │
│  PostgreSQL (Neon)                                                   │
│  challenges · participants · evidence · verdicts · claims            │
│  aivm_jobs · models · linked_accounts · identity_bindings            │
│  challenge_templates · challenge_invites · reminders · indexer_state │
│  achievement_mints · reputation                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### webapp/
Next.js 14 full-stack application. Contains both the React frontend and server-side API routes.

- `webapp/app/` — Next.js app router (pages + API routes)
- `webapp/lib/` — shared utilities, contract bindings, lifecycle resolver, template registry
- `webapp/public/deployments/` — contract address manifest (written by `scripts/syncAbis.ts`)
- `webapp/public/abi/` — contract ABIs served to the frontend

**Key page modules:**

| Page | Route | Path | Data sources |
|---|---|---|---|
| Explore | `/explore` | `app/explore/` | `/api/dashboard` (on-chain) + `/api/challenges` (DB meta) |
| Challenge detail | `/challenge/[id]` | `app/challenge/[id]/` | `/api/challenges/meta/{id}` (fast DB) + `/api/challenge/{id}` (slow RPC) |
| My Challenges | `/me/challenges` | `app/me/challenges/` | `/api/me/challenges` + `/api/challenges/meta/{id}` per row |
| Claims | `/claims` | `app/claims/` | `/api/me/challenges` + `/api/challenges/meta/{id}` per row |
| Submit Proof | `/proofs` | `app/proofs/` | `/api/me/challenges` + lifecycle resolver |
| Create Challenge | `/challenges/create` | `app/challenges/create/` | Template registry + contract policy hints |
| Achievements | `/me/achievements` | `app/me/achievements/` | `/api/me/achievements` + `/api/me/reputation` |

> **Route rename:** `/validators` was renamed to `/proofs` — users submit proofs, they are not validators. A middleware redirect preserves backward compatibility for old links.

**Admin Console** (`app/admin/`):

Modular admin area for protocol governance, treasury management, and AIVM model/template catalog administration. Requires wallet connection and on-chain admin role.

| Directory | Contents |
|---|---|
| `app/admin/page.tsx` | Shell: wallet guard, tab router, contract reads |
| `app/admin/panels/` | 9 panel modules: Governance, Fees, Proof Verification, Validators, Tokens, Challenges, Treasury, Roles, Models & Templates |
| `app/admin/components/ui.tsx` | Shared UI atoms: Chrome, Hero, Tabs, Panel, Card, Field, Toast, Busy, seg |
| `app/admin/lib/utils.ts` | Shared utilities: address helpers, hash functions, JSON parsing |
| `app/api/admin/models/` | GET/PUT for `public.models` — AIVM model catalog (DB-backed, atomic replace) |
| `app/api/admin/templates/` | GET/PUT for `public.challenge_templates` — challenge creation templates (DB-backed, atomic replace) |

**Models** define AIVM inference tasks. Each model maps to a Lightchain AIVM task via its modelHash (`keccak256(modelId)`). The PoI verifier (`ChallengePayAivmPoiVerifier`) handles on-chain proof verification for all AIVM models. Model kinds: `aivm` (primary, auto-configured) and `custom` (manual configuration).

**Templates** define the challenge creation form for each activity type (fitness: steps/running/cycling/hiking/swimming; gaming: dota/lol/cs). Templates have a dual-source system: code-side definitions in `lib/templates.ts` provide `paramsBuilder` and `ruleBuilder` functions, while DB records (managed via admin) override display fields. The `lib/templateRegistry.ts` merge strategy preserves code-side builders even when DB values are modified.

**Challenge detail modular structure** (`app/challenge/[id]/`):
- `page.tsx` — page component (~1970 lines: state, effects, callbacks, JSX layout)
- `lib/types.ts` — re-exports canonical `Status` from `lib/types/status`, defines ApiOut, SnapshotOut, TabKey
- `lib/utils.ts` — fetchJson, anySignal, parsing helpers
- `lib/decoders.ts` — decodeSnapshot, decodeChallenge, normalizeApi (positional struct fallbacks matching Solidity layout)
- `lib/formatters.tsx` — display formatters (delegates to shared `lib/formatLCAI` and `lib/formatTime`)
- `lib/PrimaryActionResolver.ts` — resolves primary CTA for challenge state
- `hooks/usePullToRefresh.ts` — mobile pull-to-refresh
- `hooks/useHaptics.ts` — haptic feedback
- `components/Skeletons.tsx` — loading skeletons
- `components/HeroSection.tsx` — StatusCapsule, DetailsRibbon, HeroMetricsRow, HeroProgress
- `components/DetailPanels.tsx` — CollapsiblePanel, PhaseStory, ActionRow, TabBar, DLGrid, Metric, SectionPanel, ChainTimeline
- `components/ActionCards.tsx` — PrimaryActionCard, JoinCard
- `components/AchievementClaim.tsx` — soulbound achievement minting (completion + victory)
- `components/ChallengeLayout.tsx` — responsive desktop/mobile layout switcher

**Shared libraries** (`webapp/lib/`):

| Module | Purpose | Consumers |
|---|---|---|
| `lib/types/status.ts` | Canonical `Status` type + `STATUS_LABEL` | explore, challenge/[id], me/challenges |
| `lib/formatLCAI.ts` | `formatLCAI` (full) + `formatLCAIShort` (compact) | explore cards/table, challenge/[id], claims |
| `lib/formatTime.ts` | `timeAgo`, `timeAgoAbs`, `prettyCountdown` | challenge/[id], claims |
| `lib/challenges/lifecycle.ts` | Lifecycle state machine — single source of truth | me/challenges, claims, proofs |
| `lib/ui/toast.tsx` | Toast notification system | 10+ pages |
| `lib/ui/useInterval.ts` | Polling hook | explore |
| `lib/contracts.ts` | ABI imports + deployed addresses | all pages |

**Component ownership:**

| Location | Scope | Examples |
|---|---|---|
| `app/components/` | True shared (2+ consumers) | Navbar, ThemeProvider, GlassIcon, DotaCard |
| `app/{page}/components/` | Page-local | ChallengeCard (explore), ProofChallengeCard (proofs) |
| `lib/ui/` | Shared UI primitives | toast, useInterval |

> **Convention:** A component belongs in `app/components/` only if it has 2+ consumers across different pages. Single-consumer components must live in their page directory.

**Metadata source-of-truth:** Challenge titles and descriptions come from the DB (`public.challenges` via `/api/challenges/meta/{id}`), which is fast (~100-300ms). On-chain data via `/api/challenge/{id}` (5-15s RPC) is secondary. The `normalizeApi` function merges both with `||` precedence (API title wins if non-empty, else DB meta). The Explore page and challenge detail page both use a "fast-meta-first" pattern: show DB title immediately, then enrich with chain data when it arrives.

### offchain/
TypeScript off-chain services. All run as long-lived Node.js processes.

| Service | File | Role |
|---|---|---|
| Evidence collector | `offchain/workers/evidenceCollector.ts` | Polls provider APIs, stores evidence in DB |
| Evidence evaluator | `offchain/workers/evidenceEvaluator.ts` | Evaluates evidence against challenge rules, writes verdicts |
| Challenge dispatcher | `offchain/dispatchers/challengeDispatcher.ts` | Queues approved challenges with verdicts into AIVM job queue |
| Challenge worker | `offchain/workers/challengeWorker.ts` | Submits AIVM inference requests on-chain |
| AIVM indexer | `offchain/indexers/aivmIndexer.ts` | Indexes Lightchain events, drives finalization bridge |
| Status indexer | `offchain/indexers/statusIndexer.ts` | Syncs ChallengePay status events to `public.challenges` |
| Claims indexer | `offchain/indexers/claimsIndexer.ts` | Indexes claim events into `public.claims` |

### contracts/
Solidity smart contracts (Hardhat).

| Contract | Status | Purpose |
|---|---|---|
| `ChallengePay.sol` | Active | Core protocol: challenge lifecycle, staking, payouts |
| `ChallengeTaskRegistry.sol` | Active | Binds challenges to AIVM task IDs |
| `ChallengePayAivmPoiVerifier.sol` | Active | AIVM PoI verification adapter |
| `Treasury.sol` | Active | DAO treasury |
| `ChallengeAchievement.sol` | Active | Soulbound ERC-721 + ERC-5192 achievement NFTs — claim-based minting verified by ChallengePay |
| `MetadataRegistry.sol` | Active | On-chain metadata URI pointer (write-once by default, system-managed) |
| `TrustedForwarder.sol` | Dormant | EIP-2771 gasless relay — deployed but not activated; relay disabled by default |
| `EventChallengeRouter.sol` | Admin-only | Multi-outcome event routing — admin scripts only, not on user-facing product path |
| `AivmProofVerifier.sol` | Archived | Moved to `.attic/contracts_archive/`; EIP-712 trusted-signer verifier, not part of active product |
| `AutoApprovalStrategy.sol` | Archived | Moved to `.attic/contracts_archive/`; replaced by `useCreatorAllowlist` in ChallengePay V1 |
| `MultiSigProofVerifier.sol` | Archived | Moved to `.attic/contracts_archive/`; M-of-N attestation, not used |
| `PlonkVerifier.sol` + `ZkProofVerifier.sol` | Archived | Moved to `.attic/contracts_archive/`; ZK/Plonk path, not used |

### db/
PostgreSQL schema and migration runner.

- `db/migrations/` — numbered SQL migration files (`001_` through `020_`)
- `db/migrate.ts` — idempotent migration runner; tracks applied files in `schema_migrations`
- `offchain/db/` — TypeScript service modules for each table

See [db/DATABASE.md](db/DATABASE.md) for full schema documentation.

---

## Core Concepts

### Challenges
A challenge is created on-chain via `ChallengePay.sol`. The creator stakes native tokens (LCAI on testnet) and defines:
- Activity rules (e.g. "run 50km in 7 days") encoded as a proof params object
- Timeline: `start` and `end` Unix timestamps
- An AIVM model ID (e.g. `strava.distance_in_window@1`) that will verify the result

### Challenge Types

The system supports two challenge evaluation modes:

**Threshold challenges** — a participant must meet a specific condition to pass. The evaluator checks the evidence against the rule and produces a binary pass/fail verdict. Examples: "walk 10,000 steps per day for 7 days", "run 50km in a week", "win 5 FACEIT matches".

**Competitive challenges** — participants are ranked by a numeric score and the top-N are marked as winners. The dispatcher waits until the proof deadline passes (all evidence is collected), ranks all participants by score descending, and breaks ties by earliest evidence submission timestamp. The top-N participants receive `pass=true` verdicts; the rest receive `pass=false`. Examples: "most steps in a week (top 3 win)", "most kills in ranked Dota matches", "farthest distance run".

Both types use the same on-chain contract (`ChallengePay`) which operates on binary winner/loser outcomes. Competitive ranking is resolved off-chain by the challenge dispatcher before AIVM job submission.

### Challenge Templates

There are 20 code-side templates defined in `webapp/lib/templates.ts`:

| Category | Count | Templates |
|---|---|---|
| Fitness | 8 | Steps (daily threshold), Steps (competitive), Running distance, Distance (competitive), Cycling distance, Hiking elevation, Swimming laps, Active minutes threshold |
| Dota 2 | 6 | Hero kills (threshold), Private 1v1, Private 5v5, Kills (competitive), Win streak, Match wins |
| League of Legends | 3 | Win rate (threshold), Kills (competitive), Match wins |
| Counter-Strike 2 | 2 | FACEIT wins (threshold), FACEIT kills (competitive) |

**Supported metrics:**
- Fitness: steps, distance (km), duration (minutes), elevation gain (m), calories, laps
- Gaming: wins, kills, assists, KDA, damage, win streak

Templates define both the UI form fields and the evaluator rule. Competitive templates include `mode: "competitive"` and `competitiveMetric` in their `ruleBuilder` output, which the evaluator uses to compute a numeric score and the dispatcher uses to detect competitive mode.

### Participants
A participant joins a challenge by calling `joinChallenge()` on-chain, staking their bond. They then submit evidence off-chain via the webapp.

### Evidence
Raw activity or gaming data submitted by a participant for a specific challenge. Stored in `public.evidence` with a provider tag (`strava`, `garmin`, `apple`, `opendota`, `riot`, `steam`).

### Verdicts
The output of evaluating evidence against a challenge's rules. One verdict per `(challenge_id, subject)`. Written by the evidence evaluator worker. Authoritative for pass/fail status.

### AIVM Jobs
When a challenge has a passing verdict, the challenge dispatcher queues an AIVM job. The challenge worker calls `requestInferenceV2` on the Lightchain `AIVMInferenceV2` contract. Lightchain's native workers then commit, reveal, and attest until quorum — our indexer watches for `InferenceFinalized` and calls `ChallengePay.finalize()`.

### Claims
After a challenge is finalized, participants can claim rewards from `ChallengePay`. Claims are persisted in `public.claims` by two paths: a UI post-transaction write and the `claimsIndexer`. See [db/DATABASE.md](db/DATABASE.md) for details.

### Achievements
Soulbound (non-transferable) ERC-721 tokens minted via `ChallengeAchievement.sol` after a challenge is finalized. Two types: **Completion** (any finalized participant) and **Victory** (winners only). Eligibility is verified on-chain by reading `ChallengePay` view functions (`getChallenge`, `contribOf`, `isWinner`). Double-mint protection via `minted[challengeId][user][type]` mapping. Achievement mints are recorded in `public.achievement_mints` and drive an off-chain reputation engine (`public.reputation`) with point-based levels (Newcomer → Challenger → Competitor → Champion → Legend).

### Metadata Architecture

Challenge metadata (title, description, rules) lives in two places:

| Layer | Role | Authoritative for |
|---|---|---|
| **DB** (`public.challenges`) | Product truth | Rendering, search, filtering — fast (~100-300ms) |
| **MetadataRegistry** (on-chain) | Canonical pointer | External/third-party discovery via `uri(contract, id)` |

**Active flow:** After challenge creation, the API route (`POST /api/challenges`) upserts metadata to the DB and then attempts `MetadataRegistry.ownerSet()` using a server-side signer (`METADATA_REGISTRY_KEY`). The on-chain write is **soft-fail** — if it fails, the challenge still exists and renders correctly from DB. Failed writes are tracked in `registry_status` and retried via `scripts/ops/backfillRegistry.ts`.

**Write-once policy:** `ownerSet()` reverts with `AlreadySet` if a URI already exists. Admin corrections use `ownerForceSet()`, which emits a distinct `MetadataForceSet` event for auditability. This prevents silent metadata overwrites.

See [OPERATIONS.md Section 13](OPERATIONS.md) for the full MetadataRegistry architecture reference.

### Evidence Sources & Account Linking

The system supports 8 evidence sources across fitness and gaming categories:

| Source | Provider | Auto-collection | Manual fallback | Account linking | Limitations |
|---|---|---|---|---|---|
| **Apple Health** | `apple` | Native iOS app (HealthKit) | ZIP upload from iPhone | None | No web API — must export from Health app |
| **Strava** | `strava` | OAuth auto-collection | JSON/CSV upload | OAuth via `/api/auth/strava` | |
| **Fitbit** | `fitbit` | OAuth auto-collection | JSON upload | OAuth via `/api/auth/fitbit` | |
| **Garmin Connect** | `garmin` | None | TCX/GPX/JSON upload | None | No public API (enterprise-only) |
| **Google Fit** | `googlefit` | None | JSON upload (Takeout) | None | API deprecated by Google in 2025 |
| **Dota 2** | `opendota` | OpenDota API | Match JSON upload | Steam OpenID | |
| **League of Legends** | `riot` | Riot API | Match JSON upload | Riot ID/PUUID in Settings | Requires `RIOT_API_KEY` |
| **Counter-Strike 2** | `faceit` | FACEIT API | Match JSON upload | Steam OpenID + FACEIT account | Only FACEIT matches — Valve has no public API |

**Account linking routes:**
- `GET /api/auth/strava?subject=0x...` — Strava OAuth; stores tokens in `public.linked_accounts`
- `GET /api/auth/fitbit?subject=0x...` — Fitbit OAuth; stores tokens in `public.linked_accounts`
- `GET /api/auth/steam?subject=0x...` — Steam OpenID; stores identity in `public.identity_bindings`
- `POST /api/accounts/link` — Stores provider IDs / OAuth tokens (general)
- `GET /api/accounts/resolve-riot?gameName=...&tagLine=...` — Resolves Riot ID to PUUID

**Auto-collection** (Strava, Fitbit, OpenDota, Riot, FACEIT): The `evidenceCollector` worker polls linked accounts and fetches fresh evidence automatically.

**Manual upload** (all sources): Users can always upload evidence files directly via `/proofs/{challengeId}`. The intake route validates file structure per-source before processing.

**Native iOS app** (`mobile/ios/`): Apple Health data is only accessible via HealthKit. The iOS app reads daily step counts and distance, submits to `/api/aivm/intake`. Deep link: `lightchallenge://challenge/{id}?subject={wallet}`.

---

## Developer Quickstart

### Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22+ | LTS recommended |
| [npm](https://www.npmjs.com/) | 10+ | Ships with Node.js 22 |
| [PostgreSQL](https://www.postgresql.org/) | 14+ | Local install or [Neon](https://neon.tech) serverless Postgres |
| [Git](https://git-scm.com/) | 2.x | |

**Optional (for contract deployment):**

| Dependency | Notes |
|---|---|
| Funded wallet on Lightchain testnet | Chain ID 504; get testnet LCAI from the Lightchain faucet |
| [Hardhat](https://hardhat.org/) | Installed as a project dependency — no global install needed |

### Install

```bash
git clone https://github.com/<org>/lightchallenge.git
cd lightchallenge

# Install root dependencies (contracts, offchain, scripts)
npm install

# Install webapp dependencies
cd webapp && npm install && cd ..
```

### Key Dependencies

**Root (contracts + offchain + scripts):**
- [Hardhat](https://hardhat.org/) `^2.26` — Solidity compilation, testing, deployment
- [ethers.js](https://docs.ethers.org/v6/) `^6.15` — Ethereum library (contract interaction)
- [OpenZeppelin Contracts](https://www.openzeppelin.com/contracts) `^5.4` — Audited Solidity building blocks
- [pg](https://node-postgres.com/) `^8.20` — PostgreSQL client
- [tsx](https://github.com/privatenumber/tsx) — TypeScript script execution
- [TypeScript](https://www.typescriptlang.org/) `^5.4`

**Webapp:**
- [Next.js](https://nextjs.org/) `14.x` — React full-stack framework
- [viem](https://viem.sh/) `^2.47` — Ethereum utility library (wallet interaction)
- [wagmi](https://wagmi.sh/) — React hooks for Ethereum
- [WalletConnect](https://walletconnect.com/) — Multi-wallet connection

### Environment Variables

```bash
cp .env.example webapp/.env.local
```

Edit `webapp/.env.local` and fill in the required values. At minimum:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_CHAIN_ID` | Yes | `504` (Lightchain testnet) |
| `NEXT_PUBLIC_RPC_URL` | Yes | `https://light-testnet-rpc.lightchain.ai` |
| `LCAI_WORKER_PK` | Yes | Private key for the off-chain worker wallet (funded with LCAI) |
| `LCAI_FINALIZE_PK` | Yes | Private key for finalization wallet (can be same as worker) |
| `AIVM_INFERENCE_V2_ADDRESS` | Yes | `0x2d499C52312ca8F0AD3B7A53248113941650bA7E` |
| `ADMIN_KEY` | Recommended | Secret for admin API endpoints |
| `OAUTH_ENCRYPTION_KEY` | Production | 32-byte hex key for encrypting OAuth tokens at rest |

See [.env.example](.env.example) for the full annotated reference with all optional variables.

### Database Setup

```bash
# Apply all migrations (idempotent — safe to re-run)
npx tsx db/migrate.ts
```

See [db/DATABASE.md](db/DATABASE.md) for full schema documentation.

### Running Locally

**Webapp (development server):**
```bash
cd webapp && npm run dev
# → http://localhost:3000
```

**Off-chain workers** (each in its own terminal):
```bash
npx tsx offchain/workers/evidenceCollector.ts       # evidence collection
npx tsx offchain/workers/evidenceEvaluator.ts       # evidence → verdicts
npx tsx offchain/dispatchers/challengeDispatcher.ts  # verdicts → AIVM queue
npx tsx offchain/workers/challengeWorker.ts         # submit AIVM requests
npx tsx offchain/indexers/aivmIndexer.ts            # index AIVM events + finalize
npx tsx offchain/indexers/statusIndexer.ts          # sync challenge status events
npx tsx offchain/indexers/claimsIndexer.ts          # index claim events
```

> The workers read from `webapp/.env.local` via dotenv. Ensure that file is present before starting them.

### Compile Contracts

```bash
npx hardhat compile
```

### Deploy Contracts

See [DEPLOY.md](DEPLOY.md) for the full deployment sequence.

---

## Scripts

Operational scripts for challenge lifecycle management, claims, proof submission, inspection, and admin configuration. See [docs/SCRIPTS.md](docs/SCRIPTS.md) for the full catalog.

Key scripts:
```bash
npx tsx scripts/ops/getChallenge.ts <id>        # inspect a challenge
npx tsx scripts/ops/finalize.ts <id>            # finalize a challenge
npx tsx scripts/ops/payoutPreview.ts <id>       # preview payout distribution
npx tsx scripts/inspect/listChallenges.ts       # list all challenges
npx tsx scripts/admin/sync-webapp-deployments.ts  # sync ABIs after deploy
```

---

## Documentation

| File | Contents |
|---|---|
| [README.md](README.md) | This file — architecture, quickstart, concepts |
| [PROTOCOL.md](PROTOCOL.md) | Protocol specification — lifecycle, fees, payouts, verification |
| [SECURITY.md](SECURITY.md) | Security policy, architecture, audit status, known limitations |
| [DEPLOY.md](DEPLOY.md) | Full contract deployment guide |
| [OPERATIONS.md](OPERATIONS.md) | Off-chain pipeline operations and runbook |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code standards, PR process |
| [db/DATABASE.md](db/DATABASE.md) | Full database schema reference |
| [docs/SCRIPTS.md](docs/SCRIPTS.md) | Catalog of all operational scripts |
| [.env.example](.env.example) | Annotated environment variable reference |

---

## Documentation Rules

These rules must be followed when contributing to this repository:

1. **Schema changes** — every new migration or column change must update [db/DATABASE.md](db/DATABASE.md) before the PR is merged.
2. **New services** — any new worker, indexer, or dispatcher must be documented in [OPERATIONS.md](OPERATIONS.md) including startup command and environment variables.
3. **Deployment changes** — any change to the deploy sequence, new contract, or post-deploy step must update [DEPLOY.md](DEPLOY.md).
4. **Architecture changes** — changes to the overall system architecture (new components, removed components, changed data flows) must update the architecture diagram and relevant sections in this README.
5. **Archived code** — code that is removed from the active pipeline must be moved to `_archive/` directories and noted in the relevant documentation as archived, with the reason.

---

## Testnet Information

| Parameter | Value |
|---|---|
| Network | Lightchain testnet |
| Chain ID | 504 |
| RPC | `https://light-testnet-rpc.lightchain.ai` |
| Explorer | `https://testnet-explorer.lightchain.ai` |
| Native token | LCAI |

Deployed contract addresses are in `webapp/public/deployments/lightchain.json` and documented in [OPERATIONS.md](OPERATIONS.md).

---

## License

This project is licensed under the [MIT License](LICENSE).
