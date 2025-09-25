
# SCRIPTS

All commands default to `--network lightchain`. Override with `--network <net>` when needed.  
Export `.env` with your keys and RPCs first.

---

## 🔨 Deploy & Admin

- **Build contracts:**  
  `npm run build`

- **Deploy core ChallengePay:**  
  `npm run deploy`  
  → writes `deployments/<net>.json`.

- **Deploy metadata registry:**  
  `npm run deploy:registry`

- **Deploy mock verifier:**  
  `npm run deploy:verifier`

- **Deploy multi-sig verifier:**  
  `npm run deploy:msigverifier`  
  Env: `MSIG_OWNER`, `MSIG_ATTESTERS`, `MSIG_THRESHOLD`

- **Bootstrap multi-sig attesters:**  
  `npm run msig:bootstrap`  
  (funds attesters, whitelists, sets threshold)

- **Set fee config (losers split + cashback):**  
  `npm run set:fees`  
  Env: `LOSERS_FEE_BPS`, `DAO_BPS`, `CREATOR_BPS`, `VALIDATORS_BPS`, `LOSER_CASHBACK_BPS`

- **Set approval lead time (sec):**  
  `npm run set:lead`  
  Env: `LEAD`

- **Set validator params:**  
  `npm run set:validatorParams`  
  Env: `MIN_STAKE`, `THRESHOLD_BPS`, `QUORUM_BPS`, `UNSTAKE_COOLDOWN`

---

## 🏁 Challenge Lifecycle

- **Create:**  
  `npm run create`  
  Env: `STAKE`, `BOND`, `START_TS` or `START_PAD`, `AD_PAD`, `MAX_PARTICIPANTS`, `PEERS`, `PEER_M`, `CHARITY_BPS`, `CHARITY`, `PROOF_REQUIRED`, `VERIFIER`

- **Approve/Reject (validator):**  
  `npm run approve`  
  Env: `CH_ID`, `DECISION=true|false`

- **Peer vote (after startTs):**  
  `npm run peer:vote`  
  Env: `CH_ID`, `PASS=true|false`

- **Submit proof (raw):**  
  `npm run submitProof`  
  Env: `CH_ID`, `PROOF=0x...` or `PROOF_FILE=./proof.bin`

- **Compose + Submit multi-sig proof (local keys):**  
  `npm run proof:compose`  
  Env: `CH_ID`, `VERIFIER`, `ATTESTER_PKS=pk1,pk2,...`, `DATASET_STR`, `RULE_KIND`, `MIN_DAILY`

- **Finalize:**  
  `npm run finalize`  
  Env: `CH_ID`  
  (Explains common reverts)

- **Finalize when ready (auto waits until eligible):**  
  `npm run finalize:whenReady`  
  Env: `CH_ID`, optional `POLL_SEC`

- **Cancel (creator/admin, pending only):**  
  `npm run cancel`  
  Env: `CH_ID`

---

## 🎮 Participation

- **Join success-side (contribution):**  
  `npm run join`  
  Env: `CH_ID`, `AMOUNT`

- **Bet on outcome:**  
  `npm run bet`  
  Env: `CH_ID`, `SIDE=success|fail`, `AMOUNT`

---

## 💰 Claims

- **Winner claim:**  
  `npm run claim:winner`  
  Env: `CH_ID`

- **Loser cashback claim:**  
  `npm run claim:loser`  
  Env: `CH_ID`

- **Validator claim:**  
  `npm run claim:validator`  
  Env: `CH_ID`

- **Auto claim (winners/losers/validators):**  
  `npm run claim:auto`  
  Env: `CH_ID`

---

## 🛡️ Validators

- **Stake:**  
  `npm run ops:stake`  
  Env: `AMOUNT`

- **Request unstake:**  
  `npm run ops:unstake:req`  
  Env: `AMOUNT`

- **Withdraw unstaked (after cooldown):**  
  `npm run ops:unstake:wd`

- **List validators:**  
  `npm run ops:listValidators`

---

## 🔎 Inspect / Status

- **Status (table/json):**  
  `npm run status` / `npm run status:json`

- **List challenges (table/json):**  
  `npm run list` / `npm run list:json`

- **Export challenge:**  
  `npm run export`  
  Env: `CH_ID`

- **Snapshot (finalized payout view):**  
  `npm run snapshot`  
  Env: `CH_ID`

- **Pools view:**  
  `npm run inspect:pools`  
  Env: `CH_ID`

- **Creator payout context:**  
  `npm run inspect:creator`  
  Env: `ADDR`, `CH_ID`

- **My payout inspector:**  
  `npm run inspect:myPayout`  
  Env: `ADDR`, `CH_ID`

---

## 🧑‍💻 Health / Gas / Tests

- **RPC health:**  
  `npm run ping`

- **Gas report:**  
  `npm run gas`

- **Run tests:**  
  `npm test`

- **Watch tests:**  
  `npm run test:watch`

---

### 🌐 Common Envs

- `PRIVATE_KEY` – default signer  
- `LIGHTCHAIN_RPC`, `LIGHTCHAIN_CHAIN_ID` – RPC & chain id  
- `DAO_ADDRESS` – DAO treasury  
- `NATIVE_SYMBOL` – native token symbol (default ETH, override → LCAI)  
- `ATTESTER_PKS` – comma list of local attester keys for multi-sig proofs  