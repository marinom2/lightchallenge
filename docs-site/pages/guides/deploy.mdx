# Deployment Guide

Full step-by-step guide for deploying LightChallenge on the Lightchain testnet (chain ID 504).

---

## Overview

### Contracts we own and deploy

| Contract | Deploy Script | Purpose |
|---|---|---|
| `Treasury` | `00_deploy_treasury.ts` | Protocol treasury: operator staking, fund distribution |
| `MetadataRegistry` | `02_deploy_metadata_registry.ts` | Off-chain metadata URI storage |
| `ChallengeTaskRegistry` + `ChallengePayAivmPoiVerifier` | `05_deploy_aivm_verifier.ts` | AIVM task binding + PoI verification adapter |
| `EventChallengeRouter` | `08_deploy_event_router.ts` | Event-driven challenge creation (admin-only, not on core product path) |
| `ChallengePay` | `09_deploy_challengepay.ts` | Core challenge lifecycle |
| `ChallengeAchievement` | `11_deploy_achievement.ts` | Soulbound ERC-721 + ERC-5192 achievement NFTs (read-only ChallengePay dependency) |
| `TrustedForwarder` | `10_deployTrustedForwarder.ts` | EIP-2771 gasless relay (dormant — deployed but not activated; relay disabled by default) |

### Lightchain AIVM contracts (deployed from Lightchain source code)

| Contract | Address (testnet) | Deployed by | Notes |
|---|---|---|---|
| `AIVMInferenceV2` | `0x2d499C52312ca8F0AD3B7A53248113941650bA7E` | Our wallet (`0x95A4...A217`) | Lightchain's contract code, deployed by us on testnet |
| `LCAIValidatorRegistry` | `0xB4024725f6B4Fb6C069EfdA842E05CFb2dDaEC0D` | Our wallet (`0x95A4...A217`) | Single validator registered (our wallet), poiQuorum=1 |

> **Testnet note:** These contracts use Lightchain's source code from `lightchain_references/lcai-smart-contract/` but were deployed by us because Lightchain has not yet deployed production AIVM infrastructure on testnet. For mainnet, we should use Lightchain's officially deployed contracts with their multi-validator set. The contract interfaces are identical — only the addresses will change.
>
> Lightchain workers and validators handle `commitInference`, `revealInference`, and `submitPoIAttestation`. Our app submits the AIVM request and then indexes finalization events.

---

## Prerequisites

1. Node.js 22
2. `npm install` at repo root
3. A funded deployer wallet on Lightchain testnet (chain ID 504)
4. RPC access: `https://light-testnet-rpc.lightchain.ai`
5. PostgreSQL database with `DATABASE_URL` set (Neon or self-hosted)
6. Copy `.env.example` → `webapp/.env.local` and fill in all values

---

## Environment Variables (Deploy Time)

Set these before running any deploy scripts. The Hardhat config reads from `webapp/.env.local`
automatically via dotenv:

```bash
# Deployer wallet (must be funded with LCAI for gas)
PRIVATE_KEY=0x<64-hex-chars>

# Admin wallet (can be same as deployer or a separate multisig)
ADMIN_PRIVATE_KEY=0x<64-hex-chars>
ADMIN_ADDRESS=0x<40-hex-chars>

# Use admin key for admin operations (0 = deployer, 1 = admin key)
USE_ADMIN_KEY=0

# RPC
LIGHTCHAIN_RPC=https://light-testnet-rpc.lightchain.ai

# Treasury initial operator (usually same as ADMIN_ADDRESS)
TREASURY_INITIAL_OPERATOR=0x<admin-address>

# AIVM contract address (Lightchain-deployed — do not change unless testnet resets)
AIVM_INFERENCE_V2_ADDRESS=0x2d499C52312ca8F0AD3B7A53248113941650bA7E

# MetadataRegistry signer (writes metadata URIs on-chain via ownerSet())
# Must be the MetadataRegistry owner wallet. Falls back to ADMIN_KEY if not set.
# Required for active on-chain metadata registration after challenge creation.
METADATA_REGISTRY_KEY=0x<64-hex-chars>

# Secret key for admin API endpoints (webapp server-side)
ADMIN_KEY=0x<64-hex-chars>

# 32-byte hex key for encrypting OAuth tokens at rest (openssl rand -hex 32)
OAUTH_ENCRYPTION_KEY=<64-hex-chars>
```

---

## Step 1 — Database Migration

Before deploying contracts or starting any services, apply all migrations:

```bash
npx tsx db/migrate.ts
```

This creates all required tables and records the applied migrations in `public.schema_migrations`.
Safe to re-run — already-applied files are skipped.

