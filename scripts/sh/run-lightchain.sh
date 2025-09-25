#!/usr/bin/env zsh
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Auto-load .env
# ──────────────────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

need(){ command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing '$1'. Please install it."; exit 1; }; }
need curl; need jq; need node; need npx

sep(){ printf "\n==== %s ====\n" "$1"; }

# Non-fatal step runner
try(){
  local desc="$1"; shift
  echo "→ ${desc}"
  set +e
  "$@"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "⚠️  Step failed (${desc}). Continuing…"
  fi
  return 0
}

# Defaults
: "${PROOF_REQUIRED_A:=0}"
: "${VERIFIER_A:=0x0000000000000000000000000000000000000000}"
: "${CHARITY_BPS:=0}"
: "${CHARITY:=0x0000000000000000000000000000000000000000}"

NET="${NET:-lightchain}"
export HARDHAT_NETWORK="${NET}"

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
latest_id(){ npx hardhat run scripts/ops/latestId.ts --network "$NET" | tail -n1; }

get_epoch_field(){
  local id="$1"; local label="$2"
  CH_ID="$id" npx hardhat run scripts/ops/getChallenge.ts --network "$NET" \
  | awk -v L="$label" '$1==L && $2==":" { print $3; exit } $1==L":" { print $2; exit }'
}

sleep_until(){
  local target="$1"; local now=$(date -u +%s); local sl=$(( target - now ))
  (( sl > 0 )) && { echo "⏱ Sleeping $sl sec until $(date -u -r "$target" +%FT%TZ)…"; sleep "$sl"; }
}

new_wallet(){
  node -e 'const {Wallet}=require("ethers"); const w=Wallet.createRandom(); process.stdout.write(w.privateKey+" "+w.address);'
}

fund_from_pk(){
  local pk="$1"; local to="$2"; local amt="$3"
  NODE_NO_WARNINGS=1 node -e '
    const {ethers}=require("ethers");
    (async()=>{
      const url=process.env.LIGHTCHAIN_RPC;
      if(!url){ console.error("❌ LIGHTCHAIN_RPC not set"); process.exit(1); }
      const p=new ethers.JsonRpcProvider(url);
      const w=new ethers.Wallet(process.argv[2], p);
      const to=process.argv[3], amt=process.argv[4];
      console.log("Funding", to, "from", await w.getAddress(), "amount", amt);
      const tx=await w.sendTransaction({to, value: ethers.parseEther(amt)});
      console.log("tx:", tx.hash); await tx.wait(); console.log("✅ Funded");
    })().catch(e=>{ console.error(e); process.exit(1); })
  ' "$pk" "$to" "$amt"
}

warn_if_low_balance(){
  local who="$1"
  local bal=$(node -e "const {ethers}=require('ethers');(async()=>{const p=new ethers.JsonRpcProvider(process.env.LIGHTCHAIN_RPC);const b=await p.getBalance('$who');console.log(ethers.formatEther(b))})().catch(()=>console.log('0'))")
  local min="0.01"
  awk -v b="$bal" -v m="$min" -v a="$who" 'BEGIN{ if (b+0 < m+0) { printf "⚠️  Low balance on %s: %f LCAI (min suggested %s)\n", a, b, m; } }'
}

# ──────────────────────────────────────────────────────────────────────────────
# Resolve validator test wallets from PK0/PK1 (required)
# ──────────────────────────────────────────────────────────────────────────────
if [[ -n "${PK0:-}" ]]; then
  W0=$(PK="$PK0" npx ts-node scripts/dev/pk2addr.ts)
  export W0
else
  echo "❌ PK0 not set in .env"; exit 1
fi

if [[ -n "${PK1:-}" ]]; then
  W1=$(PK="$PK1" npx ts-node scripts/dev/pk2addr.ts)
  export W1
else
  echo "❌ PK1 not set in .env"; exit 1
fi

if [[ -n "${PK2:-}" ]]; then
  W2=$(PK="$PK2" npx ts-node scripts/dev/pk2addr.ts)
  export W2
else
  : "${W2:=${DEPLOYER:-}}"
fi

echo "W0=$W0"
echo "W1=$W1"
echo "W2=${W2:-"(defaulted to DEPLOYER)"}"

# ──────────────────────────────────────────────────────────────────────────────
# RPC health
# ──────────────────────────────────────────────────────────────────────────────
sep "RPC health check"
if ! npm run -s ping >/dev/null 2>&1; then
  if ! npx ts-node scripts/ops/rpcHealth.ts >/dev/null 2>&1; then
    npx hardhat run scripts/ops/rpcHealth.ts --network "$NET" || {
      echo "❌ RPC check failed. Fix LIGHTCHAIN_RPC or the node."; exit 1;
    }
  fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# Scenario toggles
# ──────────────────────────────────────────────────────────────────────────────
: "${RUN_SCENARIO_A:=1}"
: "${RUN_SCENARIO_B:=1}"
: "${RUN_SCENARIO_C:=1}"
: "${RUN_SCENARIO_D_CHARITY:=1}"
: "${RUN_SCENARIO_E_PROOF:=1}"
: "${RUN_SCENARIO_F_STALEMATE:=1}"
: "${RUN_SCENARIO_G_CANCEL:=1}"
: "${RUN_SCENARIO_H_UNSTAKE:=1}"

# Amounts (LCAI)
STAKE="${STAKE:-0.0001}"
BOND="${BOND:-0.000000000000000001}"
JOIN_AMT="${JOIN_AMT:-0.00005}"
BET_FAIL_AMT="${BET_FAIL_AMT:-0.00004}"
CHARITY_FUND_AMT="${CHARITY_FUND_AMT:-0.02}"
BETTOR_FUND_AMT="${BETTOR_FUND_AMT:-0.02}"

# Creator timing
START_PAD_A="${START_PAD_A:-300}"
AD_PAD_A="${AD_PAD_A:-120}"
MAX_PARTICIPANTS_A="${MAX_PARTICIPANTS_A:-50}"

# DAO params
MIN_STAKE="${MIN_STAKE:-0.00005}"
THRESHOLD_BPS="${THRESHOLD_BPS:-5000}"
QUORUM_BPS="${QUORUM_BPS:-300}"
UNSTAKE_COOLDOWN="${UNSTAKE_COOLDOWN:-259200}"
LOSERS_FEE_BPS="${LOSERS_FEE_BPS:-600}"
DAO_BPS="${DAO_BPS:-200}"
CREATOR_BPS="${CREATOR_BPS:-200}"
VALIDATORS_BPS="${VALIDATORS_BPS:-200}"
LOSER_CASHBACK_BPS="${LOSER_CASHBACK_BPS:-100}"

# ──────────────────────────────────────────────────────────────────────────────
# 0) Build, Deploy, Status
# ──────────────────────────────────────────────────────────────────────────────
sep "Build"; npm run build
sep "Deploy - $NET"; npx hardhat run scripts/ops/deploy.ts --network "$NET"
sep "Status - $NET (post-deploy)"; npx hardhat run scripts/inspect/status.ts --network "$NET"

# Approval lead time short (testnet)
sep "Set approval lead time (short for testnet)"
TEST_LEAD="${TEST_LEAD:-60}"
CONFIRM=YES LEAD="$TEST_LEAD" LEAD_SECS="$TEST_LEAD" \
npx hardhat run scripts/ops/setLead.ts --network "$NET"

sep "Validators — current (pre-scenarios)"
npx hardhat run scripts/ops/listValidators.ts --network "$NET"

sep "Funding checks (non-fatal)"
warn_if_low_balance "${DEPLOYER:-}"
warn_if_low_balance "$W0"
warn_if_low_balance "$W1"
[[ -n "${W2:-}" ]] && warn_if_low_balance "$W2" || true

# 1) DAO params
sep "Set validator params (threshold=${THRESHOLD_BPS} bps, quorum=${QUORUM_BPS} bps)"
MIN_STAKE="$MIN_STAKE" THRESHOLD_BPS="$THRESHOLD_BPS" QUORUM_BPS="$QUORUM_BPS" UNSTAKE_COOLDOWN="$UNSTAKE_COOLDOWN" \
npx hardhat run scripts/ops/setValidatorParams.ts --network "$NET"

sep "Set fee config (losers=${LOSERS_FEE_BPS} bps, cashback=${LOSER_CASHBACK_BPS} bps)"
LOSERS_FEE_BPS="$LOSERS_FEE_BPS" DAO_BPS="$DAO_BPS" CREATOR_BPS="$CREATOR_BPS" VALIDATORS_BPS="$VALIDATORS_BPS" LOSER_CASHBACK_BPS="$LOSER_CASHBACK_BPS" \
npx hardhat run scripts/admin/setFeeConfig.ts --network "$NET"

# 2) Validators stake (deployer, W0, W1)
sep "Stake validators (deployer, W0, W1)"
AMOUNT="$MIN_STAKE" npx hardhat run scripts/ops/stakeValidator.ts --network "$NET"                 # deployer
PK="$PK0" AMOUNT="$MIN_STAKE" npx hardhat run scripts/ops/stakeValidator.ts --network "$NET"
PK="$PK1" AMOUNT="$MIN_STAKE" npx hardhat run scripts/ops/stakeValidator.ts --network "$NET"
npx hardhat run scripts/ops/listValidators.ts --network "$NET"

# 3) Scenario A — happy path
if [[ "$RUN_SCENARIO_A" == "1" ]]; then
  sep "Scenario A: Create"
  PEERS="$W0,$W1" PEER_M=2 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" \
  MAX_PARTICIPANTS="$MAX_PARTICIPANTS_A" \
  START_PAD="$START_PAD_A" AD_PAD="$AD_PAD_A" \
  CHARITY_BPS="0" CHARITY="0x0000000000000000000000000000000000000000" \
  PROOF_REQUIRED="$PROOF_REQUIRED_A" VERIFIER="$VERIFIER_A" \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario A)"

  sep "Approvals (W0 + W1)"
  try "W0 approve" PK="$PK0" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"
  try "W1 approve" PK="$PK1" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"

  sep "Join — deployer + W0 + W1"
  try "Deployer join" CH_ID="$CH_ID" env AMOUNT="$JOIN_AMT"       npx hardhat run scripts/ops/join.ts --network "$NET"
  try "W0 join"       PK="$PK0" CH_ID="$CH_ID" env AMOUNT="$JOIN_AMT" npx hardhat run scripts/ops/join.ts --network "$NET"
  try "W1 join"       PK="$PK1" CH_ID="$CH_ID" env AMOUNT="$JOIN_AMT" npx hardhat run scripts/ops/join.ts --network "$NET"

  sep "Create bettor PKB, fund from PK0, bet FAIL"
  read PKB ADDRB <<<"$(new_wallet)"; export PKB ADDRB
  echo "🆕 Bettor wallet: $ADDRB"
  try "Fund PKB from PK0" fund_from_pk "$PK0" "$ADDRB" "$BETTOR_FUND_AMT"
  try "PKB bet FAIL" PK="$PKB" CH_ID="$CH_ID" env SIDE=fail AMOUNT="$BET_FAIL_AMT" npx hardhat run scripts/ops/bet.ts --network "$NET"

  sep "Preview payouts"
  try "Preview" env CH_ID="$CH_ID" npx hardhat run scripts/ops/payoutPreview.ts --network "$NET"

  t=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$t" ]] && sleep_until "$t"

  sep "Peer votes (after startTs; W0 + W1 pass)"
  try "W0 peer PASS" PK="$PK0" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  try "W1 peer PASS" PK="$PK1" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"

  sep "Finalize A + Claims"
  try "Finalize"      CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
  try "Claim winner"  CH_ID="$CH_ID" npx hardhat run scripts/ops/claimWinner.ts --network "$NET"
  try "Claim loser cashback (W0)" PK="$PK0" env CH_ID="$CH_ID" npx hardhat run scripts/ops/claimLoserCashback.ts --network "$NET"
  try "Claim validator (W0)"      PK="$PK0" env CH_ID="$CH_ID" npx hardhat run scripts/ops/claimValidator.ts --network "$NET"
  try "Claim validator (W1)"      PK="$PK1" env CH_ID="$CH_ID" npx hardhat run scripts/ops/claimValidator.ts --network "$NET"
fi

# 4) Scenario B — rejection
if [[ "$RUN_SCENARIO_B" == "1" ]]; then
  sep "Scenario B: Create for rejection"
  PEERS="$W0,$W1" PEER_M=1 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=25 START_PAD=600 AD_PAD=300 CHARITY_BPS="0" \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario B)"
  sep "Reject (W0 + W1)"
  try "W0 reject" PK="$PK0" CH_ID="$CH_ID" env DECISION=false npx hardhat run scripts/ops/approve.ts --network "$NET"
  try "W1 reject" PK="$PK1" CH_ID="$CH_ID" env DECISION=false npx hardhat run scripts/ops/approve.ts --network "$NET"
  sep "Preview + Finalize (refund)"
  try "Preview"  CH_ID="$CH_ID" npx hardhat run scripts/ops/payoutPreview.ts --network "$NET"
  try "Finalize" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
