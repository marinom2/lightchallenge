# AIVM E2E Testnet README

## Purpose

This README documents the full working end-to-end AIVM testnet flow that was successfully executed:

1. Deploy validator registry
2. Register validator
3. Deploy `AIVMInferenceV2`
4. Deposit worker bond
5. Request inference
6. Commit inference
7. Reveal inference
8. Submit PoI attestation
9. Verify finalization

This is the first confirmed full contract-path proof that the AIVM + PoI flow works on Lightchain testnet with a live validator registry.

---

## Final working contracts

### Validator Registry

`0xB4024725f6B4Fb6C069EfdA842E05CFb2dDaEC0D`

### AIVMInferenceV2

`0x2d499C52312ca8F0AD3B7A53248113941650bA7E`

### Test wallet used

`0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217`

### Network

* RPC: `https://light-testnet-rpc.lightchain.ai`
* Chain ID: `504`

---

## Important lesson from debugging

The validator registry address found in the repo deployment JSON was:

`0x79C3473d3249fb3a70E2D3e386e9C45abE62752D`

That address existed in repository metadata, but **there was no contract code deployed there anymore** on testnet.

Because of that:

* PoI attestation could not succeed
* `_isActiveValidator()` inside `AIVMInferenceV2` could never pass
* finalization was blocked

The issue was not the AIVM contract logic.
The issue was that the old registry address was stale.

The fix was:

* deploy a new real validator registry
* register a validator in it
* deploy a new AIVM contract pointing to that live registry

---

## Successful result

The full flow completed successfully.

Final proof from the successful run:

* `poiAttestationCount = 1`
* `poiQuorum = 1`
* `poiResultHashByTask = responseHash`
* `status = 4`
* `finalizedAt != 0`
* on-chain response stored correctly

On-chain response:

`The capital of France is Paris.`

That confirms the following pieces all work together:

* validator registry binding
* worker bond deposit
* request creation
* commitment generation
* reveal verification
* EIP-712 PoI signing
* PoI attestation submission
* automatic finalization

---

## Current known-good script

The working end-to-end script is:

`scripts/interaction/aivm-e2e-full.cjs`

This script performs:

* request
* commit
* reveal
* submitPoI
* verify finalized

---

## Working environment

### Required Node version

Use Node 22.

Recommended shell path setup:

```zsh
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
hash -r
node -v
```

Expected:

```zsh
v22.x.x
```

---

## Environment variables used for the successful run

```zsh
export RPC="https://light-testnet-rpc.lightchain.ai"
export PK="<your-testnet-private-key>"
export AIVM="0x2d499C52312ca8F0AD3B7A53248113941650bA7E"
export REG="0xB4024725f6B4Fb6C069EfdA842E05CFb2dDaEC0D"
export WALLET="$(cast wallet address --private-key $PK)"

export MODEL="llama3-8b"
export PROMPT_HASH="0x1111111111111111111111111111111111111111111111111111111111111111"
export PROMPT_ID="0x2222222222222222222222222222222222222222222222222222222222222222"
export MODEL_DIGEST="0x3333333333333333333333333333333333333333333333333333333333333333"
export DET_CONFIG_HASH="0x4444444444444444444444444444444444444444444444444444444444444444"
export REQUEST_FEE_WEI="1000000000000000"
export WORKER_BOND_WEI="10000000000000000"

export RESPONSE="The capital of France is Paris."
export SECRET="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export TRANSCRIPT_HASH="0x0000000000000000000000000000000000000000000000000000000000000000"
export SLOT="0"
```

---

## Run command