### How the migration system works

- Migration files live in `db/migrations/` and are named `NNN_description.sql`
- `db/migrate.ts` reads all `.sql` files in lexicographic order
- Each file is applied once; applied filenames are stored in `public.schema_migrations`
- The runner uses `ON CONFLICT DO NOTHING` — idempotent

### Competitive challenge migrations

- `018_verdicts_score_competitive.sql` — adds `score` (numeric) and `metadata` (jsonb) columns to `public.verdicts`. Required for competitive ranking in the challenge dispatcher.
- `019_seed_demo_challenges.sql` — seeds demo challenges (competitive and threshold) for testing and development. Safe to run on production (inserts only if IDs do not exist).

### Recovering from a partial migration

If a migration fails partway through:

1. Connect to the database and inspect `public.schema_migrations` to see which files were applied
2. If the failed migration left the schema in a partially applied state, manually revert the partial changes (or restore from a backup)
3. Fix the migration file
4. Re-run `npx tsx db/migrate.ts` — only the failed and subsequent files will be applied

If you applied SQL manually (bypassing the runner), record it in `schema_migrations` to keep state consistent:
```sql
INSERT INTO public.schema_migrations (filename) VALUES ('NNN_name.sql') ON CONFLICT DO NOTHING;
```

---

## Step 2 — Contract Deploy Sequence

Run from the repo root:

```bash
# 1. Treasury
npx hardhat deploy --network lightchain --tags treasury

# 2. Metadata registry
npx hardhat deploy --network lightchain --tags metadata_registry

# 3. AIVM verifier stack (ChallengeTaskRegistry + ChallengePayAivmPoiVerifier)
#    Requires: AIVM_INFERENCE_V2_ADDRESS
npx hardhat deploy --network lightchain --tags aivm_verifier

# 4. ChallengePay (core contract)
#    Requires: TREASURY_ADDR (auto-read from deployments after step 1)
npx hardhat deploy --network lightchain --tags ChallengePay

# 5. EventChallengeRouter (admin-only — optional, not needed for core product)
#    Requires: ChallengePay + MetadataRegistry deployed
npx hardhat deploy --network lightchain --tags router

# 6. ChallengeAchievement (soulbound NFTs — requires ChallengePay)
npx hardhat deploy --network lightchain --tags achievement

# 7. TrustedForwarder (dormant gasless infrastructure — optional)
FORWARDER_ARG0=0x<owner> npx hardhat deploy --network lightchain --tags forwarder
```

Or deploy everything at once (order is handled by script numbering 00→10):

```bash
npx hardhat deploy --network lightchain
```

---

## Step 3 — Sync ABIs to Webapp

After deployment, sync contract ABIs and the address manifest to `webapp/public/`:

```bash
npx tsx scripts/syncAbis.ts
```

This writes:
- `webapp/public/deployments/lightchain.json` — address manifest read by the webapp at runtime
- `webapp/public/abi/*.abi.json` — ABIs served to the frontend

**This step is required after every redeployment.** The webapp reads these files at startup.

---

## Step 4 — Admin Configuration (One-Time)

Run after initial deployment. Requires `PRIVATE_KEY` or `ADMIN_PRIVATE_KEY` with admin role.

```bash
# Set proof configuration on ChallengePay (required for AIVM challenges)
npx hardhat run scripts/ops/setProofConfig.ts --network lightchain

# Set fee configuration
npx hardhat run scripts/ops/setFeeCaps.ts --network lightchain

# Run AIVM post-deploy config (signers, allowlists)
RUN_POST_DEPLOY_CONFIG=true npx hardhat deploy --network lightchain
```

### Configure MetadataRegistry signer

The webapp writes metadata URIs to MetadataRegistry on-chain after each challenge creation. The signer must be the MetadataRegistry owner.

1. Set `METADATA_REGISTRY_KEY` in `webapp/.env.local` to the MetadataRegistry owner's private key (falls back to `ADMIN_KEY`)
2. Set `NEXT_PUBLIC_BASE_URL` to the production URL (e.g. `https://app.lightchallenge.ai`) — this is used to construct the metadata URI
3. Verify the writer is active: create a test challenge and check `registry_status` in the DB

If the registry writer is not configured, challenges still create successfully — metadata is stored in DB only and `registry_status` is set to `skipped`. Run `scripts/ops/backfillRegistry.ts` to retroactively write URIs for any challenges with `registry_status != 'success'`.

### Register the worker wallet as dispatcher