fi

# 5) Scenario C — no quorum (deadline passes)
if [[ "$RUN_SCENARIO_C" == "1" ]]; then
  sep "Scenario C: Create (short approval window)"
  PEERS="$W0,$W1" PEER_M=1 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=900 AD_PAD=120 CHARITY_BPS="0" \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario C)"
  adTs=$(get_epoch_field "$CH_ID" "approvalDeadline" || true)
  echo "approvalDeadline=$adTs"
  [[ -n "$adTs" ]] && sleep_until "$adTs"
  try "Finalize (expected rejected)" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
fi

# 6) Scenario D — Charity
if [[ "$RUN_SCENARIO_D_CHARITY" == "1" ]]; then
  sep "Scenario D: Charity path — make fresh charity wallet & fund from DAO_TREASURY"
  read PKC ADDRC <<<"$(new_wallet)"; export PKC ADDRC
  echo "🎗 Charity wallet: $ADDRC"
  : "${DAO_TREASURY_PK:=${PRIVATE_KEY:-}}"
  if [[ -z "${DAO_TREASURY_PK}" ]]; then
    echo "❌ Set DAO_TREASURY_PK or PRIVATE_KEY to fund charity"; exit 1
  fi
  try "Fund charity from treasury" fund_from_pk "$DAO_TREASURY_PK" "$ADDRC" "$CHARITY_FUND_AMT"

  sep "Create challenge with charity"
  PEERS="$W0,$W1" PEER_M=2 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=300 AD_PAD=120 \
  CHARITY_BPS="${CHARITY_BPS:-100}" CHARITY="$ADDRC" \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario D)"

  try "W0 approve" PK="$PK0" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"
  try "W1 approve" PK="$PK1" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"

  try "Join deployer" CH_ID="$CH_ID" env AMOUNT="$JOIN_AMT" npx hardhat run scripts/ops/join.ts --network "$NET"
  try "Bet FAIL (PK0)" PK="$PK0" CH_ID="$CH_ID" env SIDE=fail AMOUNT="$BET_FAIL_AMT" npx hardhat run scripts/ops/bet.ts --network "$NET"

  t=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$t" ]] && sleep_until "$t"
  try "W0 peer PASS" PK="$PK0" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  try "W1 peer PASS" PK="$PK1" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"

  try "Finalize (charity cut)" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
  try "Claim winner" env CH_ID="$CH_ID" npx hardhat run scripts/ops/claimWinner.ts --network "$NET"
  try "Claim loser cashback (PK0)" PK="$PK0" env CH_ID="$CH_ID" npx hardhat run scripts/ops/claimLoserCashback.ts --network "$NET"
