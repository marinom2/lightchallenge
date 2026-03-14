# Final Testing Checklist

Manual end-to-end testing guide for LightChallenge pre-production.

---

## Prerequisites

### Environment

```bash
# 1. Verify env file
cat webapp/.env.local | grep -c DATABASE_URL   # should output 1
cat webapp/.env.local | grep -c PRIVATE_KEY     # should output 1

# 2. Run migrations (idempotent)
npx tsx db/migrate.ts

# 3. Verify seeded challenges exist
npx tsx -e "
const dotenv = require('dotenv'); const path = require('path');
dotenv.config({ path: path.resolve(process.cwd(), 'webapp/.env.local') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
pool.query('SELECT id, title, status FROM public.challenges WHERE id >= 100 ORDER BY id')
  .then(r => { r.rows.forEach(row => console.log(row.id, row.status, row.title)); pool.end(); });
"
```

### Start Services

```bash
# Terminal 1: Webapp (Next.js)
cd webapp && npm run dev

# Terminal 2: Evidence evaluator
npx tsx offchain/workers/evidenceEvaluator.ts

# Terminal 3: Challenge dispatcher
npx tsx offchain/dispatchers/challengeDispatcher.ts

# Terminal 4: Challenge worker
npx tsx offchain/workers/challengeWorker.ts

# Terminal 5: AIVM indexer
npx tsx offchain/indexers/aivmIndexer.ts

# Terminal 6: Claims indexer (optional, for claim testing)
npx tsx offchain/indexers/claimsIndexer.ts
```

### Verify Webapp

Open http://localhost:3000 in browser. Connect wallet (MetaMask or WalletConnect).

---

## Test Matrix

### Seeded Test Challenges (Batch 1)

| ID  | Type | Category | Mode | Test Target |
|-----|------|----------|------|-------------|
| 100 | Steps (7 days) | Fitness | Threshold | Apple Health / Garmin / Fitbit / Google Fit upload |
| 101 | Run 5K (14 days) | Fitness | Threshold | Strava / Garmin data upload |
| 102 | Win 2 Dota matches | Gaming | Threshold | Steam link + OpenDota verification |
| 103 | Steps competition | Fitness | Competitive | Apple Health upload, score ranking |
| 104 | Dota kills (top 3) | Gaming | Competitive | Steam link + match data, kill scoring |

### Demo Challenges (Batch 2)

| ID  | Title | Category | Mode |
|-----|-------|----------|------|
| 110 | 10K Daily Steps Challenge | Fitness | Threshold |
| 111 | Half Marathon Month | Fitness | Threshold |
| 112 | Step King: Most Steps Wins | Fitness | Competitive |
| 113 | Dota Domination: Win 5 Matches | Gaming | Threshold |
| 114 | LoL Ranked Grind: Win 10 of 20 | Gaming | Threshold |
| 115 | CS2 FACEIT Warrior: 5 Wins | Gaming | Threshold |
| 116 | Distance Showdown: Top 2 Win | Fitness | Competitive |

---

## Test Flows

### 1. Challenge Catalog (Explore)

1. Navigate to http://localhost:3000/explore
2. Verify seeded challenges appear in the list
3. Verify threshold vs competitive badges render correctly
4. Click a challenge card to open detail page

### 2. Challenge Creation

1. Navigate to http://localhost:3000/challenges/create
2. Select **Fitness > Steps > Steps - Every day**
3. Set min steps = 5000, days = 3
4. Set start time to 2 minutes from now
5. Set stake amount
6. Submit and verify challenge appears on explore page

### 3. Join Challenge (On-Chain)

**Note:** Joining requires an on-chain transaction. The seeded DB challenges (100-116) have no on-chain state. To test the full join flow, create a challenge via the webapp first.

1. Open a challenge detail page: http://localhost:3000/challenge/{id}
2. Click "Join Challenge"
3. Confirm the transaction in your wallet
4. Verify participant count increases

### 4. Apple Health Evidence (iPhone)

**Local-only steps:**

1. Open Xcode project: `mobile/ios/LightChallengeApp/LightChallengeApp.xcodeproj`
2. Set signing team: Select your Apple Developer account in Signing & Capabilities
3. Change bundle identifier if needed (e.g. `com.yourname.LightChallengeApp`)
4. Connect iPhone via USB
5. Select your iPhone as build target
6. Build and run (Cmd+R)

**In the app:**

1. Tap "Grant HealthKit Access" and approve the permissions dialog
2. Enter Challenge ID (e.g. `100`)
3. Enter your wallet address (e.g. `0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217`)
4. Tap "Local Dev" to switch server URL to `http://localhost:3000`
   - **Important:** For local dev, your Mac and iPhone must be on the same network
   - Replace `localhost` with your Mac's local IP (e.g. `http://192.168.1.X:3000`)
5. Tap "Collect Health Data"
6. Review the data preview (total steps, distance, active days)
7. Tap "Submit Evidence"
8. Verify green checkmark and evidence ID

**Alternative (desktop upload):**

1. Export Apple Health data from iPhone: Health app > Profile > Export All Health Data
2. Transfer the .zip file to your Mac
3. Open challenge detail page in browser
4. Click "Upload Apple Health data" and select the .zip file

### 5. Manual Evidence Upload (Fitness - Desktop Fallback)

For Strava, Garmin, Fitbit, Google Fit:

