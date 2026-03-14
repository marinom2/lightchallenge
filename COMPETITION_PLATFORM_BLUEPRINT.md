# LightChallenge → Competition Infrastructure Platform

## Strategic Analysis & Product Blueprint

**Date:** March 2026
**Status:** Strategic Evaluation

---

## Executive Summary

LightChallenge has a unique technical foundation — on-chain prize escrow, AI-powered evidence verification, and pluggable proof architecture — that positions it not just as a challenge app, but as **competition infrastructure**. This document evaluates the opportunity to evolve into a Private Tournament API that organizations (esports teams, creators, fitness brands, corporates) use to run verified competitions with trustless prize distribution.

The total addressable market spans three segments:
- **Esports tournament infrastructure**: $4.5-8B (2026), growing 21% CAGR
- **Corporate wellness challenges**: $65-70B (2025), growing 8.5% CAGR
- **Brand-sponsored fitness competitions**: $30K-50K per Strava challenge; market expanding

No existing platform combines **automated evidence verification + on-chain escrow + multi-category support (gaming + fitness)**. That's the gap.

---

## Part 1: Competitive Landscape

### 1.1 Esports Tournament Platforms

| Platform | Users | Revenue/Funding | API | Prize Handling | Verification | Pricing Model |
|----------|-------|-----------------|-----|----------------|-------------|---------------|
| **FACEIT** | 18M+ users, 20M sessions/mo | Acquired $1.05B (Savvy Games, 2022) | REST API; recently moved to paid (~EUR270K/yr for heavy users) | Internal wallet + direct payout | Anti-cheat (client), match API auto-detect | Freemium; Premium subs ($7-13/mo) |
| **Battlefy** | Major publisher clients (Nintendo, Riot) | $8.5M raised | Limited public API | Organizer-managed | Manual reporting + admin tools | Free tier; enterprise custom |
| **Toornament** | Mid-market + publishers | Self-funded SaaS | Full REST API (Viewer/Participant/Organizer) | 0% fee on registrations (organizer keeps all) | Manual + optional automation | Free (32 players) -> Boost -> Community -> Circuit -> Arena -> Platform (white-label) |
| **Challengermode** | 33M+ competitions, 500K monthly visitors | $2M raised (Oct 2024) | Game integration API + client API | Platform-managed | Auto-detect + manual | Free to start; enterprise custom |
| **Start.gg** | Dominant in FGC/Smash | Acquired by Fandom | GraphQL API (free, rate-limited) | PayPal/Stripe integration | Manual bracket reporting | Free; premium features for organizers |
| **ESL Play** | Part of ESL FACEIT Group | $1.05B group acquisition | Internal only | Prize pools via sponsors | Anti-cheat (ESEA/FACEIT client) | Free to play; sponsored events |

### 1.2 Fitness Challenge Platforms

| Platform | Users | Revenue Model | Verification | Prize/Reward | API |
|----------|-------|---------------|-------------|-------------|-----|
| **StepBet/DietBet (WayBetter)** | 1.2M+ users, $100M+ won | 15% pot rake | Fitness tracker sync (Fitbit, Apple Health, Garmin) | Cash from pool (minus 15%) | None public |
| **Strava Challenges** | 120M+ users (Strava total) | Brand sponsorships ($30K-50K per challenge) | GPS + activity tracking | Digital badges; brand rewards | Public API (activities, segments) |
| **Zwift Racing** | 4M+ users | Subscription ($15/mo) | Power meter + controlled environment | Prize pools via sponsors | Limited API |
| **Corporate Wellness** (Virgin Pulse, Wellable) | 14M+ (VP alone) | $3-10/employee/month SaaS | Wearable sync + self-report | Points, gift cards, insurance discounts | Enterprise APIs |

### 1.3 Web3 Competition Platforms (Emerging)

| Platform | Focus | Prize Model | Status |
|----------|-------|-------------|--------|
| **Elympics** | Web3 competitive gaming infrastructure | On-chain prizes | Early stage |
| **Funtico** | Web3 gaming tournaments | USDT + token prizes | Launching |
| **Call of Myth** | NFT-gated tournaments | $1M pool (Oct 2025) | Event-based |

