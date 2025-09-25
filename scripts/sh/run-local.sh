#!/usr/bin/env zsh
set -e
set -u
set -o pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Auto-load .env (if present)
# ──────────────────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing '$1'. Please install it."; exit 1; }; }
need curl
need jq
sep(){ printf "\n==== %s ====\n" "$1"; }

# ──────────────────────────────────────────────────────────────────────────────
# Local RPC check
# ──────────────────────────────────────────────────────────────────────────────
sep "RPC check (localhost)"
if ! curl -sS -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}' \
  http://127.0.0.1:8545 >/dev/null; then
  echo "❌ No Hardhat node at http://127.0.0.1:8545"
  echo "Start one in another terminal:  npx hardhat node"
  exit 1
fi

NET="localhost"
export HARDHAT_NETWORK="$NET"

# ──────────────────────────────────────────────────────────────────────────────
# Scenario toggles (1=run)
# ──────────────────────────────────────────────────────────────────────────────
: "${RUN_SCENARIO_A:=1}"           # happy path
: "${RUN_SCENARIO_B:=1}"           # validator rejection
: "${RUN_SCENARIO_C:=1}"           # deadline pass (no quorum)
: "${RUN_SCENARIO_D_CHARITY:=1}"   # charity path
: "${RUN_SCENARIO_E_PROOF:=1}"     # proof-required flow (fail -> pass)
: "${RUN_SCENARIO_F_STALEMATE:=1}" # 3 peers, M=2, resolves
: "${RUN_SCENARIO_G_CANCEL:=1}"    # creator cancel pre-approval
: "${RUN_SCENARIO_H_UNSTAKE:=1}"   # request/withdraw unstake

# NEW coverage
: "${RUN_SCENARIO_I_STALE_2P:=1}"  # 2 peers, M=2 → stalemate, finalize reverts
: "${RUN_SCENARIO_J_MAXPART:=1}"   # max participants cap reached
: "${RUN_SCENARIO_K_POSTFINAL:=1}" # join/bet after finalized → revert
: "${RUN_SCENARIO_L_CANCEL_AFTER_APPROVE:=1}" # cancel after approved → revert
: "${RUN_SCENARIO_M_VOTE_TOO_EARLY:=1}"       # peerVote before startTs → revert
: "${RUN_SCENARIO_N_PROOF_WRONG_SUBJECT:=1}"  # wrong proof subject keeps block
: "${RUN_SCENARIO_O_UNSTAKE_LOCKED:=1}"       # unstake while vote-locked → revert; later ok

# ──────────────────────────────────────────────────────────────────────────────
# Tunables (local-friendly defaults; overridable via env)
# ──────────────────────────────────────────────────────────────────────────────
START_PAD_A="${START_PAD_A:-180}"
AD_PAD_A="${AD_PAD_A:-60}"
MAX_PARTICIPANTS_A="${MAX_PARTICIPANTS_A:-10}"

STAKE="${STAKE:-0.0001}"
BOND="${BOND:-0.00001}"
JOIN_AMT="${JOIN_AMT:-0.00005}"
BET_FAIL_AMT="${BET_FAIL_AMT:-0.00004}"

MIN_STAKE="${MIN_STAKE:-0.00005}"
THRESHOLD_BPS="${THRESHOLD_BPS:-5000}"
QUORUM_BPS="${QUORUM_BPS:-300}"
UNSTAKE_COOLDOWN="${UNSTAKE_COOLDOWN:-600}"
LOSERS_FEE_BPS="${LOSERS_FEE_BPS:-600}"
DAO_BPS="${DAO_BPS:-200}"
CREATOR_BPS="${CREATOR_BPS:-200}"
VALIDATORS_BPS="${VALIDATORS_BPS:-200}"
LOSER_CASHBACK_BPS="${LOSER_CASHBACK_BPS:-100}"