The challenge worker wallet must be registered as a dispatcher on `ChallengeTaskRegistry`
before it can call `recordBinding()`. This is automated in `scripts/deployPoiVerifierV2.ts`
when `LCAI_WORKER_PK` is set during deploy. To set it manually:

```bash
npx tsx scripts/deployPoiVerifierV2.ts
```

### Post-deploy: Set dispatcher on ChallengePay

After deploying the AIVM indexer/orchestrator, call `setDispatcher()` on ChallengePay to
authorize the finalization wallet. The dispatcher address is the wallet that calls
`submitProofFor()` via the AIVM indexer bridge. Without this, the indexer cannot submit
proofs or trigger finalization.

```bash
# Using the admin signer (must have admin role on ChallengePay)
npx hardhat run scripts/admin/setDispatcher.ts --network lightchain
```

Set the `LCAI_FINALIZE_PK` wallet address as the dispatcher. This is a one-time step after
each ChallengePay deployment, unless the finalization wallet changes.

### Post-deploy: Competitive challenge support

No contract changes are required for competitive challenges. The existing `ChallengePay`
binary outcome model (winner/loser) is used; competitive ranking is resolved off-chain
by the `challengeDispatcher` before AIVM job submission.

After deploying or upgrading, ensure the competitive migrations are applied:

```bash
npx tsx db/migrate.ts
```

This applies `018_verdicts_score_competitive.sql` (adds `score` + `metadata` columns to
verdicts) and `019_seed_demo_challenges.sql` (seeds demo challenges). Both are idempotent.

Competitive challenge templates are defined in two places:
- **Code-side:** `webapp/lib/templates.ts` — provides `paramsBuilder` and `ruleBuilder` functions. Templates with `rule.mode === "competitive"` are detected automatically.
- **DB-side:** `017_expanded_models_templates.sql` — seeds `public.challenge_templates` with display metadata.

The `lib/templateRegistry.ts` merge strategy ensures code-side builders are preserved
even when DB template records are modified via the admin panel.

---

## Step 5 — Webapp Runtime Environment

Once contracts are deployed, configure `webapp/.env.local` for the Next.js app and off-chain workers:

```bash
# Chain
NEXT_PUBLIC_CHAIN_ID=504
NEXT_PUBLIC_RPC_URL=https://light-testnet-rpc.lightchain.ai
NEXT_PUBLIC_EXPLORER_URL=https://testnet.lightscan.app
NEXT_PUBLIC_NATIVE_SYMBOL=LCAI

# Contract addresses (auto-read from public/deployments/lightchain.json)
# Set these only to override the deployment artifact:
# NEXT_PUBLIC_CHALLENGEPAY_ADDR=0x...
# NEXT_PUBLIC_TREASURY_ADDR=0x...

# AIVM
AIVM_INFERENCE_V2_ADDRESS=0x2d499C52312ca8F0AD3B7A53248113941650bA7E
AIVM_TASK_REGISTRY_ADDRESS=0x...        # from deployments after step 4 above
AIVM_REQUEST_FEE_WEI=1000000000000000   # 0.001 LCAI

# Worker wallet (submits AIVM requests)
LCAI_WORKER_PK=0x...

# Finalization key (can be same as worker)
LCAI_FINALIZE_PK=0x...

# MetadataRegistry signer (must be registry owner; falls back to ADMIN_KEY)
METADATA_REGISTRY_KEY=0x...

# Database
DATABASE_URL=postgresql://...

# External APIs
STEAM_WEBAPI_KEY=...
OPENDOTA_KEY=...
RIOT_API_KEY=...

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

See `.env.example` at the repo root for a full annotated list.

---

## Step 6 — Start Off-Chain Services

```bash
# Run each in a separate terminal or process manager
npx tsx offchain/workers/evidenceCollector.ts
npx tsx offchain/workers/evidenceEvaluator.ts
npx tsx offchain/dispatchers/challengeDispatcher.ts
npx tsx offchain/workers/challengeWorker.ts
npx tsx offchain/indexers/aivmIndexer.ts
npx tsx offchain/indexers/claimsIndexer.ts
npx tsx offchain/indexers/statusIndexer.ts

# Webapp
cd webapp && npm run build && npm start
```

See [OPERATIONS.md](OPERATIONS.md) for full environment variable reference and troubleshooting.

---

## Verify Deployment

```bash
# Inspect a challenge on-chain
npx tsx scripts/ops/getChallenge.ts <id>

# Check AIVM job statuses
# (requires DATABASE_URL set in env)
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('SELECT challenge_id, status, attempts FROM public.aivm_jobs ORDER BY updated_at DESC LIMIT 10')
  .then(r => { r.rows.forEach(row => console.log(row)); pool.end(); });