### 1.4 Key Takeaways

**What incumbents do well:**
- Bracket management (Toornament, Battlefy, Start.gg)
- Anti-cheat integration (FACEIT)
- Publisher relationships (Challengermode, Battlefy)
- Scale and network effects (FACEIT: 18M users)

**What NO incumbent does:**
1. **Trustless prize escrow** -- All platforms either hold funds themselves or rely on organizer honesty
2. **AI-verified evidence** -- Match results are manual or API-polled; no independent AI verification
3. **Cross-category competitions** -- No platform spans esports + fitness + custom challenges
4. **On-chain settlement** -- Prize distribution is opaque; no audit trail
5. **Verifiable achievements** -- No soulbound NFT proof of competition results

**This is LightChallenge's strategic opening.**

---

## Part 2: LightChallenge Current Technical Inventory

### 2.1 What's Already Built (Production-Ready)

| Capability | Implementation | Status |
|-----------|---------------|--------|
| On-chain challenge lifecycle | ChallengePay.sol: create -> join -> proof -> finalize -> claim | Live (testnet) |
| Treasury escrow | Bucketed custody, pull-based claims, operator gating | Live |
| Multi-outcome events | EventChallengeRouter: N outcomes per event, admin finalization | Live |
| AIVM verification | Evidence -> evaluator -> PoI consensus -> on-chain proof | Live (E2E proven) |
| Fitness evidence | Apple Health, Strava, Garmin, Fitbit, Google Fit adapters | Live |
| Gaming evidence | Dota 2 (OpenDota), LoL (Riot), CS2 (FACEIT/Steam) adapters | Live |
| Competitive ranking | Score-based ranking, top-N winners, tie-breaking | Live |
| Soulbound achievements | ERC-5192 completion/victory tokens | Live |
| Fee system | Protocol + creator fees, cashback, forfeit splits, caps | Live |
| ERC20 support | Native + any ERC20 token for stakes | Live |
| Meta-transactions | EIP-2771 trusted forwarder for gasless UX | Live |
| Creator allowlist | Gated challenge creation | Live |
| External ID binding | Cross-system challenge tracking | Live |
| OAuth identity | Steam, Strava, Fitbit account linking | Live |
| Evidence evaluation | Threshold mode (pass/fail) + competitive mode (scoring) | Live |

### 2.2 Architectural Gaps for Tournament Platform

| Gap | Impact | Complexity |
|-----|--------|-----------|
| Bracket/elimination system | Required for tournament formats | Medium (DB + API; no contract changes) |
| Team entities | Required for team-vs-team | Medium (new contract or off-chain) |
| Persistent leaderboards | Required for seasons/circuits | Low (DB + API only) |
| Recurring challenges | Required for leagues/seasons | Low (template cloning) |
| API key management | Required for partner API access | Medium (auth layer) |
| Webhook notifications | Required for real-time integration | Low (event emitter) |
| White-label theming | Required for brand partners | Low (CSS/config) |
| Dispute resolution | Important for competitive integrity | Medium (contract + workflow) |
| Pagination/rate limiting | Required for API scale | Low |
| Multi-chain deployment | Growth opportunity | High |

---

## Part 3: Private Tournament API Design

### 3.1 Product Concept

**LightChallenge Tournament API** -- a REST API that allows any organization to create, manage, and settle competitions with:
- Trustless prize escrow (on-chain Treasury)
- AI-verified results (AIVM pipeline)
- Flexible formats (1v1, free-for-all, bracket, league, team)
- Multi-category support (esports, fitness, custom)
- Soulbound achievement tokens for participants

### 3.2 API Architecture

#### Authentication & Access

```
POST   /v1/auth/api-keys           # Create API key (partner dashboard)
DELETE /v1/auth/api-keys/:id        # Revoke key
GET    /v1/auth/api-keys            # List keys

# All API calls require: Authorization: Bearer <api_key>
# Webhook callbacks signed with HMAC-SHA256
```

#### Organizations & Teams

