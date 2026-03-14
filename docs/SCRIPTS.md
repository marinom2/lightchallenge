# Scripts Reference

All Hardhat scripts default to `--network lightchain`. Override with `--network <net>` when needed.
Ensure `webapp/.env.local` is configured before running any script (see `.env.example`).

---

## Deploy & Build

```bash
# Compile all contracts
npx hardhat compile

# Deploy all contracts (ordered by script numbering 00→11)
npx hardhat deploy --network lightchain

# Deploy individual contracts
npx hardhat deploy --network lightchain --tags treasury
npx hardhat deploy --network lightchain --tags metadata_registry
npx hardhat deploy --network lightchain --tags aivm_verifier
npx hardhat deploy --network lightchain --tags ChallengePay
npx hardhat deploy --network lightchain --tags achievement
npx hardhat deploy --network lightchain --tags router
npx hardhat deploy --network lightchain --tags forwarder

# Sync ABIs + addresses to webapp
npx tsx scripts/syncAbis.ts
npx tsx scripts/admin/sync-webapp-deployments.ts

# Deploy PoI verifier + register dispatcher
npx tsx scripts/deployPoiVerifierV2.ts
```

See [DEPLOY.md](../DEPLOY.md) for the full deployment guide.

---

## Admin Configuration

```bash
# Accept admin on ChallengePay (after deploy with 2-step transfer)
npx tsx scripts/admin/acceptAdmin.ts

# Set admin address
npx tsx scripts/admin/setAdmin.ts

# Set fee configuration
npx tsx scripts/admin/setFeeConfig.ts

# Set proof verification config
npx tsx scripts/admin/setProofConfig.ts
# Also: npx tsx scripts/ops/setProofConfig.ts

# Set fee caps
npx tsx scripts/ops/setFeeCaps.ts

# Set trusted forwarder
npx tsx scripts/admin/set-forwarder.ts

# Set protocol address
npx tsx scripts/admin/setProtocol.ts

# View/manage roles (admin, operator, dispatcher)
npx tsx scripts/admin/roles.ts

# Set challenge metadata
npx tsx scripts/admin/setChallengeMeta.ts
```

### Event Router (admin-only)

```bash
# Register a new event
npx tsx scripts/admin/registerEvent.ts

# Add outcome to event
npx tsx scripts/admin/addOutcome.ts

# Set event metadata URI
npx tsx scripts/admin/setEventURI.ts

# Finalize event outcome
npx tsx scripts/ops/finalizeEvent.ts
```

---

## Challenge Lifecycle

```bash
# Inspect a challenge (on-chain state)
npx tsx scripts/ops/getChallenge.ts <id>
# Env: CH_ID=<id>

# Get challenge metadata (from DB)
npx tsx scripts/ops/getChallengeMeta.ts <id>

# Join a challenge
npx tsx scripts/ops/join.ts
# Env: CH_ID, AMOUNT

# Place a bet
npx tsx scripts/ops/bet.ts
# Env: CH_ID, SIDE=success|fail, AMOUNT

# Finalize a challenge (after proof deadline)
npx tsx scripts/ops/finalize.ts <id>
# Env: CH_ID

# Set verifier on a challenge
npx tsx scripts/ops/setChallengeVerifier.ts
# Env: CH_ID, VERIFIER

# Preview payout distribution
npx tsx scripts/ops/payoutPreview.ts <id>

# Check my payout for a challenge
npx tsx scripts/ops/myPayout.ts
# Env: ADDR, CH_ID
```

---

## Claims

```bash
# Claim winner reward (principal + bonus)
npx tsx scripts/ops/claimWinner.ts
# Env: CH_ID

# Claim loser cashback
npx tsx scripts/ops/claimLoserCashback.ts
# Env: CH_ID

# Claim bettor reward
npx tsx scripts/ops/claimBettor.ts
# Env: CH_ID
```

---

## Inspection & Debugging

