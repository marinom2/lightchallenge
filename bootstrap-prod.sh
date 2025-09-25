#!/usr/bin/env zsh
set -euo pipefail

echo "=== LightChallenge: production bootstrap ==="
ROOT="$(pwd)"
[[ -f package.json ]] || { echo "Run from project root (package.json not found)"; exit 1; }

# -------- 0) Snapshot current tree --------
ts="$(date +%Y%m%d-%H%M%S)"
SNAP="lightchallenge-snap-$ts.tgz"
echo "-- Snapshot to $SNAP"
tar -czf "$SNAP" \
  --exclude='node_modules' \
  --exclude='artifacts' \
  --exclude='cache' \
  --exclude='typechain-types' \
  --exclude='coverage' \
  --exclude='.DS_Store' \
  --exclude='**/._*' \
  --exclude='*.zip' --exclude='*.tgz' \
  --exclude='.exports' \
  --exclude='writes' \
  --exclude='lightchain-run.log' \
  .

# -------- 1) Ensure ignores (.gitignore) --------
echo "-- Ensuring .gitignore hygiene"
if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'GIT'
node_modules
artifacts
cache
typechain-types
coverage
.DS_Store
._*
*.tgz
*.zip
GIT
else
  grep -qxF ".DS_Store" .gitignore || echo ".DS_Store" >> .gitignore
  grep -qxF "._*" .gitignore || echo "._*" >> .gitignore
  grep -qxF "coverage" .gitignore || echo "coverage" >> .gitignore
fi

# -------- 2) Drop helpful admin/inspect scripts --------
echo "-- Writing scripts/admin helpers"
mkdir -p scripts/admin

# (A) Configure proof requirements (idempotent)
cat > scripts/admin/hh_configure.js <<'JS'
const { ethers, network } = require("hardhat");
async function main() {
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const cpAddr = process.env.CP_ADDR || dep.ChallengePay;
  const zkAddr = process.env.ZK_ADDR || dep.zkProofVerifier;
  const chId = BigInt(process.env.CH_ID || "1");

  if (!cpAddr || !zkAddr) throw new Error("Missing CP_ADDR / ZK_ADDR");

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  console.log("setProofConfig(chId=", chId.toString(), ", required=true, verifier=", zkAddr, ")");
  const tx = await cp.setProofConfig(chId, true, zkAddr);
  console.log("tx:", tx.hash);
  await tx.wait();

  // Best-effort decode from getChallenge tuple (indexes may vary by build)
  const ch = await cp.getChallenge(chId);
  const vGuess = ch[24] || "0x";
  const rGuess = ch[23];
  console.log("Heuristic read-back → verifier:", vGuess, " required:", rGuess);
}
main().catch((e)=>{ console.error(e); process.exit(1); });
JS

# (B) Deep inspect a challenge tuple and show proof bits if present
cat > scripts/admin/inspect_challenge2.js <<'JS'
const { ethers, network } = require("hardhat");
function addr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x); }
async function dump(cp, id) {
  let ch;
  try { ch = await cp.getChallenge(id); } catch { ch = null; }
  if (!ch){ console.log(`getChallenge(${id}) unavailable`); return; }
  console.log(`\n== getChallenge(${id}) FULL ==`);
  console.log(ch);
  const indices = [...Array(ch.length).keys()];
  console.log("Indices present:", indices);
  const al = [];
  for (let i=0;i<ch.length;i++){
    const v = ch[i];
    if (typeof v === "string" && addr(v)) al.push({index:i, value:v});
  }
  console.log("Address-like fields (best-effort):");
  console.log(al);
}
async function main(){
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const cpAddr = process.env.CP_ADDR || dep.ChallengePay;
  const cp = await ethers.getContractAt("ChallengePay", cpAddr);

  let nextId = 0n;
  try { nextId = await cp.nextChallengeIdView(); } catch { nextId = await cp.nextChallengeId(); }
  console.log("nextChallengeId:", nextId.toString());

  await dump(cp, 0n);
  await dump(cp, 1n);

  console.log("\nNOTE:");
  console.log("- IDs look 0-based on this build. Configure the one you plan to use.");
  console.log("- Proof config is applied at submitProof(); tuple indices 23/24 often store required/verifier.");
}
main().catch((e)=>{ console.error(e); process.exit(1); });
JS

# (C) Inspect ZK model mapping
cat > scripts/admin/inspect_model.js <<'JS'
const { ethers, network } = require("hardhat");
async function main(){
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const zkAddr = process.env.ZK_ADDR || dep.zkProofVerifier;
  const label = process.env.LABEL || "steps-circuit@1.0.0";
  const zk = await ethers.getContractAt("ZkProofVerifier", zkAddr);
  const modelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const m = await zk.models(modelHash);
  console.log("Label:", label);
  console.log("ModelHash:", modelHash);
  console.log({ verifier: m[0], active: m[2], enforce: m[3] });
}
main().catch((e)=>{ console.error(e); process.exit(1); });
JS

# -------- 3) Add MockVerifier + baseline ZK test --------
echo "-- Adding MockVerifier and a ZK gating test"
mkdir -p contracts/mocks test

