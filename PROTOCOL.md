# LightChallenge Protocol Specification

Version: 1.0 (Pre-Production)
Network: Lightchain testnet (chain ID 504)
Core contract: `ChallengePay.sol` (Solidity 0.8.24)

---

## 1. Overview

LightChallenge is a stake-weighted, permissionless challenge protocol on the Lightchain network. Users create challenges backed by on-chain token stakes, submit real-world evidence (fitness activity, gaming results) off-chain, receive AI-powered verification through Lightchain's AIVM inference network, and claim payouts based on verified outcomes.

The protocol enforces three invariants:

1. **ChallengePay holds zero funds.** All deposits route to a bucketed Treasury contract. Claims are pull-based via Treasury allowances.
2. **Fees are snapshotted at creation time.** Fee parameters are copied into each challenge at creation and cannot be changed retroactively.
3. **Verification is pluggable and immutable per challenge.** The verifier address is set at creation and can only be tightened (not swapped) after participants join.

---

## 2. Protocol Actors

| Actor | On-chain identity | Role |
|---|---|---|
| **Creator** | `challenge.creator` | Creates a challenge, stakes tokens, receives creator fee share on finalization |
| **Participant** | Any address calling `joinChallengeNative` / `joinChallengeERC20` | Joins a challenge by staking, submits evidence off-chain, claims rewards |
| **Protocol** | `ChallengePay.protocol` (immutable) | Receives protocol fee share; absorbs rounding dust and no-winner distributable |
| **Dispatcher** | Addresses in `ChallengePay.dispatchers` mapping | Authorized off-chain service that calls `submitProofFor` / `submitProofForBatch` on behalf of participants |
| **Admin** | `ChallengePay.admin` (2-step transfer) | Protocol governance: fee config, pause, dispatcher ACL, creator allowlist, verification config |
| **AIVM** | Lightchain's `AIVMInferenceV2` contract | AI inference network: receives requests, commits/reveals results, attests via PoI quorum |
| **Treasury** | `Treasury.sol` (AccessControl) | Holds all funds in buckets; `OPERATOR_ROLE` (granted to ChallengePay) manages grants; `SWEEPER_ROLE` recovers free funds |

---

## 3. Challenge Lifecycle

### States

```
enum Status   { Active, Finalized, Canceled }
enum Outcome  { None, Success, Fail }
```

### State machine

```
                  createChallenge()
                        │
                        ▼
                     Active
                    (Outcome.None)
                   /    │    \
                  /     │     \
    cancelChallenge()   │   finalize() [after endTime + proofDeadlineTs]
         │              │         │
         ▼              │         ▼
      Canceled          │    Finalized
   (Outcome.None)       │   (Outcome.Success if winnersPool > 0,
                        │    Outcome.Fail otherwise)
                        │
              submitProofFor / submitMyProof
              [startTs..proofDeadlineTs window]
              marks winners, grows winnersPool
```

### Transition conditions

| Transition | Function | Conditions |
|---|---|---|
| -- -> Active | `createChallenge(CreateParams)` | `startTs > block.timestamp`, `duration > 0`, lead time within bounds, valid verifier, proof deadline >= end time, stake deposited to Treasury |
| Active -> Active (join) | `joinChallengeNative` / `joinChallengeERC20` / `joinChallengePermit` | `status == Active`, `block.timestamp < joinClosesTs`, participant cap not reached |
| Active -> Active (proof) | `submitMyProof` / `submitProofFor` / `submitProofForBatch` | `status == Active`, `startTs <= block.timestamp <= proofDeadlineTs`, participant has nonzero contribution, verifier returns `true` |
| Active -> Finalized | `finalize(id)` | `status == Active`, `block.timestamp >= endTime`, `block.timestamp >= proofDeadlineTs`, not already finalized |
| Active -> Canceled | `cancelChallenge(id)` | `status == Active`, caller is creator or admin, `winnersCount == 0` |

### Timing parameters