```zsh
cd ~/Desktop/lcai-smart-contract && \
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH" && \
hash -r && \
export RPC="https://light-testnet-rpc.lightchain.ai" && \
export PK="<your-testnet-private-key>" && \
export AIVM="0x2d499C52312ca8F0AD3B7A53248113941650bA7E" && \
export MODEL="llama3-8b" && \
export PROMPT_HASH="0x1111111111111111111111111111111111111111111111111111111111111111" && \
export PROMPT_ID="0x2222222222222222222222222222222222222222222222222222222222222222" && \
export MODEL_DIGEST="0x3333333333333333333333333333333333333333333333333333333333333333" && \
export DET_CONFIG_HASH="0x4444444444444444444444444444444444444444444444444444444444444444" && \
export REQUEST_FEE_WEI="1000000000000000" && \
export WORKER_BOND_WEI="10000000000000000" && \
export RESPONSE="The capital of France is Paris." && \
export SECRET="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" && \
export TRANSCRIPT_HASH="0x0000000000000000000000000000000000000000000000000000000000000000" && \
export SLOT="0" && \
node scripts/interaction/aivm-e2e-full.cjs
```

---

## Expected successful output pattern

You should see the following stages:

```text
=== CHECK VALIDATOR REGISTRY ===
=== DEPOSIT WORKER BOND ===
=== REQUEST ===
=== COMPUTE COMMITMENT ===
=== COMMIT ===
=== REVEAL ===
=== SIGN PoI ===
=== SUBMIT PoI ===
=== VERIFY FINALIZED ===
=== RESULT ===
SUCCESS: full request → commit → reveal → submitPoI → finalized flow completed
```

And specifically:

```text
poiAttestationCount= 1
poiQuorum= 1
status= 4
finalizedAt= <non-zero>
response(onchain)= The capital of France is Paris.
```

---

## Meaning of the request lifecycle

Practical meaning of the tested flow:

* **Requested**: requester anchors the task on-chain
* **Committed**: worker locks in a commitment hash
* **Revealed**: worker reveals response and secret
* **PoI submitted**: validator signs and submits attestation
* **Finalized**: PoI result matches response hash and quorum is met

In this tested setup, quorum was `1`, so one valid attestation was enough.

---

## Why the first attempts failed

### 1. Old request expired

Earlier commit attempts failed with `DeadlinePassed` because the commit window had already expired.

### 2. Wrong or stale validator registry

The original registry from repo metadata had no code on-chain. That blocked PoI validation completely.

### 3. Broken local Hardhat artifacts

Some attempts to inspect state with Hardhat failed because:

* local artifact JSON became corrupted
* Hardhat / TypeChain writes timed out
* Node version mismatches caused additional issues

Those problems were local tooling issues, not contract logic issues.

### 4. Placeholder command mistakes

Some shell attempts failed because of:

* placeholder values left in commands
* malformed commitment construction
* accidentally using expired request IDs

Once the flow was redone cleanly on a fresh request, it worked.

---

## What is confirmed working now

### Confirmed

* New validator registry deployment
* Validator registration
* AIVM deployment with live registry
* Worker bond deposit
* Request creation
* Commit step
* Reveal step
* EIP-712 attestation signing
* PoI submission
* Finalization

### Not yet production-grade

* Real prompt storage / coordinator integration
* Real model digest sourcing from live model service
* Real transcript hash generation
* Multi-validator quorum flows
* Automated monitoring / retries / timeout handling
* Cleaner deployment artifact sync

---

## Recommended next steps

### 1. Save these addresses permanently

Use these as your working testnet baseline:

* Registry: `0xB4024725f6B4Fb6C069EfdA842E05CFb2dDaEC0D`
* AIVM: `0x2d499C52312ca8F0AD3B7A53248113941650bA7E`

### 2. Rotate the exposed test key

Even for testnet, rotate it and replace it in future runs.

### 3. Keep `aivm-e2e-full.cjs` as the baseline proof script

This is now your minimal known-good reference implementation.

### 4. Build the next version with real upstream data

Replace placeholder values with:

* real `promptHash`
* real `promptId`
* real `modelDigest`
* real `detConfigHash`
* real transcript data from the worker/coordinator path

### 5. Add multi-validator testing

Next useful milestone:

* quorum > 1
* multip