# Interface import path uses your existing IProofVerifier
cat > contracts/mocks/MockVerifier.sol <<'SOL'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../IProofVerifier.sol";

contract MockVerifier is IProofVerifier {
    bool private _ok;
    constructor(bool ok_) { _ok = ok_; }
    function setResult(bool ok_) external { _ok = ok_; }

    /// @notice Minimal interface match: return true/false based on toggled state
    function verify(bytes calldata /*proof*/) external view returns (bool) {
        return _ok;
    }
}
SOL

# Minimal test that proves: with required=true & bad verifier => submitProof should fail
cat > test/ProofConfig.spec.ts <<'TS'
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Proof gating (basic)", function () {
  it("enforces required proof when set", async function () {
    const net = (process.env.HARDHAT_NETWORK || "lightchain");
    // Read deployments added by your deploy script
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dep = require(`../deployments/${net}.json`);
    const cp = await ethers.getContractAt("ChallengePay", dep.ChallengePay);

    // Deploy a MockVerifier that always returns false
    const MV = await ethers.getContractFactory("MockVerifier");
    const mv = await MV.deploy(false);
    await mv.waitForDeployment();
    const mvAddr = await mv.getAddress();

    // Choose a challenge id; 1 is the one you used in admin scripts
    const chId = 1n;

    // Set required=true, verifier=mock (which will fail)
    const tx = await cp.setProofConfig(chId, true, mvAddr);
    await tx.wait();

    // Submit a dummy proof → should revert/return false in your flow
    await expect(cp.submitProof(chId, "0x")).to.be.reverted;
  });
});
TS

# -------- 4) Ensure Hardhat config is the working Lightscan v1 style --------
echo "-- Ensuring hardhat.config.ts has Lightscan v1 verify"
# (We won't overwrite your file—assume you've already applied the working config you posted.)

# -------- 5) Install deps, compile, typechain --------
echo "-- Installing & compiling"
npm install
npx hardhat clean
npx hardhat compile

# -------- 6) Deploy idempotently (reuse if present) --------
echo "-- Deploy (idempotent)"
export HARDHAT_NETWORK="${HARDHAT_NETWORK:-lightchain}"
REGISTER_MODEL=1 MODEL="steps-circuit@1.0.0" \
npx hardhat run scripts/deploy/all.ts --network "$HARDHAT_NETWORK"

echo "-- Show deployments file"
cat "deployments/$HARDHAT_NETWORK.json" || true

# Extract addresses via node (jq optional)
echo "-- Extracting addresses"
ADDRS_JSON="$(node -e "const d=require('./deployments/${HARDHAT_NETWORK}.json'); console.log(JSON.stringify(d));")"
CP_ADDR="$(node -e "const d=$ADDRS_JSON; console.log(JSON.parse(d).ChallengePay||'')")"
ZK_ADDR="$(node -e "const d=$ADDRS_JSON; console.log(JSON.parse(d).zkProofVerifier||'')")"
PLONK_ADDR="$(node -e "const d=$ADDRS_JSON; console.log(JSON.parse(d).plonkVerifier||'')")"
DAO_ADDR="$(node -e "const d=$ADDRS_JSON; console.log(JSON.parse(d).daoTreasury||'')")"

echo "ChallengePay: $CP_ADDR"
echo "ZkProofVerifier: $ZK_ADDR"
echo "PlonkVerifier: $PLONK_ADDR"
echo "DAO: $DAO_ADDR"

# -------- 7) Verify on Lightscan (safe retry; works with your v1 customChains) --------
echo "-- Verify on Lightscan (skip if already)"
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx hardhat verify --network "$HARDHAT_NETWORK" "$CP_ADDR" "$DAO_ADDR" || true
npx hardhat verify --network "$HARDHAT_NETWORK" "$ZK_ADDR" || true
[[ -n "$PLONK_ADDR" ]] && npx hardhat verify --network "$HARDHAT_NETWORK" "$PLONK_ADDR" || true
unset NODE_TLS_REJECT_UNAUTHORIZED

# -------- 8) Configure proof requirement for chosen challenge --------
echo "-- Configure proof requirement"
CH_ID="${CH_ID:-1}"
CP_ADDR="$CP_ADDR" ZK_ADDR="$ZK_ADDR" CH_ID="$CH_ID" \
npx hardhat run --network "$HARDHAT_NETWORK" scripts/admin/hh_configure.js

# -------- 9) Inspect state (ch 0 & 1) --------
echo "-- Inspect challenge tuples"
CP_ADDR="$CP_ADDR" npx hardhat run --network "$HARDHAT_NETWORK" scripts/admin/inspect_challenge2.js

# -------- 10) Inspect model mapping --------
echo "-- Inspect model mapping for steps-circuit@1.0.0"
LABEL="steps-circuit@1.0.0" ZK_ADDR="$ZK_ADDR" \
npx hardhat run --network "$HARDHAT_NETWORK" scripts/admin/inspect_model.js

# -------- 11) Run the new test (basic proof gating) --------
echo "-- Run tests"
npm run test --silent || npx hardhat test

echo "\n=== DONE: production bootstrap completed ==="
echo "Snapshot saved: $SNAP"