```
POST   /v1/organizations                    # Create org (esports team, brand, creator)
GET    /v1/organizations/:id                # Org profile
PATCH  /v1/organizations/:id                # Update org

POST   /v1/organizations/:id/members        # Add member (wallet or email)
DELETE /v1/organizations/:id/members/:uid   # Remove member
GET    /v1/organizations/:id/members        # List members

POST   /v1/teams                            # Create team within org
GET    /v1/teams/:id                        # Team profile
POST   /v1/teams/:id/roster                 # Add player to roster
DELETE /v1/teams/:id/roster/:uid            # Remove from roster
```

#### Competitions (Core)

```
# Competition = a container for one or more challenges
POST   /v1/competitions                     # Create competition
GET    /v1/competitions/:id                 # Get competition details
PATCH  /v1/competitions/:id                 # Update metadata
DELETE /v1/competitions/:id                 # Cancel (if no participants)

# Competition types:
#   CHALLENGE  -- single challenge (existing LightChallenge flow)
#   BRACKET    -- single/double elimination tournament
#   LEAGUE     -- round-robin with standings
#   CIRCUIT    -- series of events with cumulative points
#   LADDER     -- persistent ELO-based ranking
```

#### Tournament Lifecycle

```
# Registration
POST   /v1/competitions/:id/register        # Register participant/team
GET    /v1/competitions/:id/participants     # List participants
POST   /v1/competitions/:id/check-in        # Confirm attendance

# Bracket Management
GET    /v1/competitions/:id/bracket         # Get bracket state
POST   /v1/competitions/:id/bracket/seed    # Seed bracket (manual or auto)
POST   /v1/competitions/:id/matches/:mid/result  # Report match result
GET    /v1/competitions/:id/matches         # List all matches

# Evidence & Verification
POST   /v1/competitions/:id/evidence        # Submit evidence (file or API data)
GET    /v1/competitions/:id/evidence/:eid   # Get evidence status
GET    /v1/competitions/:id/verdicts        # Get all verdicts

# Standings & Results
GET    /v1/competitions/:id/standings       # Current standings/leaderboard
GET    /v1/competitions/:id/results         # Final results after completion

# Lifecycle
POST   /v1/competitions/:id/start           # Start competition
POST   /v1/competitions/:id/finalize        # Trigger finalization
POST   /v1/competitions/:id/cancel          # Cancel with refunds
```

#### Prize Escrow

```
# Prize pool management
POST   /v1/competitions/:id/prize-pool      # Configure prize distribution
GET    /v1/competitions/:id/prize-pool      # Get prize pool state
POST   /v1/competitions/:id/prize-pool/deposit  # Sponsor deposits funds

# Distribution templates:
#   WINNER_TAKE_ALL    -- 100% to 1st place
#   TOP_N              -- Split among top N (configurable ratios)
#   PROPORTIONAL       -- Pro-rata by score
#   CUSTOM             -- Arbitrary distribution array

# Claims
GET    /v1/competitions/:id/claims          # List claim status per participant
POST   /v1/competitions/:id/claims/:uid     # Trigger claim for participant
```

#### Webhooks

```
POST   /v1/webhooks                         # Register webhook URL
GET    /v1/webhooks                         # List webhooks
DELETE /v1/webhooks/:id                     # Remove webhook

# Events emitted:
#   competition.created
#   competition.started
#   participant.registered
#   participant.checked_in
#   match.started
#   match.result_submitted
#   evidence.submitted
#   verdict.issued
#   competition.finalized
#   claim.available
#   claim.completed
```

#### Leaderboards & Seasons

```
POST   /v1/leaderboards                     # Create persistent leaderboard
GET    /v1/leaderboards/:id                 # Get leaderboard state
GET    /v1/leaderboards/:id/entries         # Paginated entries

POST   /v1/seasons                          # Create season (groups competitions)
GET    /v1/seasons/:id                      # Season details + standings
POST   /v1/seasons/:id/competitions         # Add competition to season
```

### 3.3 Tournament Lifecycle Flow