```
creation ──── joinClosesTs ──── startTs ──── endTime ──── proofDeadlineTs
   │              │                │            │               │
   │  join window │  proof window  │            │               │
   │  open        │  closed        │   open     │    open       │
   │              │                │            │  (grace)      │
   └──────────────┘                └────────────┴───────────────┘
                                   submitProof allowed
```

- `joinClosesTs`: defaults to `startTs` if zero; must be `<= startTs`
- `endTime`: `startTs + duration`
- `proofDeadlineTs`: must be `>= endTime`; defines the grace period for proof submission after challenge end
- `finalize()` requires `block.timestamp >= endTime && block.timestamp >= proofDeadlineTs`

---

## 4. Staking and Pooling

All funds are deposited into **Treasury buckets** where `bucketId = challengeId`.

### Creator stake
- Creator calls `createChallenge()` with `msg.value` (native) or ERC-20 approval
- Funds route to `ITreasury.depositETH(id)` or `ITreasury.depositERC20From(id, ...)`
- Creator's stake is added to `challenge.pool` and `challenge.contrib[creator]`
- Creator is marked as a participant

### Participant stake
- Participant calls `joinChallengeNative(id)` with `msg.value`, or `joinChallengeERC20(id, amount)`, or `joinChallengePermit(id, amount, deadline, v, r, s)`
- Funds route to the same Treasury bucket
- Added to `challenge.pool` and `challenge.contrib[participant]`
- Participant marked via `_enforceParticipantCap()`

### Pool accounting
- `challenge.pool`: sum of all contributions
- `challenge.winnersPool`: sum of contributions from addresses where `challenge.winner[addr] == true`
- `losersPool = pool - winnersPool` (computed at finalization)

### Constraints
- `minStake`: global minimum enforced at creation (admin-configurable via `setMinStake()`)
- `maxParticipants`: per-challenge cap (0 = unlimited)
- Contributions are additive: a participant can join multiple times, increasing their `contrib` and `pool`

---

## 5. Evidence and Verification Pipeline

The end-to-end path from user activity to on-chain finalization:

```
1. Evidence intake
   User uploads activity data (Strava GPS, Garmin JSON, match history)
     → POST /api/aivm/intake (multipart/form-data)
     → Adapter normalizes → public.evidence

2. Evaluation
   evidenceEvaluator worker polls public.evidence
     → fitnessEvaluator or gamingEvaluator per provider
     → Writes verdict (pass/fail + reasons) to public.verdicts

3. AIVM dispatch
   challengeDispatcher gates on: challenge active + verdict exists
     → Queues AIVM job → public.aivm_jobs (status = queued)

4. AIVM request
   challengeWorker picks up queued jobs
     → Calls AIVMInferenceV2.requestInferenceV2() on-chain
     → Records binding in ChallengeTaskRegistry.recordBinding()
     → public.aivm_jobs (status = submitted)

5. Lightchain processing (external)
   Lightchain native workers: commitInference → revealInference → submitPoIAttestation
   Until quorum reached → InferenceFinalized event emitted

6. Finalization bridge
   aivmIndexer watches InferenceFinalized events
     → Calls ChallengePay.submitProofFor(challengeId, subject, abiEncodedProof)
     → Verifier (ChallengePayAivmPoiVerifier) validates PoI attestation
     → If proof passes: participant marked as winner
     → Calls ChallengePay.finalize(challengeId)
     → _snapshotAndBook() computes payouts and grants Treasury allowances
```

### Proof verification

`_submitProofInternal()` calls `challenge.verifier.verify(id, participant, proof)` in a try/catch. If verification returns `true`:

1. `challenge.winner[participant] = true`
2. `challenge.winnersPool += contrib`
3. `challenge.winnersCount += 1`
4. Emits `WinnerMarked`

If verification returns `false` or reverts, the call completes without marking a winner (non-reverting failure).

---

## 6. Fee Model

Fees are configured globally via `FeeConfig` and **snapshotted into each challenge at creation time**. This prevents retroactive fee changes from affecting existing challenges.

### Fee parameters (all in basis points, max 10000)