fi

# 7) Scenario E — Proof-required (mock verifier)
if [[ "$RUN_SCENARIO_E_PROOF" == "1" ]]; then
  sep "Scenario E: Proof-required — deploy mock verifier"
  npx hardhat run scripts/admin/deployMockVerifier.ts --network "$NET"
  MOCK=$(jq -r '.mockVerifier' deployments/"$NET".json)
  [[ "$MOCK" == "null" || -z "$MOCK" ]] && { echo "❌ mockVerifier not saved"; exit 1; }

  sep "Create with proof required"
  PEERS="$W0,$W1" PEER_M=2 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=480 AD_PAD=180 \
  PROOF_REQUIRED=1 VERIFIER="$MOCK" \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario E)"

  try "W0 approve" PK="$PK0" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"
  try "W1 approve" PK="$PK1" CH_ID="$CH_ID" env DECISION=true  npx hardhat run scripts/ops/approve.ts --network "$NET"

  try "Join deployer" CH_ID="$CH_ID" env AMOUNT="$JOIN_AMT" npx hardhat run scripts/ops/join.ts --network "$NET"
  try "Bet FAIL (PK0)" PK="$PK0" CH_ID="$CH_ID" env SIDE=fail AMOUNT="$BET_FAIL_AMT" npx hardhat run scripts/ops/bet.ts --network "$NET"

  t=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$t" ]] && sleep_until "$t"
  try "W0 peer PASS" PK="$PK0" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  try "W1 peer PASS" PK="$PK1" CH_ID="$CH_ID" env PASS=true  npx hardhat run scripts/ops/peerVote.ts --network "$NET"

  sep "Finalize should fail (no proof yet)"
  try "Finalize(no proof)" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"

  sep "Approve mock & submit proof"
  try "Mock approve"   APPROVED=1 npx hardhat run scripts/ops/setMockApproval.ts --network "$NET"
  try "Mock check"     npx hardhat run scripts/ops/checkMockProof.ts --network "$NET"
  try "Submit proof"   CH_ID="$CH_ID" env PROOF=0x01 npx hardhat run scripts/ops/submitProof.ts --network "$NET"

  sep "Finalize E (after proof)"
  try "Finalize(after proof)" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
