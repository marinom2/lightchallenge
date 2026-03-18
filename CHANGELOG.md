# Changelog

All notable changes to the LightChallenge protocol are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0-alpha] — 2026-03-18

iOS app hardening, mobile auth pipeline, and phase-aware challenge states.

### Added

- **Transaction-receipt authentication** — Server-side fallback for mobile clients that cannot perform `personal_sign` on LightChain's custom chain. Verifies on-chain tx receipt `from` matches claimed wallet address. Applied to `POST/PATCH /api/challenges` and `POST /api/challenge/[id]/participant`. (`webapp/lib/auth.ts:verifyByTxReceipt()`)
- **Phase-aware UserChallengeState** — New `.submitted` state distinguishes between active verification (`.awaitingVerdict`) and post-deadline waiting (`.submitted`). Prevents "under evaluation" showing forever after proof window ends.
- **Verdict reasons display** — Failed challenge card now shows up to 3 bullet points from verdict reasons, giving users visibility into why they failed.
- **iOS challenge creation pipeline** — `ContractService.saveChallengeMeta` now sends `txHash` for tx-receipt auth, with error logging for HTTP failures.
- **iOS success screen redesign** — After creating a challenge: larger checkmark, challenge title, info card (ID + stake + tx hash), full-width "View Challenge" button.

### Fixed

- **Challenge metadata not saving from iOS** — API returned 401 because iOS couldn't send `x-lc-signature` header. Fixed by tx-receipt auth fallback.
- **"Under evaluation" forever** — `UserChallengeState.from()` returned `.awaitingVerdict` whenever evidence existed regardless of phase. Now returns `.submitted` for ended/finalized challenges.
- **Manual upload logic incorrect** — `canShowManualUpload` showed upload button during wrong phases and for creators who hadn't joined. Fixed to require `youJoined == true` and `.proofWindow` phase.
- **Meta endpoint losing data** — `fetchChallengeMeta` hardcoded `status: nil, funds: nil, params: nil`. Fixed to decode and pass through actual API response values.

### Changed

- **Documentation updates** — Updated API reference (tx-receipt auth), iOS README (complete rewrite), OPERATIONS.md (section 16), SECURITY.md (auth model), webapp README (route table).

---

## [0.1.0-alpha] — 2026-03-14

Initial testnet deployment at `uat.lightchallenge.app`.

### Added

- **Smart Contracts**
  - ChallengePay V1 with binary settlement (Active/Finalized/Canceled lifecycle)
  - EventChallengeRouter for multi-outcome event routing
  - Treasury with bucketed custody and pull-based claims
  - MetadataRegistry for off-chain metadata URIs
  - TrustedForwarder for EIP-2771 gasless transactions
  - ChallengeTaskRegistry for AIVM task bindings
  - ChallengePayAivmPoiVerifier for Proof-of-Intelligence verification
  - ChallengeAchievement NFT contract

- **Evidence Pipeline**
  - Evidence collector worker (Apple Health, Strava, Garmin, Fitbit, Google Fit)
  - Evidence evaluator (structural pass/fail for fitness and gaming)
  - Challenge dispatcher (verdict → AIVM job queue)
  - Challenge worker (AIVM inference request submission)
  - AIVM indexer (InferenceFinalized → ChallengePay bridge)
  - Status and claims indexers

- **Webapp**
  - Explore page with challenge browser and category tabs
  - Challenge creation wizard (4-step flow)
  - Challenge detail page with modular components
  - Claims page with reward withdrawal
  - Proof submission with QR handoff for mobile
  - Admin panel for template and model management
  - RainbowKit wallet integration (MetaMask, WalletConnect, Coinbase)
  - Network status indicator in navbar

- **Templates & Models**
  - 20 challenge templates across 8 intent types
  - 10 AIVM models (fitness, gaming, custom)
  - Template-model wiring with adapter-hash mapping

- **iOS Collector**
  - HealthKit integration (read-only: steps, walking+running distance)
  - Deep link support (`lightchallenge://challenge/{id}`)
  - Signed evidence token authentication (EIP-191)
  - Environment switching (UAT/Production/Local Dev)

- **AIVM Integration**
  - Client-only integration with Lightchain AIVM network
  - Native worker processing (commit → reveal → PoI attest)
  - E2E validated on testnet (challenges 42, 44)

- **Infrastructure**
  - Deployed to Vercel (uat.lightchallenge.app)
  - Neon PostgreSQL database
  - Cloudflare DNS management
  - Nextra documentation portal
  - GitHub CI/CD with auto-deploy

- **Documentation**
  - PROTOCOL.md, DEPLOY.md, OPERATIONS.md, ENVIRONMENTS.md
  - API reference, iOS collector guide, FAQ
  - Architecture documentation with contract and worker diagrams