```
Partner creates competition via API
         |
         v
+---------------------+
|  DRAFT              | <- Configure: format, rules, prize pool, timeline
|  (off-chain only)   |
+--------+------------+
         | POST /competitions/:id/prize-pool/deposit
         v
+---------------------+
|  REGISTRATION OPEN  | <- On-chain: challenge created, Treasury bucket funded
|  (on-chain escrow)  |   Players register + deposit stake
+--------+------------+
         | POST /competitions/:id/start
         v
+---------------------+
|  IN PROGRESS        | <- Matches played, evidence submitted
|  (evidence flowing) |   AIVM evaluators process evidence
|                     |   Verdicts issued (pass/fail + score)
+--------+------------+
         | All matches complete OR deadline reached
         v
+---------------------+
|  FINALIZING         | <- Rankings computed, proofs submitted to chain
|  (AIVM + on-chain)  |   ChallengePay.finalize() called
+--------+------------+
         | On-chain finalization confirmed
         v
+---------------------+
|  COMPLETED          | <- Claims available via Treasury
|  (claims open)      |   Achievement NFTs mintable
|                     |   Webhook: competition.finalized
+---------------------+
```

### 3.4 Verification Flows by Category

#### Esports (Gaming)

```
1. Player links gaming account (Steam/Riot/FACEIT) via OAuth
2. Competition starts -> match window opens
3. Players play matches on the native platform
4. Evidence auto-collected:
   - OpenDota API: match history with IDs, heroes, outcome
   - Riot API: match history with champions, outcome
   - FACEIT API: match stats
5. Gaming evaluator processes:
   - Filters matches to competition window
   - Applies rules (hero restrictions, ranked-only, etc.)
   - Computes score (wins, KDA, damage, etc.)
6. Verdict issued -> AIVM PoI attestation
7. On-chain proof submission -> finalization
```

#### Fitness

```
1. Player links fitness account (Strava/Garmin/Fitbit) or uses Apple Health
2. Competition starts -> activity window opens
3. Players perform activities
4. Evidence collected:
   - Strava API: activities with GPS, heart rate, power
   - Garmin: activity exports
   - Apple Health: HealthKit data via iOS app
   - Fitbit API: time-series data
5. Fitness evaluator processes:
   - Normalizes all sources to canonical Activity type
   - Filters to competition window
   - Applies rules (min distance, steps threshold, etc.)
   - Computes score (total steps, distance, elevation, etc.)
6. Verdict -> AIVM -> on-chain -> finalization
```

#### Custom / Brand

```
1. Partner defines custom evidence schema via API
2. Partner submits evidence on behalf of participants
3. Custom evaluator (or partner-provided webhook) processes
4. LightChallenge issues verdict based on evaluator response
5. Standard finalization flow
```

---

## Part 4: Competitive Advantage Analysis

### 4.1 AIVM Verification as Moat

| Feature | LightChallenge | FACEIT | Toornament | StepBet |
|---------|---------------|--------|-----------|---------|
| Evidence verification | AI-powered, decentralized (PoI consensus) | Anti-cheat client + API polling | Manual reporting | Fitness tracker sync only |
| Verification transparency | On-chain proof, auditable | Proprietary, opaque | None | None |
| Multi-source evidence | 9+ adapters (gaming + fitness) | Gaming only | None | Fitness only |
| Dispute resistance | Cryptographic proof chain | Admin-adjudicated | Admin-adjudicated | Algorithm + support |
| Verification cost | Gas + AIVM network fee | Free (included) | Free (manual) | Included in 15% rake |

**Verdict:** AIVM verification is a genuine differentiator for high-stakes competitions where trust matters. For casual tournaments, it's overkill. The sweet spot is **$100+ prize pools** where participants want proof the results are legitimate.

### 4.2 On-Chain Escrow as Moat

| Feature | LightChallenge | FACEIT | Toornament | StepBet |
|---------|---------------|--------|-----------|---------|
| Fund custody | On-chain Treasury (bucketed, auditable) | Platform wallet (custodial) | Organizer-managed | Platform wallet (custodial) |
| Prize distribution | Smart contract (pull-based, trustless) | Manual payout | Manual payout | Algorithm + PayPal |
| Refund guarantee | Contract-enforced (cancel -> full refund) | Platform policy | Organizer policy | "No Lose" guarantee (company-backed) |
| Audit trail | Full blockchain history | None public | None | None |
| Currency flexibility | Any ERC20 + native token | USD only | Varies | USD only |