"

# Check RPC health
npx tsx scripts/ops/rpcHealth.ts
```

---

## Archived / Optional Contracts

The following contracts have been removed from compilation and moved to `.attic/contracts_archive/`.
Their deploy scripts are in `scripts/_archive_deploy/`.

| Contract | Reason Archived |
|---|---|
| `ZkProofVerifier` + `PlonkVerifier` + `PlonkProofVerifierAdapter` + `IPlonkVerifier` | ZK/Plonk proof path; not used in AIVM PoI flow |
| `MultiSigProofVerifier` | M-of-N attestation; separate from AIVM PoI path |
| `AutoApprovalStrategy` + `IApprovalStrategy` | Policy-based auto-approval; replaced by `useCreatorAllowlist` on ChallengePay V1 |

These contracts are **not part of the active product architecture** and are no longer compiled.
They are retained in `.attic/` for historical reference only.

### Legacy compatibility policy

- **Active product path:** Lightchain AIVM + PoI (Proof of Inference)
- **Active model kinds:** `aivm` and `custom`
- **Legacy model kinds:** `zk` and `plonk` — may exist in the DB (migration 007 seed data) but must not be used for new models, new admin UX, or new product flows
- **Legacy DB fields:** `plonk_verifier` column in `public.models` — retained for backward compatibility; no active readers or writers
- **Legacy contracts:** `ZkProofVerifier`, `PlonkVerifier`, `PlonkProofVerifierAdapter`, `MultiSigProofVerifier` — deployed on testnet but not used by any active product flow
- **Legacy scripts:** `scripts/zk/`, `scripts/ops/zk/`, `scripts/ops/submitResultZK.ts` — operational tools for the legacy ZK path; not used in production

Legacy concepts must not be reintroduced into admin UX, product documentation, or new
engineering work unless explicitly reactivated by a product decision.

---

## Production Security Notes

1. **Private keys** — `LCAI_WORKER_PK`, `LCAI_FINALIZE_PK`, `METADATA_REGISTRY_KEY`, `PRIVATE_KEY` must never be committed. Use a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) in production.

2. **Database credentials** — `DATABASE_URL` contains the full connection string including password. Store in the secrets manager and inject at runtime; never in source code or deployment artifacts.

3. **OAuth tokens** — `access_token` and `refresh_token` in `public.linked_accounts` are stored in plaintext. Encrypt them at the application layer before writing, or use column-level encryption (e.g. `pgcrypto`), before going to production.

4. **Admin keys** — `ADMIN_PRIVATE_KEY` has admin role on deployed contracts. Use a hardware wallet or multisig for production deployments.

5. **RPC access** — Use a dedicated RPC endpoint with rate limiting and access controls. The public testnet RPC is not suitable for high-volume production use.

6. **SSL** — All database connections use `ssl: { rejectUnauthorized: false }` for Neon's managed TLS. In a self-hosted PostgreSQL setup, use `verify-full` with a trusted CA.

---

## Rollback

All contracts are immutable once deployed. To roll back to a previous deployment:

1. Delete the relevant JSON files from `deployments/lightchain/`
2. Re-run the deploy scripts — they check for existing deployments before re-deploying
3. Force re-deploy `ChallengePay` with `REDEPLOY_CHALLENGEPAY=1` if needed
   **Warning:** this is destructive — all on-chain state (challenges, stakes) is lost on the old contract
4. Force re-deploy `ChallengeAchievement` with `REDEPLOY_ACHIEVEMENT=1` if needed
   **Warning:** all minted achievement tokens are lost on the old contract

For the webapp only (no contract change), point `NEXT_PUBLIC_CHALLENGEPAY_ADDR` at the previous
contract address and re-run `npm run build`.

Database schema changes (migrations) are forward-only. Rollback requires a database restore from backup.

---

## Step 7 — Off-chain Workers (PM2)

All off-chain workers (evidence collection, evaluation, AIVM dispatch, indexing) run via PM2.

### First-time setup

```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start all workers
pm2 start ecosystem.config.cjs

# Save process list for auto-restart
pm2 save
```

### Auto-start on boot (macOS)

```bash
# Install launchd startup hook (requires sudo)
sudo env PATH=$PATH:/opt/homebrew/bin \
  $(which pm2) startup launchd -u $(whoami) --hp $HOME

# Save current processes so PM2 restores them on boot
pm2 save
```

### After contract redeployment

When contract addresses change, update `webapp/.env.local` and restart workers:

```bash
pm2 restart all --update-env && pm2 save
```

See `OPERATIONS.md` §24 for full PM2 reference (worker list, troubleshooting, logs).