```bash
# List all challenges
npx tsx scripts/inspect/listChallenges.ts

# Challenge status
npx tsx scripts/inspect/status.ts
# Env: CH_ID

# Get finalization snapshot
npx tsx scripts/inspect/getSnapshot.ts
# Env: CH_ID

# Get proof config
npx tsx scripts/inspect/get_proof_config.ts

# Print challenge status details
npx tsx scripts/inspect/print_status.ts
# Env: CH_ID

# Check deployed contracts
npx tsx scripts/inspect/CheckDeployments.ts

# Dota player profile lookup
npx tsx scripts/inspect/dotaProfileAndStats.ts
# Env: STEAM64

# Export challenge data
npx tsx scripts/inspect/export-and-save.mjs
# Env: CH_ID

# My payout inspector
npx tsx scripts/inspect/myPayout.ts
# Env: ADDR, CH_ID
```

---

## Operations & Maintenance

```bash
# RPC health check
npx tsx scripts/ops/rpcHealth.ts

# Check wallet balance
npx tsx scripts/ops/checkBalance.ts

# Check recent blocks
npx tsx scripts/ops/checkBlocks.ts

# Get latest challenge ID
npx tsx scripts/ops/latestId.ts

# Decode a revert reason
npx tsx scripts/ops/decodeRevert.ts
# Env: TX_HASH

# Decode revert at specific block
npx tsx scripts/ops/decodeRevertAtBlock.ts
# Env: TX_HASH, BLOCK

# Normalize deployment artifacts
npx tsx scripts/ops/normalizeDeployments.ts
```

### Database & Indexer Maintenance

```bash
# Run database migrations
npx tsx db/migrate.ts

# Seed status indexer checkpoint (one-time, first deploy)
npx tsx scripts/ops/seedStatusIndexer.ts

# Backfill chain_outcome for finalized challenges
npx tsx scripts/ops/backfillChainOutcome.ts

# Cancel stale AIVM jobs for terminal challenges
npx tsx scripts/ops/cancelTerminalJobs.ts

# Backfill MetadataRegistry writes
npx tsx scripts/ops/backfillRegistry.ts

# Reconcile DB with on-chain state
npx tsx scripts/ops/reconcileDemo.ts
```

### AIVM & Proof

```bash
# Run AIVM job for a specific challenge
npx tsx offchain/runners/runChallengePayAivmJob.ts <challengeId>

# Check mock proof verification
npx tsx scripts/ops/checkMockProof.ts

# Set mock approval (testing)
npx tsx scripts/ops/setMockApproval.ts
```

---

## Contract Verification

```bash
# Verify all contracts on explorer
npx tsx scripts/verify/verify-all.ts
```

---

## Tests

```bash
# Run all contract tests
npx hardhat test

# TypeScript type checking
npx tsc --noEmit                    # root (contracts, offchain, scripts)
cd webapp && npx tsc --noEmit       # webapp
```

---

## Off-chain Workers

See [OPERATIONS.md](../OPERATIONS.md) for full worker documentation.

```bash
npx tsx offchain/workers/evidenceCollector.ts       # provider APIs -> evidence
npx tsx offchain/workers/evidenceEvaluator.ts       # evidence -> verdicts
npx tsx offchain/dispatchers/challengeDispatcher.ts  # verdicts -> AIVM queue
npx tsx offchain/workers/challengeWorker.ts          # AIVM queue -> on-chain requests
npx tsx offchain/indexers/aivmIndexer.ts             # AIVM events -> finalization
npx tsx offchain/indexers/statusIndexer.ts           # status events -> DB sync
npx tsx offchain/indexers/claimsIndexer.ts           # claim events -> DB sync
```

---

## Common Environment Variables

| Variable | Purpose |
|---|---|
| `PRIVATE_KEY` | Default signer (deployer wallet) |
| `ADMIN_PRIVATE_KEY` | Admin signer |
| `LCAI_WORKER_PK` | Worker wallet (AIVM requests) |
| `LCAI_FINALIZE_PK` | Finalization wallet (proof + finalize) |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_RPC_URL` | Lightchain testnet RPC |
| `CH_ID` | Challenge ID (used by most ops scripts) |

See `.env.example` for the complete reference.