**Verdict:** On-chain escrow solves the #1 trust problem in online competitions -- "will I actually get paid?" This is a strong differentiator for:
- International competitions (no payment rail issues)
- Creator-run events (audiences trust the contract, not the creator)
- High-value tournaments (verifiable prize pool)

### 4.3 Where Incumbents Still Win

- **Anti-cheat**: FACEIT's client-side anti-cheat is essential for competitive FPS. LightChallenge can't replace this -- but can layer on top.
- **Matchmaking**: FACEIT and Challengermode have real-time ELO-based matchmaking. Building this is a separate product.
- **Network effects**: FACEIT has 18M users. LightChallenge must target niches first, not compete head-on.
- **Bracket UX**: Start.gg and Toornament have polished bracket management. This is table-stakes that must be built.

---

## Part 5: Target Customer Segments

### 5.1 Segment Priority Matrix

| Segment | Pain Point | Willingness to Pay | LightChallenge Fit | Priority |
|---------|-----------|-------------------|-------------------|----------|
| Esports tournament organizers | Manual verification, prize payout trust | Medium ($500-5K/event) | High (verification + escrow) | **P1** |
| Creator communities | Can't handle money; prize trust issues | High ($50-500/event) | Very High (turnkey escrow) | **P1** |
| Brand sponsors | ROI measurement, engagement proof | Very High ($10K-100K/campaign) | High (verified participation) | **P1** |
| Corporate wellness | Low engagement, no accountability | High ($3-10/employee/mo) | Medium (fitness verification) | **P2** |
| Fitness communities | No stake enforcement, honor system | Medium ($10-40/challenge) | Very High (fitness + escrow) | **P2** |
| Game publishers | Tournament infrastructure cost | Very High ($50K-500K/yr) | Medium (need bracket + anti-cheat) | **P3** |
| Web3 gaming | Need tournament rails for crypto prizes | High ($5K-50K/event) | Very High (native crypto) | **P2** |

### 5.2 Ideal Early Customers

**Tier 1: Creator-Led Esports (Highest urgency, fastest adoption)**
- Twitch streamers running community tournaments (Dota, LoL, CS2)
- YouTube gaming creators hosting subscriber challenges
- Discord communities with competitive ladders
- Pain: They use Google Forms + honor system + PayPal. LightChallenge replaces all three.

**Tier 2: Fitness Challenge Creators**
- Strava clubs running informal competitions
- CrossFit gyms doing inter-box challenges
- Running clubs with monthly distance competitions
- Pain: No way to enforce stakes or verify fairly. LightChallenge adds accountability.

**Tier 3: Brand Activation**
- Sports brands (Nike, Adidas, Under Armour) running consumer challenges
- Gaming peripheral brands sponsoring streamer tournaments
- Crypto/Web3 projects funding community competitions
- Pain: Strava charges $30-50K per challenge with no escrow. LightChallenge offers programmable sponsorship.

---

## Part 6: Business Model

### 6.1 Revenue Streams

| Stream | Model | Target |
|--------|-------|--------|
| Protocol fee | 2-5% of prize pool (configurable per-challenge, enforced on-chain) | All competitions |
| API access | Free tier (10 competitions/mo) -> Pro ($99/mo) -> Enterprise (custom) | Partners/organizers |
| Verification fee | $0.10-0.50 per evidence evaluation (AIVM gas cost + margin) | Per participant |
| White-label | $500-2,000/mo for branded portal + custom domain | Brands, orgs |
| Achievement minting | $0.05-0.25 per soulbound token mint (gas + margin) | Per participant |
| Sponsor deposits | 0% fee on sponsor-funded prize pools (revenue from verification + API) | Brand partnerships |

### 6.2 Pricing Tiers