| Parameter | Field | Description |
|---|---|---|
| `forfeitFeeBps` | `fee_forfeitFeeBps` | Total fee taken from losers' forfeited pool (after cashback) |
| `protocolBps` | `fee_protocolBps` | Protocol's share of the forfeited pool (after cashback) |
| `creatorBps` | `fee_creatorBps` | Creator's share of the forfeited pool (after cashback) |
| `cashbackBps` | `fee_cashbackBps` | Percentage returned to losers (taken before fees) |

### Validation constraints

```solidity
protocolBps + creatorBps <= forfeitFeeBps   // shares cannot exceed total fee
forfeitFeeBps <= 10000                       // max 100%
cashbackBps <= 10000                         // max 100%
forfeitFeeBps <= feeCaps.forfeitFeeMaxBps   // hard cap (if set)
cashbackBps <= feeCaps.cashbackMaxBps       // hard cap (if set)
```

### Fee caps

`FeeCaps` provides an immutable upper bound. Once set, `forfeitFeeBps` and `cashbackBps` cannot exceed the cap values. This provides governance assurance that fees will not exceed published limits.

### Rounding dust

Integer division in fee splits may produce remainders. Dust from `feeGross - (protocolAmt + creatorAmt)` is assigned to the protocol address. Per-claim bonus dust stays in the Treasury bucket and is recoverable via `Treasury.sweep()`.

---

## 7. Payout Distribution

Payouts are computed atomically in `_snapshotAndBook()` during `finalize()`. All grants are issued as Treasury allowances (no direct transfers).

### Computation

Given:
- `totalPool = challenge.pool`
- `winnersPool = challenge.winnersPool`
- `losersPool = totalPool - winnersPool`

```
Step 1: cashback = losersPool * cashbackBps / 10000
Step 2: losersAfterCashback = losersPool - cashback
Step 3: feeGross = losersAfterCashback * forfeitFeeBps / 10000
Step 4: protocolAmt = losersAfterCashback * protocolBps / 10000
Step 5: creatorAmt = losersAfterCashback * creatorBps / 10000
Step 6: dust = feeGross - (protocolAmt + creatorAmt)  →  added to protocolAmt
Step 7: distributable = losersAfterCashback - feeGross
Step 8: perCommittedBonusX = distributable * 1e18 / winnersPool   (if winnersPool > 0)
Step 9: perCashbackX = cashback * 1e18 / losersPool               (if losersPool > 0)
```

### Claim functions

| Function | Eligible | Payout formula |
|---|---|---|
| `claimWinner(id)` | `winner[sender] == true`, `contrib > 0`, not yet claimed | `principal + principal * perCommittedBonusX / 1e18` |
| `claimLoser(id)` | `winner[sender] == false`, `contrib > 0`, `perCashbackX > 0`, not yet claimed | `principal * perCashbackX / 1e18` |
| `claimRefund(id)` | `status == Canceled`, `contrib > 0`, not yet claimed | Full `contrib` (100% refund) |

### Edge cases

- **No winners** (`winnersPool == 0`): outcome is `Fail`. The entire distributable amount is granted to `protocol`. Losers still receive cashback.
- **All winners** (`losersPool == 0`): no fees, no distributable. Each winner claims exactly their principal.
- **Single participant who wins**: claims their own principal (no bonus since losersPool is zero).

### Immediate grants at finalization

`_snapshotAndBook()` immediately grants (via Treasury):
- `protocolAmt` to `protocol` address
- `creatorAmt` to `challenge.creator`
- `distributable` to `protocol` if no winners exist

Winner and loser claims are pull-based (recipients call `claimWinner` / `claimLoser`).

---

## 8. Treasury Model

`Treasury.sol` implements bucketed, claim-based custody using OpenZeppelin `AccessControl`.

### Design properties

| Property | Mechanism |
|---|---|
| **Bucketed isolation** | Each challenge has its own bucket (`bucketId = challengeId`). Funds in one bucket cannot be used for another. |
| **Operator grants** | `ChallengePay` holds `OPERATOR_ROLE`. It calls `grantETH(bucketId, to, amount)` / `grantERC20(...)` to create allowances. |
| **Pull-based claims** | Recipients call `claimETH(bucketId)` / `claimERC20(bucketId, token)` on Treasury directly. Unstoppable: no admin can prevent a granted claim. |
| **Sweep safety** | `SWEEPER_ROLE` can only recover truly free funds: `free = onchainBalance - outstandingAllowances - totalBucketBalances`. Bucket balances and outstanding allowances are always protected. |