fi

# 8) Scenario F — Peer stalemate with 3 peers, M=2
if [[ "$RUN_SCENARIO_F_STALEMATE" == "1" ]]; then
  sep "Scenario F: Peer stalemate (3 peers, M=2)"
  PEERS="$W0,$W1,${W2:-$DEPLOYER}" PEER_M=2 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=480 AD_PAD=180 \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario F)"

  try "W0 approve" PK="$PK0" CH_ID="$CH_ID" env DECISION=true   npx hardhat run scripts/ops/approve.ts --network "$NET"
  try "W1 approve" PK="$PK1" CH_ID="$CH_ID" env DECISION=true   npx hardhat run scripts/ops/approve.ts --network "$NET"

  t=$(get_epoch_field "$CH_ID" "startTs" || true); [[ -n "$t" ]] && sleep_until "$t"

  try "W0 peer PASS"    PK="$PK0" CH_ID="$CH_ID" env PASS=true   npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  try "W1 peer FAIL"    PK="$PK1" CH_ID="$CH_ID" env PASS=false  npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  if [[ -n "${PK2:-}" ]]; then
    try "Peer3 PASS"    PK="$PK2" CH_ID="$CH_ID" env PASS=true   npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  else
    try "Deployer PASS" CH_ID="$CH_ID" env PASS=true             npx hardhat run scripts/ops/peerVote.ts --network "$NET"
  fi

  try "Finalize F" env CH_ID="$CH_ID" npx hardhat run scripts/ops/finalize.ts --network "$NET"