| Tier | Price | Competitions/mo | Participants | API Calls | Features |
|------|-------|-----------------|-------------|-----------|----------|
| **Free** | $0 | 3 | 32 each | 1K/day | Basic brackets, escrow, verification |
| **Creator** | $29/mo | 20 | 128 each | 10K/day | Webhooks, custom branding, priority support |
| **Pro** | $99/mo | Unlimited | 512 each | 50K/day | Seasons, leaderboards, analytics dashboard |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | White-label, dedicated support, SLA, custom evaluators |

### 6.3 Unit Economics

**Per-competition (100 participants, $10 stake each = $1,000 pool):**
- Protocol fee (3%): **$30**
- Verification fees (100 x $0.20): **$20**
- Achievement mints (100 x $0.10): **$10**
- Gas costs (Lightchain testnet = negligible now; mainnet TBD): **~$2**
- **Net revenue per competition: ~$58**
- **Margin: ~$56 after gas**

At 1,000 competitions/month -> **$56K MRR**
At 10,000 competitions/month -> **$560K MRR**

---

## Part 7: Go-to-Market Strategy

### Phase 1: Creator Beachhead (Months 1-3)

**Target:** 50 active creator-organizers running weekly/monthly competitions

**Actions:**
1. Launch "LightChallenge for Creators" landing page with simple value prop: "Run verified competitions with real prizes. No PayPal. No trust issues."
2. Partner with 5-10 mid-tier Twitch streamers (5K-50K followers) who run community Dota/LoL/CS2 tournaments
3. Offer free Creator tier for first 3 months + $500 co-funded prize pool for their first tournament
4. Build Discord bot that integrates with LightChallenge API (register, check results, claim prizes -- all in Discord)
5. Create "Tournament in 5 Minutes" onboarding flow -- wizard that creates competition, generates invite link, handles escrow

**Success metrics:**
- 50 competitions run
- 500+ unique participants
- <5% dispute rate
- 3+ repeat organizers

### Phase 2: Community Expansion (Months 4-6)

**Target:** 500 competitions/month across gaming + fitness

**Actions:**
1. Launch fitness challenge templates -- "30-Day Step Challenge", "Monthly Running Competition", "Cycling Distance League"
2. Partner with 3-5 Strava clubs / running communities for verified fitness competitions with real stakes
3. Launch affiliate program -- organizers earn 50% of protocol fee for competitions they create
4. Build embeddable widget -- partners can embed tournament registration + leaderboard on their own site
5. Release Tournament API v1 with full documentation, SDKs (TypeScript, Python), and example integrations
6. Launch on Product Hunt / Hacker News -- "Stripe for competitions"

**Success metrics:**
- 500 competitions/month
- 5,000+ unique participants
- $50K+ in prize pools settled
- 10+ API integrations

### Phase 3: Brand & Enterprise (Months 7-12)

**Target:** 3-5 paying enterprise customers, $20K+ MRR

**Actions:**
1. Approach gaming peripheral brands (SteelSeries, HyperX, Logitech) for sponsored streamer tournaments
2. Approach fitness brands for verified step/running challenges (alternative to $30-50K Strava sponsorships)
3. Launch white-label portal for brands to run branded competition hubs
4. Build analytics dashboard showing engagement, completion rates, audience demographics
5. Corporate wellness pilot -- partner with 1-2 companies for employee fitness challenges with crypto incentives
6. Web3 partnerships -- integrate with 2-3 Web3 games for tournament infrastructure

**Success metrics:**
- 3+ enterprise customers
- $20K+ MRR
- $500K+ in prize pools settled
- 50K+ total participants

---

## Part 8: Product Roadmap

### Quarter 1: Foundation (Weeks 1-12)

**Goal:** Ship Tournament API v1 for simple formats

| Week | Deliverable | Details |
|------|------------|---------|
| 1-2 | API key management | Partner registration, key creation, rate limiting |
| 2-3 | Competition CRUD | Create/read/update/cancel competitions via API |
| 3-4 | Registration flow | Participant registration with on-chain stake deposit |
| 4-5 | Free-for-all format | N participants, ranked by score, top-K win |
| 5-6 | Webhook system | Event notifications for all lifecycle events |
| 7-8 | Leaderboard API | Persistent leaderboards with pagination |
| 8-9 | Prize distribution templates | Winner-take-all, top-N split, proportional |
| 10-11 | SDK (TypeScript) | npm package wrapping the API |
| 11-12 | Documentation site | Interactive API docs with examples |

