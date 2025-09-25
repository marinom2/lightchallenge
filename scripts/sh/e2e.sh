#!/usr/bin/env bash
set -euo pipefail

echo "== Clean & Build =="
npm run clean >/dev/null 2>&1 || true
npm run build

echo
echo "== Deploy contracts =="
npm run deploy
npm run deploy:registry

# You can override these via env: ID, STAKE_WEI, JOIN_WEI, BET_WEI, APPROVAL_LEAD, START_DELAY
ID="${ID:-0}"
STAKE_WEI="${STAKE_WEI:-1000000000000000}"    # 0.001
JOIN_WEI="${JOIN_WEI:-5000000000000000}"      # 0.005
BET_WEI="${BET_WEI:-3000000000000000}"        # 0.003
APPROVAL_LEAD="${APPROVAL_LEAD:-60}"          # seconds
START_DELAY="${START_DELAY:-120}"              # seconds
CHARITY_BPS="${CHARITY_BPS:-0}"
PROOF_REQUIRED="${PROOF_REQUIRED:-0}"

echo
echo "== Stake validator (for approvals threshold/quorum) =="
AMOUNT="$STAKE_WEI" npm run stakePeerBond

echo
echo "== Create challenge =="
APPROVAL_LEAD="$APPROVAL_LEAD" START_DELAY="$START_DELAY" CHARITY_BPS="$CHARITY_BPS" PROOF_REQUIRED="$PROOF_REQUIRED" npm run create

echo
echo "== Approve challenge =="
ID="$ID" npm run approve

echo
echo "== Provide liquidity (join success + bet fail) =="
ID="$ID" AMOUNT="$JOIN_WEI" npm run join
ID="$ID" SIDE=fail AMOUNT="$BET_WEI" npm run bet

echo
echo "== Wait for start time (${START_DELAY}s)… =="
sleep "$START_DELAY"

echo
echo "== Finalize =="
ID="$ID" npm run finalize

echo
echo "== Claim winner payout (from your PRIVATE_KEY wallet) =="
ID="$ID" npm run claim:winner

echo
echo "✅ E2E flow complete. If you want loser cashback too, run:"
echo "ID=$ID npm run claim:loser"