1. Navigate to http://localhost:3000/challenge/{id}
2. The detail page shows "Upload {Provider} data" button
3. Upload a JSON file with activity records. Example Garmin JSON:
```json
[
  {
    "provider": "garmin",
    "user_id": "test",
    "activity_id": "garmin_2026_03_14",
    "type": "steps",
    "start_ts": 1773648000,
    "end_ts": 1773734399,
    "duration_s": 86400,
    "steps": 8500,
    "distance_m": 6000,
    "source_device": "Garmin Venu"
  }
]
```
4. Submit via `POST /api/aivm/intake` with multipart form:
```bash
curl -X POST http://localhost:3000/api/aivm/intake \
  -F "challengeId=100" \
  -F "subject=0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217" \
  -F "modelHash=0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e" \
  -F "json=[{\"provider\":\"garmin\",\"type\":\"steps\",\"start_ts\":1773648000,\"steps\":8500}]"
```
5. Verify response contains `{ ok: true, evidenceId: "..." }`

### 6. Evidence Evaluation Pipeline

After evidence is submitted:

1. Watch the `evidenceEvaluator` terminal for output
2. Verify verdict is created: check `public.verdicts` table
3. For competitive challenges: verify `score` column is populated

```bash
npx tsx -e "
const dotenv = require('dotenv'); const path = require('path');
dotenv.config({ path: path.resolve(process.cwd(), 'webapp/.env.local') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
pool.query('SELECT challenge_id, subject, pass, score, reasons FROM public.verdicts ORDER BY created_at DESC LIMIT 5')
  .then(r => { console.table(r.rows); pool.end(); });
"
```

### 7. Competitive Mode Testing

1. Submit evidence for challenge 103 (Steps Competition) from 2+ wallets
2. Wait for evaluator to produce verdicts with scores
3. Wait for proof deadline to pass (or adjust timeline in DB for testing)
4. Watch `challengeDispatcher` output for ranking application
5. Verify: top-N get `pass=true`, rest get `pass=false` in verdicts

### 8. AIVM Dispatch and Finalization

For challenges with on-chain state:

1. After dispatcher creates `aivm_jobs` entry, watch `challengeWorker`
2. Worker calls `requestInferenceV2` on-chain
3. Watch `aivmIndexer` for `InferenceFinalized` event
4. Indexer calls `submitProofFor` + `finalize()`
5. Check challenge status changes to `Finalized` in DB

### 9. Claims

1. After finalization, navigate to http://localhost:3000/claims
2. Winners should see "Claim Reward" button
3. Losers should see "Claim Cashback" button (if cashback > 0)
4. Click claim and confirm transaction

---

## DB Verification Queries

```bash
# All active challenges
npx tsx -e "..." # SELECT * FROM public.challenges WHERE status = 'Active' ORDER BY id

# Evidence for a challenge
npx tsx -e "..." # SELECT * FROM public.evidence WHERE challenge_id = 100

# Verdicts
npx tsx -e "..." # SELECT * FROM public.verdicts WHERE challenge_id = 100

# AIVM jobs
npx tsx -e "..." # SELECT * FROM public.aivm_jobs ORDER BY created_at DESC LIMIT 5

# Claims
npx tsx -e "..." # SELECT * FROM public.claims ORDER BY created_at DESC LIMIT 5
```

---

## Template Coverage Verification

Verify all 8 intent combinations resolve templates and models:

| Intent | Templates expected | Model(s) |
|---|---|---|
| FITNESS + Steps | steps_daily, steps_competitive | apple_health.steps@1 |
| FITNESS + Running | running_window, distance_competitive, duration_threshold | strava.distance_in_window@1 |
| FITNESS + Cycling | cycling_window | strava.cycling_distance_in_window@1 |
| FITNESS + Hiking | hiking_elev_gain_window | strava.elevation_gain_window@1 |
| FITNESS + Swimming | swimming_laps_window | strava.swimming_laps_window@1 |
| GAMING + Dota | hero_kills, private_1v1, private_5v5, kills_competitive, win_streak, dota_match_wins | dota.hero_kills_window@1, dota.private_match_1v1@1, dota.private_match_5v5@1 |
| GAMING + LoL | lol_winrate, lol_kills_competitive, lol_match_wins | lol.winrate_next_n@1 |
| GAMING + CS2 | cs2_faceit_wins, cs2_faceit_kills_competitive | cs2.faceit_wins@1 |

For each: select the intent on Step 1, advance to Step 3, verify the template picker shows the correct templates and "Model hash could not be resolved" does NOT appear.

## Model Registry (Public Access)

```bash
curl -s http://localhost:3000/api/admin/models | jq '.models | length'
# Expected: 10+ (no auth required for GET)
```

---

## Known Limitations

- **DB-only seeds**: Challenges 100-116 exist only in the database, not on-chain. They will show in the webapp catalog but cannot be joined on-chain. Use the create-challenge flow to make fully on-chain testable challenges.
- **Local AIVM testing**: The AIVM network processes requests asynchronously. On testnet, finalization takes 1-5 minutes.
- **Apple Health on Simulator**: HealthKit is not available on iOS Simulator. You must use a physical iPhone.
- **FACEIT integration**: CS2 challenges require a FACEIT account linked to Steam. Valve does not provide a public matchmaking API.
- **Competitive deadline**: Competitive challenges only dispatch after the proof deadline passes. For testing, set short timelines (minutes, not days).