fi

# 9) Scenario G — Creator cancel pre-approval
if [[ "$RUN_SCENARIO_G_CANCEL" == "1" ]]; then
  sep "Scenario G: Creator cancel (pending)"
  PEERS="$W0,$W1" PEER_M=2 CURRENCY=native \
  STAKE="$STAKE" BOND="$BOND" MAX_PARTICIPANTS=10 START_PAD=900 AD_PAD=600 \
  npx hardhat run scripts/ops/createChallenge.ts --network "$NET"
  CH_ID=$(latest_id); echo "CH_ID=$CH_ID (Scenario G)"
  try "Cancel by creator" env CH_ID="$CH_ID" npx hardhat run scripts/admin/cancelChallenge.ts --network "$NET"
fi

# 10) Scenario H — Unstake request (now uses the new scripts)
if [[ "$RUN_SCENARIO_H_UNSTAKE" == "1" ]]; then
  sep "Scenario H: Unstake request (W0+W1)"
  try "W0 request" PK="$PK0" AMOUNT="$MIN_STAKE" npx hardhat run scripts/ops/requestUnstake.ts --network "$NET"
  try "W1 request" PK="$PK1" AMOUNT="$MIN_STAKE" npx hardhat run scripts/ops/requestUnstake.ts --network "$NET"
  npx hardhat run scripts/ops/listValidators.ts --network "$NET"
  echo "ℹ️  After cooldown, run withdraw with:"
  echo "    PK=<wallet> npx hardhat run scripts/ops/withdrawUnstaked.ts --network $NET"
fi

sep "Validators — current (post-scenarios)"
npx hardhat run scripts/ops/listValidators.ts --network "$NET"

sep "DONE"