# Charity (optional)
CHARITY_BPS="${CHARITY_BPS:-0}"
CHARITY="${CHARITY:-0x0000000000000000000000000000000000000000}"

# Local accounts by index (Hardhat)
IDX_DEPLOYER=0
IDX_V0=1
IDX_V1=2
IDX_V2=3  # used when we need a 3rd peer

# ──────────────────────────────────────────────────────────────────────────────
# Helpers (no awk)
# ──────────────────────────────────────────────────────────────────────────────
is_addr(){ [[ "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; }

if (( CHARITY_BPS < 0 || CHARITY_BPS > 500 )); then
  echo "⚠️  CHARITY_BPS=$CHARITY_BPS out of recommended 0..500. Using as-is; contract will cap/revert if needed."
fi
if [[ "$CHARITY" != "0x0000000000000000000000000000000000000000" ]] && ! is_addr "$CHARITY"; then
  echo "❌ Invalid CHARITY address: $CHARITY"
  exit 1
fi

HHR(){ npx hardhat run "$1" --network "$NET"; }

# Extract an epoch field from getChallenge.ts output (sed-only)
get_epoch_field(){
  local id="$1"; local label="$2"
  CH_ID="$id" HHR scripts/getChallenge.ts \
  | sed -n "s/^[[:space:]]*${label}[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" \
  | head -n1
}

warp_to(){ local ts="$1"; TO_TS="$ts" HHR scripts/dev/warp.ts >/dev/null; }
preview_and_snapshot(){ CH_ID="$1" npm run preview:local; CH_ID="$1" npm run snapshot:local; }

two_peers(){ HHR scripts/dev/peers3.ts | tail -n1 | cut -d',' -f1-2; }
three_peers(){ HHR scripts/dev/peers3.ts | tail -n1; }

# Expect a revert helper (use with a single quoted command string)
expect_revert(){
  local cmd="$*"
  if eval "$cmd"; then
    echo "❌ Expected revert, but tx succeeded: $cmd"
    exit 1
  else
    echo "✅ Expected revert confirmed: $cmd"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# 0) Build & Deploy
# ──────────────────────────────────────────────────────────────────────────────
sep "Build"
npm run build

sep "Deploy - $NET"
SIGNER_INDEX="$IDX_DEPLOYER" HHR scripts/deploy.ts

sep "Status - $NET (post-deploy)"
HHR scripts/status.ts

sep "Validators — current (pre-scenarios)"
HHR scripts/listValidators.ts

# Local-only: approval lead time → 0
sep "Set approval lead time (fast local)"
SIGNER_INDEX="$IDX_DEPLOYER" LEAD=0 HHR scripts/setLead.ts

# 1) DAO params
sep "Set validator params (threshold=${THRESHOLD_BPS} bps, quorum=${QUORUM_BPS} bps)"
SIGNER_INDEX="$IDX_DEPLOYER" MIN_STAKE="$MIN_STAKE" THRESHOLD_BPS="$THRESHOLD_BPS" QUORUM_BPS="$QUORUM_BPS" UNSTAKE_COOLDOWN="$UNSTAKE_COOLDOWN" \
  HHR scripts/setValidatorParams.ts

sep "Set fee config (losers=${LOSERS_FEE_BPS} bps, cashback=${LOSER_CASHBACK_BPS} bps)"
SIGNER_INDEX="$IDX_DEPLOYER" LOSERS_FEE_BPS="$LOSERS_FEE_BPS" DAO_BPS="$DAO_BPS" CREATOR_BPS="$CREATOR_BPS" VALIDATORS_BPS="$VALIDATORS_BPS" \
  LOSER_CASHBACK_BPS="$LOSER_CASHBACK_BPS" \
  HHR scripts/setFeeConfig.ts

# 2) Register validators (0..3 for our tests)
sep "Register validators (deployer, V0, V1, V2)"
SIGNER_INDEX="$IDX_DEPLOYER" AMOUNT="$MIN_STAKE" HHR scripts/registerValidator.ts
SIGNER_INDEX="$IDX_V0"      AMOUNT="$MIN_STAKE" HHR scripts/registerValidator.ts
SIGNER_INDEX="$IDX_V1"      AMOUNT="$MIN_STAKE" HHR scripts/registerValidator.ts
SIGNER_INDEX="$IDX_V2"      AMOUNT="$MIN_STAKE" HHR scripts/registerValidator.ts
HHR scripts/status.ts

# ──────────────────────────────────────────────────────────────────────────────
# 3) Scenario A — happy path
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_A" == "1" ]]; then
  sep "Scenario A: Create"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" \
    MAX_PARTICIPANTS="$MAX_PARTICIPANTS_A" \
    START_PAD="$START_PAD_A" AD_PAD="$AD_PAD_A" \
    CHARITY_BPS="0" CHARITY="0x0000000000000000000000000000000000000000" \
    HHR scripts/createChallenge.ts
  CH_ID=0; echo "CH_ID=$CH_ID (Scenario A)"

  sep "Approvals (V0 + V1)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  CH_ID="$CH_ID" HHR scripts/getChallenge.ts

  sep "Join + place FAIL bet"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" SIDE=fail AMOUNT="$BET_FAIL_AMT" HHR scripts/bet.ts

  sep "Pre-finalize snapshot"; CH_ID="$CH_ID" npm run preview:local; CH_ID="$CH_ID" npm run snapshot:local

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true)
  if [[ -n "$startTs" ]]; then
    sep "Warp to startTs ($startTs)"; warp_to "$startTs"
  fi

  sep "Peer votes (after startTs; V0 + V1 pass)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  sep "Finalize scenario A"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
  CH_ID="$CH_ID" HHR scripts/getChallenge.ts

  sep "Post-finalize snapshot"
  CH_ID="$CH_ID" npm run snapshot:local

  sep "Claims — winners / losers / validators"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/claimWinner.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" HHR scripts/claimLoserCashback.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" HHR scripts/claimValidator.ts || true
  SIGNER_INDEX="$IDX_V1"       CH_ID="$CH_ID" HHR scripts/claimValidator.ts || true
fi

# ──────────────────────────────────────────────────────────────────────────────
# 4) Scenario B — rejection (validators reject)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_B" == "1" ]]; then
  sep "Scenario B: Create for rejection"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=25 START_PAD=300 AD_PAD=120 CHARITY_BPS="0" \
    HHR scripts/createChallenge.ts
  CH_ID=1; echo "CH_ID=$CH_ID (Scenario B)"

  sep "Reject (V0 + V1)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=false HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=false HHR scripts/approve.ts

  sep "Preview (rejection what-if)"; CH_ID="$CH_ID" npm run preview:local

  sep "Finalize scenario B (refund path)"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
  CH_ID="$CH_ID" HHR scripts/getChallenge.ts

  sep "Export challenge snapshot (B)"
  CH_ID="$CH_ID" npm run snapshot:local
fi

# ──────────────────────────────────────────────────────────────────────────────
# 5) Scenario C — no quorum (approval window expires)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_C" == "1" ]]; then
  sep "Scenario C: Create (short approval window)"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=600 AD_PAD=60 CHARITY_BPS="0" \
    HHR scripts/createChallenge.ts
  CH_ID=2; echo "CH_ID=$CH_ID (Scenario C)"

  sep "Preview (pre-deadline)"; CH_ID="$CH_ID" npm run preview:local

  adTs=$(get_epoch_field "$CH_ID" "approvalDeadline" || true)
  echo "approvalDeadline=$adTs"
  if [[ -n "$adTs" ]]; then warp_to "$adTs"; fi

  sep "Finalize scenario C (should end as rejected)"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts || true
  CH_ID="$CH_ID" HHR scripts/getChallenge.ts

  sep "Export challenge snapshot (C)"
  CH_ID="$CH_ID" npm run snapshot:local
fi

# ──────────────────────────────────────────────────────────────────────────────
# 6) Scenario D — Charity path (explicit)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_D_CHARITY" == "1" ]]; then
  sep "Scenario D: Charity path"
  PEERS="$(two_peers)"
  : "${CHARITY_BPS:?Set CHARITY_BPS (<=500)}"
  : "${CHARITY:?Set CHARITY address}"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" \
    MAX_PARTICIPANTS=10 START_PAD=180 AD_PAD=60 \
    CHARITY_BPS="$CHARITY_BPS" CHARITY="$CHARITY" \
    HHR scripts/createChallenge.ts
  CH_ID=3; echo "CH_ID=$CH_ID (Scenario D)"

  sep "Approvals (V0 + V1)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts

  sep "Join + place FAIL bet"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" SIDE=fail AMOUNT="$BET_FAIL_AMT" HHR scripts/bet.ts

  sep "Preview payouts (charity visible)"; CH_ID="$CH_ID" npm run preview:local

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true)
  if [[ -n "$startTs" ]]; then sep "Warp to startTs ($startTs)"; warp_to "$startTs"; fi

  sep "Peer votes (both PASS)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  sep "Finalize D"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts

  sep "Snapshot & claims"
  CH_ID="$CH_ID" npm run preview:local
  CH_ID="$CH_ID" npm run snapshot:local
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/claimWinner.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" HHR scripts/claimLoserCashback.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 7) Scenario E — Proof-required
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_E_PROOF" == "1" ]]; then
  sep "Scenario E: Proof-required — deploy mock verifier"
  npm run deploy:mock:local
  MOCK=$(jq -r '.mockVerifier' deployments/localhost.json)
  [[ "$MOCK" == "null" || -z "$MOCK" ]] && { echo "❌ mockVerifier not saved"; exit 1; }

  sep "Create with proof required"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" \
    MAX_PARTICIPANTS=10 START_PAD=240 AD_PAD=90 \
    PROOF_REQUIRED=1 VERIFIER="$MOCK" \
    HHR scripts/createChallenge.ts
  CH_ID=4; echo "CH_ID=$CH_ID (Scenario E)"

  sep "Approvals (V0 + V1)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts

  sep "Join + place FAIL bet"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" SIDE=fail AMOUNT="$BET_FAIL_AMT" HHR scripts/bet.ts

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true)
  if [[ -n "$startTs" ]]; then sep "Warp to startTs ($startTs)"; warp_to "$startTs"; fi

  sep "Peer votes (both PASS)"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  sep "Try finalize (should fail without proof)"
  expect_revert SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts

  SUBJECT_OK="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"  # creator
  echo "Mock approval subject (OK): $SUBJECT_OK"

  sep "Approve mock & submit proof (OK subject)"
  APPROVED=1 CH_ID="$CH_ID" SUBJECT="$SUBJECT_OK" npm run mock:set:local
  CH_ID="$CH_ID" SUBJECT="$SUBJECT_OK" npm run mock:check:local
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" PROOF=0x01 HHR scripts/submitProof.ts

  sep "Finalize E (after proof)"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts

  sep "Snapshot & claims"
  CH_ID="$CH_ID" npm run preview:local
  CH_ID="$CH_ID" npm run snapshot:local
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/claimWinner.ts
  SIGNER_INDEX="$IDX_V0"       CH_ID="$CH_ID" HHR scripts/claimLoserCashback.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 8) Scenario F — Peer stalemate (resolve with 3 peers, M=2)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_F_STALEMATE" == "1" ]]; then
  sep "Scenario F: Peer stalemate (1 PASS, 1 FAIL, 1 PASS → resolves)"
  PEERS="$(three_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" \
    MAX_PARTICIPANTS=10 START_PAD=240 AD_PAD=90 \
    HHR scripts/createChallenge.ts
  CH_ID=5; echo "CH_ID=$CH_ID (Scenario F)"

  # Two approvals will move to approved; the third approval should revert with NotPending()
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  expect_revert SIGNER_INDEX="$IDX_V2" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true)
  if [[ -n "$startTs" ]]; then sep "Warp to startTs ($startTs)"; warp_to "$startTs"; fi

  sep "Votes split PASS/FAIL/PASS"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true  HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" PASS=false HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V2" CH_ID="$CH_ID" PASS=true  HHR scripts/peerVote.ts

  sep "Finalize F (should succeed with 2 PASS out of 3)"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
  preview_and_snapshot "$CH_ID"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 9) Scenario G — Creator cancel pre-approval
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_G_CANCEL" == "1" ]]; then
  sep "Scenario G: Creator cancel (pending)"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=600 AD_PAD=300 \
    HHR scripts/createChallenge.ts
  CH_ID=6; echo "CH_ID=$CH_ID (Scenario G)"

  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/cancelChallenge.ts
  CH_ID="$CH_ID" HHR scripts/getChallenge.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 10) Scenario H — Unstake flow (request → cooldown → withdraw)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_H_UNSTAKE" == "1" ]]; then
  sep "Scenario H: Unstake request (V0+V1)"
  SIGNER_INDEX="$IDX_V0" MODE=request HHR scripts/unregisterValidator.ts
  SIGNER_INDEX="$IDX_V1" MODE=request HHR scripts/unregisterValidator.ts
  HHR scripts/listValidators.ts

  sep "Warp beyond cooldown then withdraw"
  NOW=$(node -e 'console.log(Math.floor(Date.now()/1000))')
  TO_TS=$((NOW + UNSTAKE_COOLDOWN + 5)) HHR scripts/dev/warp.ts >/dev/null
  SIGNER_INDEX="$IDX_V0" MODE=withdraw HHR scripts/unregisterValidator.ts
  SIGNER_INDEX="$IDX_V1" MODE=withdraw HHR scripts/unregisterValidator.ts
  HHR scripts/listValidators.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 11) Scenario I — 2-peer stalemate (M=2) → finalize reverts
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_I_STALE_2P" == "1" ]]; then
  sep "Scenario I: 2-peer stalemate (M=2), finalize should revert"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=2 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=5 START_PAD=180 AD_PAD=60 \
    HHR scripts/createChallenge.ts
  CH_ID=7; echo "CH_ID=$CH_ID (Scenario I)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true  HHR scripts/approve.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" DECISION=true  HHR scripts/approve.ts

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$startTs" ]] && warp_to "$startTs"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true  HHR scripts/peerVote.ts
  SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" PASS=false HHR scripts/peerVote.ts

  sep "Finalize I (should revert due to no M-of-N)"
  expect_revert SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 12) Scenario J — Max participants cap
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_J_MAXPART" == "1" ]]; then
  sep "Scenario J: Max participants cap (1), second join should revert"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=1 START_PAD=120 AD_PAD=30 \
    HHR scripts/createChallenge.ts
  CH_ID=8; echo "CH_ID=$CH_ID (Scenario J)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts

  startTs=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$startTs" ]] && warp_to "$startTs"

  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
  expect_revert SIGNER_INDEX="$IDX_V1" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 13) Scenario K — Join/Bet after finalize → revert
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_K_POSTFINAL" == "1" ]]; then
  sep "Scenario K: Post-finalize actions revert"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=90 AD_PAD=30 \
    HHR scripts/createChallenge.ts
  CH_ID=9; echo "CH_ID=$CH_ID (Scenario K)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  startTs=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$startTs" ]] && warp_to "$startTs"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts

  expect_revert SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" AMOUNT="$JOIN_AMT" HHR scripts/join.ts
  expect_revert SIGNER_INDEX="$IDX_V1"       CH_ID="$CH_ID" SIDE=fail AMOUNT="$BET_FAIL_AMT" HHR scripts/bet.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 14) Scenario L — Cancel after approved → revert
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_L_CANCEL_AFTER_APPROVE" == "1" ]]; then
  sep "Scenario L: Cancel after approval → should revert"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=300 AD_PAD=120 \
    HHR scripts/createChallenge.ts
  CH_ID=10; echo "CH_ID=$CH_ID (Scenario L)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  expect_revert SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/cancelChallenge.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 15) Scenario M — Peer vote too early (before startTs) → revert
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_M_VOTE_TOO_EARLY" == "1" ]]; then
  sep "Scenario M: peerVote before startTs → revert"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=300 AD_PAD=60 \
    HHR scripts/createChallenge.ts
  CH_ID=11; echo "CH_ID=$CH_ID (Scenario M)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  expect_revert SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 16) Scenario N — Proof wrong subject keeps block
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_N_PROOF_WRONG_SUBJECT" == "1" ]]; then
  sep "Scenario N: Wrong proof subject (should still block finalize)"
  npm run deploy:mock:local
  MOCK=$(jq -r '.mockVerifier' deployments/localhost.json)
  [[ "$MOCK" == "null" || -z "$MOCK" ]] && { echo "❌ mockVerifier not saved"; exit 1; }

  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=120 AD_PAD=30 \
    PROOF_REQUIRED=1 VERIFIER="$MOCK" \
    HHR scripts/createChallenge.ts
  CH_ID=12; echo "CH_ID=$CH_ID (Scenario N)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  startTs=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$startTs" ]] && warp_to "$startTs"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  WRONG_SUBJ="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" # v0 (not the challenger)
  echo "Wrong subject: $WRONG_SUBJ"
  APPROVED=0 CH_ID="$CH_ID" SUBJECT="$WRONG_SUBJ" npm run mock:set:local
  CH_ID="$CH_ID" SUBJECT="$WRONG_SUBJ" npm run mock:check:local
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" PROOF=0xDEAD HHR scripts/submitProof.ts

  expect_revert SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