**Contract changes:** None required. Existing ChallengePay + EventChallengeRouter + Treasury cover all Q1 features.

### Quarter 2: Formats & Integration (Weeks 13-24)

**Goal:** Bracket tournaments + Discord/Twitch integration

| Week | Deliverable | Details |
|------|------------|---------|
| 13-14 | Single elimination brackets | Bracket generation, seeding, advancement |
| 15-16 | Double elimination brackets | Winners/losers bracket, grand finals |
| 16-17 | Round-robin leagues | All-play-all with standings computation |
| 18-19 | Discord bot | Register, check-in, results, claim -- all in Discord |
| 20-21 | Twitch extension | Overlay showing live bracket/standings during stream |
| 22-23 | Team entities | Team creation, roster management, team-vs-team challenges |
| 24 | Season/circuit system | Group competitions into seasons with cumulative standings |

**Contract changes:**
- New TeamRegistry.sol or off-chain team management (preferred for speed)
- Bracket state is entirely off-chain (matches map to individual challenges via EventChallengeRouter)

### Quarter 3: Scale & Enterprise (Weeks 25-36)

**Goal:** White-label + brand tools + multi-chain

| Week | Deliverable | Details |
|------|------------|---------|
| 25-27 | White-label portal | Custom domain, branding, CSS theming for partners |
| 28-29 | Analytics dashboard | Engagement metrics, completion rates, demographics |
| 30-31 | Sponsor deposit flow | Brands fund prize pools via API (no participant stake required) |
| 32-33 | Custom evaluator webhooks | Partners provide their own verification endpoint |
| 34-35 | Multi-chain preparation | Abstract chain interactions; target Base/Arbitrum/Polygon |
| 36 | Enterprise SLA & billing | Usage-based billing, SLA guarantees, priority support |

**Contract changes:**
- Deploy to additional chains (same contracts, new addresses)
- Possible SponsorVault.sol for brand-funded prize pools with different escrow rules

### Quarter 4: Ecosystem & Growth (Weeks 37-48)

**Goal:** Self-serve growth + marketplace

| Week | Deliverable | Details |
|------|------------|---------|
| 37-39 | Competition marketplace | Browse/discover public competitions across all partners |
| 40-41 | Reputation system | Cross-competition ELO/ranking, profile pages |
| 42-43 | Mobile SDK (iOS/Android) | Native SDKs for mobile app integration |
| 44-45 | Plugin marketplace | Third-party evaluators, custom bracket formats |
| 46-48 | Recurring competitions | Auto-create weekly/monthly competitions from templates |

---

## Part 9: Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Crypto friction (wallets, gas) | High | High | Gasless via TrustedForwarder; custodial wallet option; abstract crypto UX |
| Regulatory (gambling classification) | Medium | Very High | Skill-based competitions only; no RNG; legal opinion per jurisdiction |
| Low initial liquidity (few participants) | High | Medium | Co-fund prize pools; creator incentives; focus on existing communities |
| Verification gaming (fake evidence) | Medium | High | Multi-source cross-validation; anomaly detection; community reporting |
| Smart contract risk | Low | Very High | Audits before mainnet; bug bounty; gradual rollout with caps |
| Competitor response (FACEIT adds crypto) | Low | Medium | Speed advantage; cross-category moat; API-first approach |
| Chain downtime / gas spikes | Low | Medium | Multi-chain; batched transactions; off-chain fallback |

---

## Part 10: Decision Framework

### Should LightChallenge Expand?

**YES, with caveats.**

**Arguments FOR:**
1. Unique technical position -- no competitor has verification + escrow + multi-category
2. API-first approach is capital-efficient -- partners bring their own audiences
3. Protocol fee model scales with prize volume, not headcount
4. Web3 gaming market is actively seeking tournament infrastructure
5. Creator economy is underserved -- no turnkey competition solution exists
6. Corporate wellness is a $65B+ market with appetite for gamification

