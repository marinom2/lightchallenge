# LightChallenge (LightChain Testnet)

[![Coverage Status](https://img.shields.io/coveralls/github/YOUR_GITHUB/lightchallenge?style=flat-square)](https://coveralls.io/github/YOUR_GITHUB/lightchallenge)

Stake-weighted, permissionless validators + public challenges on LightChain.  

Contracts:
- **ChallengePay.sol** — core protocol (challenge creation, validation, payouts)
- **MetadataRegistry.sol** — auxiliary URI registry for off-chain metadata
- **MultiSigProofVerifier.sol** — pluggable verifier contract for m-of-n attestation proofs

---

## 🚀 Quickstart

```bash
# 1) Install deps
npm i

# 2) Copy env and fill secrets (DO NOT COMMIT .env)
cp .env.example .env
# set LIGHTCHAIN_RPC, PRIVATE_KEY, DAO_ADDRESS, etc.

# 3) Compile contracts
npm run build

# 4) Deploy core protocol to LightChain
npm run deploy
# → writes deployments/lightchain.json with contract addresses

# 5) Sanity check RPC / node health
npm run ping

🧪 Testing & Coverage

npm run clean
npm run build
npm test
npm run coverage

Unit tests cover validator staking, challenge lifecycle, proof submission, payouts
Coverage reports checked in CI (npm run coverage:ci)


🔑 Attestations (m-of-n, off-chain signed)

We bind a result to chain+verifier to prevent replay:

Struct (Solidity / ABI order)

Attestation(
  uint256 challengeId,
  address subject,
  uint64 periodStart,
  uint64 periodEnd,
  uint8 ruleKind,
  uint32 minDaily,
  bytes32 datasetHash,
  bool pass,
  uint256 chainId,
  address verifier
)


TYPEHASH
0x3b94011e0cfe69b0a03951dca1e445e2ea0292a290a59e7e1a04e1f2a8b615b3

Digest = keccak256(abi.encode(TYPEHASH, ...fields))
EOAs sign with signMessage(hash) (which prefixes \x19Ethereum Signed Message:\n32 automatically).

Proof bytes = abi.encode(Attestation att, bytes[] sigs)

Verifier checks:
	•	att.challengeId == challengeId
	•	att.subject == subject
	•	att.chainId == block.chainid
	•	att.verifier == address(this)
	•	att.pass == true
	•	≥ threshold unique isAttester signatures over the attestation hash


See scripts/lib/attestation.ts and scripts/ops/composeAndSubmitProof.ts.


🛠️ Development Notes
	•	Start vs Approval Deadlines
	•	Every challenge enforces an approval deadline (validators must approve before start).
	•	startTs is strict: no finalize, payout, or peer voting before start.
	•	Ensures fairness and prevents premature settlement.
	•	Finalization
	•	finalize.ts explains common reverts (BeforeDeadline, PeersNotMet, ProofRequired).
	•	For automation, use finalizeWhenReady.ts → polls chain until eligible, then finalizes.
	•	Multi-Sig Verifier
	•	Deploy with npm run deploy:msigverifier.
	•	Bootstrap attesters: npm run msig:bootstrap.
	•	Env keys:
	•	MSIG_OWNER, MSIG_ATTESTERS (comma list), MSIG_THRESHOLD

⸻

🌐 Environment Variables
	•	LIGHTCHAIN_RPC – RPC endpoint (e.g. https://testnet-rpc.lightchain.ai)
	•	PRIVATE_KEY – your deployer/validator key
	•	DAO_ADDRESS – DAO treasury address
	•	NATIVE_SYMBOL – symbol for display (default: ETH, override to LCAI)
	•	STAKE, BOND – amounts in native units
	•	START_TS – explicit start timestamp (or omit → auto padded)
	•	PEERS, PEER_M – peer approval addresses and threshold
	•	CHARITY, CHARITY_BPS – optional charity split

⸻

📂 Useful Scripts

See SCRIPTS.md for the full catalog:
	•	Deployment (core, registry, verifier)
	•	Challenge lifecycle (create → approve → submit proof → finalize)
	•	Validator lifecycle (stake, unstake, withdraw)
	•	Claims (winners, losers, validators)
	•	Inspectors (status, pools, payouts)