### Accounting

```
bucketEthBalance[bucketId]        — remaining allocatable ETH in bucket
totalBucketEthBalance             — sum across all buckets
ethAllowanceOf[bucketId][addr]    — granted but unclaimed amount
outstandingETH                    — sum of all outstanding allowances
```

Deposit: increases `bucketBalance` and `totalBucketBalance`.
Grant: decreases `bucketBalance`, increases `allowanceOf` and `outstanding`.
Claim: decreases `allowanceOf` and `outstanding`, transfers funds.

---

## 9. Achievement System

`ChallengeAchievement.sol` mints soulbound (non-transferable) ERC-721 tokens implementing ERC-5192.

### Achievement types

| Type | Enum value | Eligibility |
|---|---|---|
| **Completion** | `AchievementType.Completion` (0) | Any address with `contribOf(challengeId, user) > 0` in a `Finalized` challenge |
| **Victory** | `AchievementType.Victory` (1) | Any address where `isWinner(challengeId, user) == true` in a `Finalized` challenge with `Outcome.Success` |

### On-chain verification

`ChallengeAchievement` reads `ChallengePay` state via the `IChallengePay` view interface:
- `getChallenge(id)` -- checks `status == Finalized` and `outcome`
- `contribOf(id, user)` -- confirms participation
- `isWinner(id, user)` -- confirms winner status

ChallengePay has no knowledge of ChallengeAchievement. The dependency is strictly one-way (read-only).

### Properties

- **Soulbound**: All transfers revert. `locked(tokenId)` always returns `true`. `Locked(tokenId)` is emitted at mint.
- **Double-mint protection**: `minted[challengeId][user][achievementType]` mapping prevents duplicate mints.
- **Claim-based**: Users call `mint(challengeId, achievementType)` themselves; no admin action required.

---

## 10. Event Routing

`EventChallengeRouter.sol` maps multi-outcome events to individual `ChallengePay` challenges. This is an admin-only utility, not on the user-facing product path.

### Model

An event (e.g., "Team A vs Team B") is identified by a `bytes32 eventId` and contains N outcomes, each bound to a `challengeId` and a `subject` address.

```solidity
struct Outcome {
    string name;
    uint256 challengeId;
    address subject;
}
```

### Flow

1. **Register**: Owner calls `registerEvent(eventId, title)` to create the event.
2. **Add outcomes**: Owner calls `addOutcome(eventId, name, challengeId, subject)` for each possible result.
3. **Finalize**: When the real-world outcome is known, owner calls `finalizeEvent(eventId, winnerIndex, proof)`:
   - Calls `challengePay.submitProofFor(winningChallengeId, winningSubject, proof)` to mark the winner.
   - Calls `challengePay.finalize(winningChallengeId)`.
4. **Finalize losers**: Losing outcome challenges can be finalized separately (they expire with no winners, resulting in `Outcome.Fail`).

### Access control

All mutating functions (`registerEvent`, `addOutcome`, `finalizeEvent`, `setEventURI`) are restricted to the owner. Ownership uses a 2-step transfer pattern (`transferOwnership` + `acceptOwnership`).

---

## 11. AIVM Integration

LightChallenge is a **client** of the Lightchain AIVM network. It submits inference requests and indexes finalization events. It does not operate worker or validator nodes.

### Contract dependencies

| Contract | Role | Deployed by |
|---|---|---|
| `AIVMInferenceV2` | Receives inference requests, manages commit/reveal/attest cycle | Lightchain |
| `ChallengeTaskRegistry` | Maps `(challengeId, subject)` to AIVM request parameters (requestId, taskId, modelDigest, paramsHash) | LightChallenge |
| `ChallengePayAivmPoiVerifier` | Verifies that an AIVM request reached `Finalized` status and that its binding matches the challenge | LightChallenge |