fi

# ──────────────────────────────────────────────────────────────────────────────
# 17) Scenario O — Unstake while vote-locked → revert; then after finalize works
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$RUN_SCENARIO_O_UNSTAKE_LOCKED" == "1" ]]; then
  sep "Scenario O: Unstake while vote-locked → revert; later ok"
  PEERS="$(two_peers)"
  SIGNER_INDEX="$IDX_DEPLOYER" PEERS="$PEERS" PEER_M=1 CURRENCY=native \
    STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=120 AD_PAD=30 \
    HHR scripts/createChallenge.ts
  CH_ID=13; echo "CH_ID=$CH_ID (Scenario O)"

  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" DECISION=true HHR scripts/approve.ts
  startTs=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$startTs" ]] && warp_to "$startTs"
  SIGNER_INDEX="$IDX_V0" CH_ID="$CH_ID" PASS=true HHR scripts/peerVote.ts

  sep "Request unstake while vote-locked (expect revert)"
  expect_revert SIGNER_INDEX="$IDX_V0" MODE=request HHR scripts/unregisterValidator.ts

  sep "Finalize then request unstake (should succeed)"
  SIGNER_INDEX="$IDX_DEPLOYER" CH_ID="$CH_ID" HHR scripts/finalize.ts
  SIGNER_INDEX="$IDX_V0" MODE=request HHR scripts/unregisterValidator.ts

  sep "Warp cooldown and withdraw"
  NOW=$(node -e 'console.log(Math.floor(Date.now()/1000))')
  TO_TS=$((NOW + UNSTAKE_COOLDOWN + 5)) HHR scripts/dev/warp.ts >/dev/null
  SIGNER_INDEX="$IDX_V0" MODE=withdraw HHR scripts/unregisterValidator.ts
fi

sep "Validators — current (post-scenarios)"
HHR scripts/listValidators.ts

sep "DONE"