**Arguments AGAINST (must be mitigated):**
1. Crypto UX friction will limit mainstream adoption -> must abstract away
2. Regulatory uncertainty around staked competitions -> legal review essential
3. Current product is testnet-only -> mainnet deployment required for real money
4. Bracket/tournament UX is table-stakes work that doesn't differentiate -> must be built but isn't the moat

**Recommended approach:** Build the Tournament API as an **extension** of the current product, not a pivot. The API wraps existing contracts (ChallengePay, EventChallengeRouter, Treasury) with tournament-specific orchestration. This preserves the existing challenge app while opening the platform play.

### Priority: What to Build First

1. **API key management + Competition CRUD** (unlocks everything else)
2. **Free-for-all format + leaderboard** (covers 80% of creator use cases)
3. **Discord bot** (fastest path to creator adoption)
4. **Single elimination bracket** (required for esports credibility)
5. **Fitness challenge templates** (differentiated; no competitor offers verified fitness + stakes)

---

## Sources

### Esports & Tournament Platforms
- [FACEIT Developer Docs](https://docs.faceit.com/)
- [FACEIT Google Cloud Case Study](https://cloud.google.com/customers/faceit)
- [Toornament New Plans and Pricing (March 2026)](https://blog.toornament.com/2026/03/new-plans-and-pricing/)
- [Toornament Developer API](https://developer.toornament.com/v2/doc/tournament_overview)
- [Challengermode Portal](https://www.challengermode.com/portal)
- [Challengermode Investment (Oct 2024)](https://esportsinsider.com/2024/10/challengermode-investment-aaa-game-offering)
- [Battlefy Esports Management](https://battlefy.com/services)
- [Start.gg Developer Portal](https://developer.start.gg/)
- [ESL FACEIT Group CS2 Investment](https://www.eslfaceitgroup.com/press/esl-faceit-group-announces-22m-usd-financial-contribution--for-the-counter-strike-ecosystem-in-2025--2026/)
- [Leetify FACEIT API Pricing Changes](https://www.dust2.us/news/45779/update-leetify-halts-processing-faceit-demos-due-to-expensive-api-changes)

### Market Data
- [Esports Market Projections (Future Market Insights)](https://www.futuremarketinsights.com/reports/esports-market)
- [Esports Market Analysis (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/esports-market)
- [Corporate Wellness Market (Coherent Market Insights)](https://www.coherentmarketinsights.com/market-insight/corporate-wellness-market-2062)
- [Corporate Wellness Market (Grand View Research)](https://www.grandviewresearch.com/industry-analysis/corporate-wellness-market)
- [Esports Market Size $55B by 2035 (Yahoo Finance)](https://finance.yahoo.com/news/esports-market-size-worth-usd-120800611.html)

### Fitness Challenges
- [Strava Sponsored Challenges ($30-50K)](https://business.strava.com/challenges)
- [Strava Business Case Studies](https://business.strava.com/case-studies)
- [StepBet/WayBetter Research (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9982638/)
- [WayBetter Funding $14.4M (Crunchbase)](https://www.crunchbase.com/organization/way-better)
- [Strava Year in Sport 2025](https://business.strava.com/resources/year-in-sport-brands-2025)

### Web3 Gaming
- [Call of Myth $1M Tournament](https://www.cointribune.com/en/call-of-myth-revolutionizes-web3-e-sport-with-a-free-tournament-worth-1-million-dollars/)
- [Funtico Web3 Gaming Platform](https://decrypt.co/303895/funtico-unveils-full-stack-web3-gaming-platform-kicking-off-tournaments-with-100000-usdt-and-150000-tico-prize-pools)
- [Web3 Stablecoin Tournament Payouts](https://medium.com/coinmonks/web3-gamings-killer-app-stablecoin-tournament-payouts-590e89a626eb)
- [Polkadot + Heroic Web3 CS2 Tournament](https://esportsinsider.com/2025/05/polkadot-heroic-launch-web3-community-cs2-tournament)