### Request flow

```
challengeWorker (off-chain)
  │
  ├── AIVMInferenceV2.requestInferenceV2(taskId, modelDigest, detConfigHash, ...)
  │     → Returns requestId
  │
  └── ChallengeTaskRegistry.recordBinding(challengeId, subject, requestId, taskId, ...)
        → Stores the binding for later verification
```

### Verification flow (`ChallengePayAivmPoiVerifier.verify()`)

The verifier decodes an `AivmPoiProofV1` struct from the proof bytes and checks:

1. `schemaVersion == RESULT_SCHEMA_V1` (1)
2. `challengeId` matches the requested challenge
3. `subject` matches the requested participant
4. A valid binding exists in `ChallengeTaskRegistry` for `(challengeId, subject)`
5. `requestId`, `taskId`, `modelDigest`, `paramsHash` match the binding
6. The AIVM request status is `Finalized` (status 4) via `aivm.getInferenceRequest(requestId)`
7. `passed == true` (the inference result indicates success)

### AIVM lifecycle (external to LightChallenge)

```
Requested (1) → Committed (2) → Revealed (3) → Finalized (4)
                                                     │
                                         InferenceFinalized event
                                                     │
                                              aivmIndexer picks up
```

Lightchain native workers perform `commitInference`, `revealInference`, and `submitPoIAttestation` until the PoI quorum is met. The `InferenceFinalized` event is the trigger for our finalization bridge.

---

## 12. Security Properties

### Fund safety

- **Zero balance in ChallengePay.** All deposits route to `Treasury.depositETH` / `Treasury.depositERC20From`. ChallengePay's `address(this).balance` should always be zero.
- **Bucketed isolation.** Each challenge's funds live in a separate Treasury bucket. A bug in one challenge's payout cannot drain another's bucket.
- **Pull-based claims.** Treasury allowances are unstoppable: once `grantETH(bucketId, to, amount)` is called, the recipient can claim regardless of any admin action on ChallengePay.
- **Sweep safety.** `Treasury.sweep()` can only touch funds where `balance > outstanding + bucketBalances`. Active challenge funds and pending claims are always protected.

### Fee safety

- **Snapshot at creation.** `fee_forfeitFeeBps`, `fee_protocolBps`, `fee_creatorBps`, `fee_cashbackBps` are copied into the challenge struct at `createChallenge()`. Admin fee changes do not affect existing challenges.
- **Underflow prevention.** `protocolBps + creatorBps <= forfeitFeeBps` is enforced in `setFeeConfig()`. The computation `losersAfterCashback - feeGross` cannot underflow because `feeGross = (losersAfterCashback * forfeitFeeBps) / 10000` where `forfeitFeeBps <= 10000`.
- **Fee caps.** `FeeCaps` sets hard upper bounds on `forfeitFeeBps` and `cashbackBps`. Once set, these cannot be exceeded by `setFeeConfig()`.

### Access control

- **2-step admin transfer.** `transferAdmin()` sets `pendingAdmin`; `acceptAdmin()` must be called by the pending admin. Prevents accidental admin loss.
- **Dispatcher ACL.** Only addresses in the `dispatchers` mapping (or admin) can call `submitProofFor` / `submitProofForBatch`. This prevents unauthorized proof submissions.
- **Creator allowlist.** Optional gate (`useCreatorAllowlist`) restricts who can create challenges.
- **Token allowlist.** Optional gate (`useTokenAllowlist`) restricts which ERC-20 tokens can be used.

### Challenge integrity

- **Verifier immutability.** `setVerificationConfig()` can update the verifier or proof deadline, but when `proofTightenOnly` is enabled, the deadline can only be reduced (not extended). This prevents bait-and-switch attacks where rules change after participants join.
- **Cancel blocked after winners.** `cancelChallenge()` reverts with `AlreadyFinalized` if `winnersCount > 0`. Once any participant has a verified proof, the challenge cannot be canceled.
- **Finalize requires deadline passage.** `finalize()` requires both `block.timestamp >= endTime` and `block.timestamp >= proofDeadlineTs`. No early finalization is possible.
- **Double-claim prevention.** `winnerClaimed[sender]`, `loserClaimed[sender]`, and `refundClaimed[id][sender]` mappings prevent double claims.

### Reentrancy

- All state-mutating public functions use OpenZeppelin's `ReentrancyGuard` (`nonReentrant` modifier).
- Treasury claims use the checks-effects-interactions pattern.

### Global pause

- `admin` can call `pauseAll(true)` to halt all challenge operations. The `notPaused` modifier blocks `createChallenge`, `joinChallenge*`, `submitProof*`, `finalize`, `cancel`, and all claim functions.

---

## 13. Dormant Infrastructure

### TrustedForwarder

- **Status**: Deployed but inactive.
- **Purpose**: EIP-2771 gasless transaction relay.
- **Current state**: `ChallengePay.trustedForwarder` is set to the forwarder address, but the forwarder's target whitelist is empty. No relay is configured. The `_msgSender2771()` path is functional but never triggered in production because no external relayer is submitting meta-transactions.
- **Activation path**: Admin calls `setTrustedForwarder(addr)` on ChallengePay, and the forwarder must be configured with allowed target contracts and a funded relayer.

### AivmProofVerifier (Path A)

- **Status**: Archived in `.attic/contracts_archive/`. Not compiled, not deployed on active path.
- **Purpose**: EIP-712 trusted-signer verifier for synchronous proof verification (validator UI submits signed attestations directly).
- **Superseded by**: `ChallengePayAivmPoiVerifier` (Path B), which uses Lightchain's PoI quorum mechanism.
- **Reactivation**: Would require re-adding to compilation, deploying, and registering as a verifier on new challenges.

### MetadataRegistry

- **Status**: Deployed and active for metadata writes, but not critical for protocol operation.
- **Purpose**: On-chain URI pointers for challenge metadata. Write-once by default (`ownerSet()` reverts with `AlreadySet`). Admin corrections via `ownerForceSet()`.
- **Degradation**: If metadata writes fail, challenges still function. The DB is the authoritative source for rendering. Failed writes are tracked and retried.

---

## Appendix: Deployed Contracts (Testnet)

| Contract | Address |
|---|---|
| ChallengePay | `0x5d630768BC194B5B840E3e8494037dBEeB06Cf9B` |
| EventChallengeRouter | `0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D` |
| ChallengeTaskRegistry | `0x0e079C693Bd177Fa31baab70EfCD5b9D625c355E` |
| ChallengePayAivmPoiVerifier | `0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123` |
| AIVMInferenceV2 (Lightchain) | `0x2d499C52312ca8F0AD3B7A53248113941650bA7E` |

Full address manifest: `webapp/public/deployments/lightchain.json`

---

## Appendix: Event Reference

### ChallengePay events

| Event | Emitted by |
|---|---|
| `ChallengeCreated(id, creator, kind, currency, token, startTs, externalId)` | `createChallenge()` |
| `Joined(id, user, amount)` | `joinChallengeNative`, `joinChallengeERC20`, `joinChallengePermit` |
| `ParticipantProofSubmitted(id, participant, verifier, ok)` | `_submitProofInternal()` |
| `WinnerMarked(id, participant, contrib, winnersPool, winnersCount)` | `_submitProofInternal()` (on success) |
| `Finalized(id, status, outcome)` | `finalize()` |
| `Canceled(id)` | `cancelChallenge()` |
| `FeesBooked(id, protocolAmt, creatorAmt, cashback)` | `_snapshotAndBook()` |
| `SnapshotSet(id, success)` | `_snapshotAndBook()` |
| `WinnerClaimed(id, user, amount)` | `claimWinner()` |
| `LoserClaimed(id, user, amount)` | `claimLoser()` |
| `RefundClaimed(id, user, amount)` | `claimRefund()` |

### Treasury events

| Event | Emitted by |
|---|---|
| `BucketCreditedETH(bucketId, from, amount)` | `depositETH()` |
| `Received(from, amount)` | `receive()` fallback |
