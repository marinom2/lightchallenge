# LightChallenge UX/UI Design Blueprint

> Design research and architecture plan for the LightChallenge redesign.
> Based on analysis of 14 leading Web3/product websites, 8 dApps, 3 competition platforms, and a full audit of the current LightChallenge webapp.

---

## 1. Research Findings: Web3 Websites

### Navigation Patterns (across Uniswap, Aave, Lido, Arbitrum, Optimism, Polygon, Chainlink, OpenSea, Worldcoin, Nouns, Magic Eden)

| Pattern | Prevalence | Detail |
|---------|-----------|--------|
| "Launch App" as primary CTA | 9/11 sites | Always far-right, filled button, brand accent color |
| 5-6 top-level nav items | 11/11 | Sweet spot. Beyond 6 = clutter. Mega-dropdowns handle depth |
| "Developers" as first-class nav item | 10/11 | Routes to separate docs subdomain |
| Community/Governance in nav | 8/11 | Unique to Web3 — reflects DAO reality |
| Wallet connect in nav | Product-as-site only | OpenSea, Magic Eden, Nouns, Lido integrate wallet directly |

### Homepage Structures (3 proven models)

**Model A — Vision Hero + Progressive Disclosure** (Vercel, Stripe, Chainlink, Worldcoin)
- Stunning minimal hero, bold headline, one premium visual
- Progressive feature revelation on scroll
- Trust signals (logos, stats) mid-page
- Best for: complex products needing multi-audience explanation

**Model B — Product-as-Homepage** (OpenSea, Magic Eden, Nouns, Lido)
- No marketing hero — the product IS the first viewport
- Immediately interactive (marketplace, staking widget, auction)
- Trust built through activity, not explanation
- Best for: simple core actions (buy, stake, bid)

**Model C — Stats-Forward** (Aave, Lido, Polygon, Uniswap)
- Hero establishes narrative, then pivots to hard numbers
- TVL, volume, user count displayed prominently
- Feature explanation follows stats
- Best for: protocols where metrics ARE the value proposition

### Trust Signals (ranked by frequency)

1. **Real-time protocol stats** (9/11) — TVL, volume, users. Billions carry authority.
2. **Partner/customer logos** (8/11) — Ecosystem dApps or enterprise partners.
3. **Audit/security sections** (DeFi-specific) — Aave's dedicated Security page is gold standard.
4. **Developer ecosystem signals** — GitHub stars, SDK downloads, developer count.
5. **Design quality as implicit trust** — Worldcoin, Vercel: "If they care this much about the site..."

### Visual Consensus

- **Dark mode dominates**: 8/14 default dark. It conveys technical sophistication.
- **One accent color per brand**: Uniswap=pink, Aave=teal, Stripe=purple, Vercel=blue.
- **Geometric sans-serif universal**: Inter or Inter-like. No serifs anywhere.
- **Generous whitespace**: Even information-dense sites breathe between sections.
- **Gradients are near-universal** but subtle: ambient mesh (Stripe), radial glow (Aave), or accent gradients.

### Marketing vs. Product Split

| Pattern | Sites | Verdict |
|---------|-------|---------|
| Separate subdomain (`app.x.io`) | Uniswap, Aave, Stripe | Most common for protocols |
| Same domain, different routes | Vercel, Linear | Ideal for SaaS, harder to execute |
| Product-as-homepage | OpenSea, Nouns, Lido | Lowest friction, hardest to tell story |

---

## 2. Research Findings: Web3 dApps

### Universal dApp UX Principles (from Uniswap, Aave, OpenSea, Jupiter, Magic Eden)

1. **Pre-connect exploration** — NEVER gate browsing behind wallet connection. Show everything. Gate only at execution (join, swap, bid).
2. **3-click primary actions** — Core value proposition reachable in ≤3 clicks.
3. **Top bar navigation only** — No sidebars for primary nav. Sidebars only for browse/filter.
4. **In-place validation** — Button text changes for errors ("Insufficient Balance"), no modal dialogs.
5. **Skeleton loading** — Shimmer placeholders matching final layout. Never full-page spinners.
6. **Progressive complexity** — Defaults work for 80%. Settings/advanced behind gear icon or accordion.
7. **Single-focus landing** — The landing page IS the primary action, not a dashboard with 10 options.

### Key dApp Interaction Patterns

| dApp | Primary Pattern | Key Innovation |
|------|----------------|----------------|
| Uniswap | Centered action card | Swap interface visible pre-connect; validation in button text |
| Aave | Dashboard + modal actions | Summary stat cards (Net Worth, APY, Health Factor) at top |
| OpenSea | Magazine-style discovery | Search bar dominates nav; sidebar filters on browse pages |
| Jupiter | Tabbed modes on same card | "You're selling" / "You're buying" (human-readable labels) |
| Magic Eden | Multi-chain marketplace | Chain selector as prominent horizontal pills |

### Competition/Challenge Platform Patterns (Kaggle, Devpost, STEPN)

| Pattern | Detail |
|---------|--------|
| **Deadline urgency** | Countdown timers / "days remaining" is #1 scanning element on cards |
| **Prize/reward prominence** | Always visible on cards and detail pages |
| **Transforming CTAs** | "Join" → "Submit" → "View Results" (single button changes by state) |
| **Tabbed detail pages** | Overview / Participants / Leaderboard / Rules as tabs |
| **Achievement tiers** | Visual progression drives engagement (Kaggle: Novice→Expert→Grandmaster) |
| **Social proof numbers** | Participant count, submission count validate the challenge |
| **Progress visualization** | Bars, rings, percentages showing completion status |

---

## 3. Research Findings: Apple/Stripe-Grade UX

### Core Design Principles (from Stripe, Linear, Vercel)

| Principle | Stripe | Linear | Vercel |
|-----------|--------|--------|--------|
| Typography levels | 4 clear levels | 3-4, density-optimized | 4, with generous sizing |
| Spacing | Airy (48-64px sections) | Dense but structured | Very airy (48-80px) |
| Accent usage | Indigo #635BFF, only interactive | Blue-purple, only status | Blue #0070F3, minimal |
| Content width | ~720px | Full width (3-pane) | ~760px |
| Dark/Light | Light (docs) | Dark default | Dark default |
| Trust signal | Polish + consistency | Speed + density | Minimalism + confidence |

### Extracted Principles

1. **Single accent color** — One brand color, used ONLY for interactive elements and CTAs. Never decorative.
2. **Typography as structure** — Heading sizes create scannable rhythm. 4 levels is sufficient.
3. **Whitespace is a feature** — Even Linear (highest density) uses whitespace structurally.
4. **Color = semantics only** — Color always carries meaning (status, alert, action). Never decorative.
5. **No visual noise** — Borders are subtle or absent. Shadows are rare. Gradients are non-existent in UI chrome.
6. **Copy/share affordances** — One-click copy for addresses, code, links.
7. **Guided journeys** — First-time users get a clear path (quickstart, wizard, templates).
8. **Command palette** — Cmd+K for navigation (Linear, Vercel). Power users expect this.

---

## 4. Synthesized Design Principles for LightChallenge

### The LightChallenge Design Philosophy

> **Apple-level cleanliness. Web3-native credibility. Developer-friendly transparency.**

The design must communicate: "This protocol is serious, trustworthy, and simple to use."

### 7 Core Principles

#### 1. Navigation Philosophy
- **Grouped top bar**: 5 items — 2 simple links + 2 mega-dropdowns + 1 external link
- Primary nav: **Explore** (link) | **Challenges** (dropdown: Create Challenge, My Challenges, Submit Proof, Claims) | **Tournaments** (dropdown: Browse Tournaments, Create Tournament) | **Achievements** (link) | **Docs** (external link)
- Primary CTA: **Connect Wallet** (if disconnected) or **wallet pill** (if connected) — far right with theme toggle and network status
- Wallet pill dropdown: My Challenges, Achievements, Claims, Linked Accounts, Admin (if admin), Disconnect
- No sidebar for primary navigation — only for browse filters on Explore
- Mobile: hamburger menu opens full-screen drawer with all nav items grouped by category

#### 2. Homepage Structure Philosophy
- **Hybrid Model A+C**: Vision hero with stats, then product showcase
- Hero: Bold headline + subline + two CTAs ("Explore Challenges" primary, "Create Challenge" secondary)
- Live stats row immediately after hero (challenges created, pool total, verified challenges, network status)
- "How it works" 3-step section
- Featured/trending challenges (live from API, not static)
- Footer with docs link, GitHub, community

#### 3. dApp Interface Philosophy
- **Single-focus pages**: Each page has ONE primary action
- **Pre-connect browsing**: Full explore, detail views, stats accessible without wallet
- **Gate at action**: Wallet prompt only on join/submit/claim
- **3-click maximum** for any primary flow
- **Modal-based actions**: Join, submit evidence, claim — all in modals, no page nav required

#### 4. Onboarding Philosophy
- **No mandatory onboarding**: Let users explore freely
- **Progressive disclosure**: Simple first, details on demand
- **Contextual hints**: Show "what to do next" based on user state
- **Transforming CTAs**: Button changes from "Join" → "Submit Proof" → "Claim Reward"
- **Empty states with guidance**: "No challenges yet? Explore or create one."

#### 5. Documentation Visibility Philosophy
- **Docs in secondary nav** or footer (not primary nav for consumer users)
- **Docs subdomain**: `uat.docs.lightchallenge.app` (already deployed)
- **Developer section** on homepage (or protocol page) with links to API, docs, GitHub
- **Inline help**: Tooltips and "learn more" links on complex UI elements

#### 6. Trust-Building Visual Elements
- **Live protocol stats** prominently displayed (challenges, participants, pool total)
- **AIVM verification badge** — "Verified by AIVM Proof of Intelligence" on challenge results
- **Network status indicator** in navbar (already built)
- **On-chain references**: tx hash links, block numbers, contract addresses — always accessible
- **Achievement/reputation display** as social proof
- **Audit/security page** linked from footer (future)

#### 7. Action-Oriented UX
- Every page resolves to ONE clear next action
- Buttons use active verbs: "Join Challenge", "Submit Evidence", "Claim Reward"
- Status communication is immediate: colored badges, inline progress, toast notifications
- Deadline urgency: countdown pills on challenge cards (green/yellow/red)
- Celebration on completion: success states with confetti/emphasis for wins and claims

---

## 5. LightChallenge UX Weaknesses — Status Tracker

> Most original weaknesses have been addressed. Status: DONE = implemented, OPEN = still pending.

### Critical Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 1 | Homepage is a marketing page, not a product | **DONE** | Homepage now shows hero + live stats + "How It Works" + featured challenges + categories |
| 2 | "More" dropdown hides key pages | **DONE** | Nav restructured: Explore, Challenges (dropdown), Tournaments (dropdown), Achievements (top-level), Docs |
| 3 | No deadline urgency on challenge cards | **DONE** | Countdown component with green/yellow/red urgency coloring on all cards |
| 4 | No transforming CTA on challenge detail | **DONE** | TransformingCTA component: connect → join → submit → verifying → awaiting → claim → claimed |
| 5 | Dual data loading (meta + chain) causes 5-15s wait | **DONE** | Fast-meta-first pattern: DB meta loads ~100-300ms, chain data enriches in background |

### Navigation Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 6 | Buried secondary pages | **DONE** | 5 visible nav groups with mega-dropdowns; admin in wallet pill dropdown |
| 7 | No breadcrumbs on deep pages | **DONE** | Breadcrumb component added to challenge detail + proofs |
| 8 | No "back" affordance | **DONE** | Breadcrumbs on detail pages |
| 9 | Footer duplicates nav | **DONE** | Footer removed; docs link in nav |

### Explore / Card Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 10-14 | Filter/sort/card issues | **DONE** | Horizontal filter pills, sort dropdown, unified card grid with pool + participants + deadline countdown |

### Challenge Detail Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 15-18 | Tabs, hero metrics, participants, achievements | **DONE** | Tabbed detail (Overview/Participants/Evidence/Activity), 3-metric hero, ranked participant list, AchievementClaim integrated |

### Create Challenge Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 19-20 | Step naming, templates | **DONE** | Wizard with template picker, category cards, schedule presets, auto-advance on type selection |

### Visual/Polish Issues

| # | Weakness | Status | Resolution |
|---|----------|--------|------------|
| 21-25 | Visual excess | **DONE** | Design token system (v4): 3-level shadow hierarchy, restrained borders, single accent color, Lucide icons throughout, light/dark theme with consistent token usage |

### Remaining Gaps

| # | Gap | Priority |
|---|-----|----------|
| R1 | Command palette (Cmd+K) | Low |
| R2 | Confetti/celebration on claim success | Low |
| R3 | Inline tooltips on complex concepts | Medium |

---

## 6. Full UX/UI Design Blueprint

### 6.1 Page Hierarchy (Current)

```
lightchallenge.app/
├── /                          → Homepage (hero + stats + "How It Works" + featured challenges)
├── /explore                   → Challenge browser (grid + filters + on-chain table)
├── /challenge/[id]            → Challenge detail (tabbed: Overview/Participants/Evidence/Activity)
├── /challenges/create         → Create challenge wizard (template + type + config + review)
├── /competitions/             → Tournament browser (grid + filters)
├── /competitions/create       → Create tournament wizard (type + config + schedule + review)
├── /competitions/[id]         → Tournament detail page
├── /me/
│   ├── /challenges            → My participated challenges (grouped: Needs Action / In Progress / Completed)
│   ├── /achievements          → Achievements + reputation profile (14 types, milestones, breakdown)
│   └── /claims                → Reward claims dashboard
├── /claims                    → Claims page (alternate route)
├── /proofs                    → Evidence submission page
├── /player/[wallet]           → Player profile page
├── /org/[slug]                → Organization page
├── /org/new                   → Create organization
├── /organizations             → Organizations directory
├── /settings/
│   ├── /linked-accounts       → Platform connections (Strava, Fitbit, Steam, Riot)
│   └── /admin                 → Admin panel (admin-only)
├── /admin/                    → Admin console (panels: Governance, Fees, Proofs, etc.)
└── /docs → redirect to uat.docs.lightchallenge.app
```

### 6.2 Navigation Architecture (Implemented)

#### Desktop Top Bar (left to right)
```
[Logo: LightChallenge]  [Explore] [Challenges v] [Tournaments v] [Achievements] [Docs]    [NetworkStatus] [ThemeToggle] [ConnectWallet]
```

- **5 nav groups**: 2 simple links + 2 mega-dropdowns + 1 external link
- **Explore**: direct link to `/explore`
- **Challenges** (dropdown): Create Challenge, My Challenges, Submit Proof, Claims
- **Tournaments** (dropdown): Browse Tournaments, Create Tournament
- **Achievements**: direct link to `/me/achievements`
- **Docs**: external link to `uat.docs.lightchallenge.app`
- **Logo** links to homepage
- **Active route** indicated by cool-blue underline (`var(--lc-select-text)`)
- **ConnectWallet** button: primary CTA when disconnected (accent-filled). When connected: wallet pill showing truncated address + balance + chain
- **Admin** access: in wallet pill dropdown (visible only for admin wallets)
- Mega-dropdowns: each item has label + description + icon, with smooth animation

#### Mobile Top Bar
```
[Logo]                                    [ConnectWallet] [☰ Hamburger]
```

Hamburger opens full-screen drawer with grouped sections: Discover (Explore, Achievements), Challenges (Create, My Challenges, Submit Proof, Claims), Tournaments (Browse, Create), + wallet/theme controls in footer.

#### Wallet Pill Dropdown (when connected)
```
┌─────────────────────────┐
│ 0x1234...5678           │
│ Lightchain Testnet      │
│ Balance: 12.5 LCAI      │
├─────────────────────────┤
│ My Challenges           │
│ Achievements            │
│ Claims                  │
│ Linked Accounts         │
│ Settings                │
│ Admin (if admin)        │
├─────────────────────────┤
│ Disconnect              │
└─────────────────────────┘
```

### 6.3 Homepage Blueprint

```
┌──────────────────────────────────────────────────────────────────┐
│ [Navbar]                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│          Stake your reputation. Prove it on-chain.                │
│                                                                    │
│   Create challenges with real stakes. Submit evidence from        │
│   fitness trackers or gaming platforms. AI verifies. Winners      │
│   get paid.                                                       │
│                                                                    │
│   [Explore Challenges]  [Create Challenge]                        │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 47       │ │ 2,450    │ │ 31       │ │ Testnet  │            │
│  │Challenges│ │ LCAI Pool│ │ Verified │ │ ● Live   │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  How It Works                                                     │
│                                                                    │
│  ┌─ 01 ──────┐  ┌─ 02 ──────┐  ┌─ 03 ──────┐                   │
│  │ Pick your │  │ Do the    │  │ Prove it,  │                   │
│  │ challenge │  │ work      │  │ get paid   │                   │
│  └───────────┘  └───────────┘  └───────────┘                    │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Trending Challenges                          [View all →]        │
│                                                                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                    │
│  │ 10K Steps │  │ Dota 2    │  │ Marathon  │                    │
│  │ 2.5 LCAI  │  │ 5 LCAI   │  │ 10 LCAI  │                    │
│  │ 12 joined │  │ 8 joined  │  │ 3 joined │                    │
│  │ 3d left   │  │ 1d left   │  │ 7d left  │                    │
│  │ [Active]  │  │ [Ending!] │  │ [Active] │                    │
│  └───────────┘  └───────────┘  └───────────┘                    │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Categories                                                       │
│                                                                    │
│  [Fitness]  [Gaming]  [Esports]  [Custom]                        │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│ Footer: Docs | GitHub | API | Status | Discord                   │
│ © 2026 LightChallenge — Powered by Lightchain AI                 │
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 Challenge Card Design

Every challenge card in explore/homepage/my-challenges should show:

```
┌─────────────────────────────────┐
│ [Gaming]              [Active ●]│  ← category pill + status badge
│                                 │
│ 10 Kills in Dota 2              │  ← title (1-2 lines, truncated)
│                                 │
│ 5.0 LCAI pool  ·  12 joined    │  ← key metrics
│                                 │
│ ⏱ 3 days left                   │  ← deadline countdown (colored)
│                                 │
│ [Join Challenge →]              │  ← contextual CTA (or "View")
└─────────────────────────────────┘
```

**Deadline colors**: green (>3 days), yellow (1-3 days), red (<24 hours), gray (ended).

### 6.5 Challenge Detail Page Blueprint

```
┌──────────────────────────────────────────────────────────────────┐
│ Explore > Challenge #42                                           │  ← breadcrumb
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│ [Active ●]  [Gaming]  [Dota 2]                                   │  ← status + category pills
│                                                                    │
│ Get 10 Kills in a Dota 2 Match                                   │  ← title
│                                                                    │
│ Prove your Dota 2 skills by getting 10+ kills in a single match. │  ← description
│                                                                    │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐                  │
│ │ 5.0 LCAI   │  │ 12         │  │ 3 days     │                  │
│ │ Total Pool │  │ Participants│  │ Remaining  │                  │
│ └────────────┘  └────────────┘  └────────────┘                  │
│                                                                    │
│ ┌─────────────────────────────────────────────────────┐          │
│ │ [████████ Join Challenge ████████]                    │          │  ← primary CTA
│ │          Stake: 0.5 LCAI                             │          │
│ └─────────────────────────────────────────────────────┘          │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│ [Overview]  [Participants]  [Evidence]  [Activity]                │  ← tabs
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│ (Tab content area)                                                │
│                                                                    │
│ Overview: rules, timeline, verification model, creator info       │
│ Participants: ranked list with scores, status, evidence provider  │
│ Evidence: per-participant evidence summary, fitness/gaming stats   │
│ Activity: on-chain event timeline (created, joined, proof, etc.)  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Transforming CTA States:**
1. Not connected: "Connect Wallet to Join"
2. Connected, not joined: "Join Challenge" (with stake amount)
3. Joined, needs evidence: "Submit Evidence →"
4. Evidence submitted, verifying: "Verifying..." (disabled, with spinner)
5. Verified, awaiting finalization: "Awaiting Finalization"
6. Finalized, can claim: "Claim Reward 🎉" (celebration state)
7. Claimed: "Reward Claimed ✓" (completed state)

### 6.6 Explore Page Blueprint

```
┌──────────────────────────────────────────────────────────────────┐
│ Explore Challenges                                                │
│                                                                    │
│ [🔍 Search challenges...          ]  Sort: [Ending Soon ▾]       │
│                                                                    │
│ [All] [Gaming] [Fitness] [Custom]  [Active] [Ended]              │  ← category + status filters
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ Card 1   │ │ Card 2   │ │ Card 3   │ │ Card 4   │            │
│ │          │ │          │ │          │ │          │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ Card 5   │ │ Card 6   │ │ Card 7   │ │ Card 8   │            │
│ │          │ │          │ │          │ │          │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                    │
│                      [Load more...]                               │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Key changes from current:**
- Category filters as horizontal pills (not sidebar)
- Sort dropdown replaces tab bar (Ending Soon, Newest, Highest Pool, Most Participants)
- Unified card grid (no section grouping by game)
- Mobile: filters as horizontal scroll pills, no hidden sidebar
- Each card shows: title, category pill, pool amount, participants, deadline countdown, status

### 6.7 Create Challenge Blueprint (Implemented)

Multi-step wizard with template-first approach:

```
Step 1: Template Selection
  → Category cards (Gaming/Fitness/Custom) with emoji icons
  → Template grid filtered by category
  → Auto-advance to Step 2 on template click (350ms delay)

Step 2: Challenge Configuration
  → Title, description, stake amount, participant limits
  → Schedule presets (Quick 24h / Weekend / Week / Month)
  → Date/time pickers for custom schedule
  → Visibility and verification options

Step 3: Review & Create
  → Full summary with timeline preview visualization
  → On-chain transaction confirmation
  → Success animation → SuccessSheet with tx details + invite option
```

**Stepper** hidden on Step 1 (clean entry), appears from Step 2 onward.

### 6.7b Create Tournament Blueprint (Implemented)

Separate wizard at `/competitions/create`:

```
Step 1: Tournament Type
  → Type cards (Single Elimination / Round Robin / League / Circuit)
  → Glass background, shadow-lift hover, select-ring on click
  → Auto-advance on selection

Step 2: Configuration
  → Title, description, category (Gaming/Fitness/Custom)
  → Schedule with date pickers
  → Max participants, prize distribution
  → Public/private toggle, check-in requirement

Step 3: Optional Rules
  → Expandable details section

Step 4: Review & Create
  → Summary → API call → success redirect
```

### 6.8 Achievements Page Blueprint (Implemented)

Full achievements + reputation system with 14 achievement types, 5 levels, milestones, and analytics.

**Achievement types (14):** completion, victory, streak, first_win, participation, top_scorer, undefeated, comeback, speedrun, social, early_adopter, veteran, perfectionist, explorer — each with unique icon, color, and point value.

**Level system (5 tiers):**
- Newcomer (0 pts) → Challenger (100) → Competitor (300) → Champion (800) → Legend (2000)
- Color-coded gradient level badges

**Page sections:**
1. **Reputation hero card** — Level badge, XP progress bar, total points, unique types count
2. **Stat cards** — Total Points, Unique Types, Win Rate, Latest achievement
3. **Type breakdown** — Horizontal bar chart showing achievement distribution
4. **Milestone tracker** — 9 milestone goals with progress bars (e.g. "First Blood", "Hat Trick", "Centurion")
5. **Points guide** — Expandable reference table with all types and level thresholds
6. **Filter tabs** (pills variant) — only show types the user has earned
7. **Achievement card grid** — shadow-sm base, shadow-md + lift on hover

### 6.9 Wallet Connection Blueprint

**Before connect:**
- All pages fully browsable
- Challenge details, stats, explore — everything visible
- Wallet button says "Connect Wallet" in accent color
- Clicking opens RainbowKit modal (MetaMask, WalletConnect, Coinbase)

**After connect:**
- Button transforms to wallet pill: `0x1234...5678 · Lightchain`
- Balance shown in pill or dropdown
- All action CTAs activate (Join, Submit, Claim)
- Clicking pill opens dropdown with My Challenges, Achievements, Claims, Settings, Disconnect

**Key principle:** The app should feel useful BEFORE wallet connection. Connection is a power-up, not a gate.

### 6.10 Documentation & Developer Access

**Consumer-facing (webapp):**
- "Docs" link in footer (not primary nav)
- Inline tooltips on complex concepts (AIVM, verification, staking)
- Help icon (?) on create challenge form steps

**Developer-facing:**
- `/docs` redirects to `uat.docs.lightchallenge.app` (Nextra portal, already deployed)
- API reference at `uat.docs.lightchallenge.app/api`
- GitHub link in footer and docs portal

**API endpoints documented:**
- `/api/achievements` — Protocol-wide achievement listing
- `/api/challenges/{id}/results` — Challenge results + rankings
- `/api/challenges/{id}/rankings` — Competitive leaderboard
- `/api/challenges/{id}/evidence-summary` — Evidence aggregates
- `/api/protocol/metrics` — Protocol-wide stats
- `/api/ai/context/achievements` — AI-ready context
- `/api/me/achievements`, `/api/me/reputation`, `/api/me/challenges`

---

## 7. Visual Philosophy (Implemented — Design Token System v4)

All visual values are centralized in `webapp/app/components/ui/tokens.css`. Both light and dark themes share the same token names with different values.

### Color System

**Dark theme (default):**
```
Background:       #030509  (--lc-bg)
Surface raised:   #0b0e17  (--lc-bg-raised)
Surface inset:    #07091a  (--lc-bg-inset)
Border:           rgba(150,165,195, 0.10)  (--lc-border)
Text primary:     rgba(255,255,255, 0.93)  (--lc-text)
Text secondary:   rgba(255,255,255, 0.60)  (--lc-text-secondary)
Text muted:       rgba(140,150,180, 0.55)  (--lc-text-muted)
Accent (CTAs):    #f6f7ff  (--lc-accent — ice-white, used for primary buttons)
Accent text:      #03040c  (--lc-accent-text — dark text on accent buttons)
Selection:        rgba(80,140,255, 0.07) bg / rgba(80,140,255, 0.22) border / #7eb4ff text
Success:          #22c55e
Warning:          #eab308
Danger:           #ef4444
Info:             #3b82f6
```

**Light theme:**
```
Background:       #f5f7fb  (icy blue-white)
Surface raised:   #eef1f8
Surface inset:    #eaeff7
Border:           rgba(80,100,140, 0.10)
Text primary:     #0c1020  (deep navy)
Accent (CTAs):    #111d3a  (deep navy — white text on accent buttons)
Selection:        rgba(50,120,255, 0.06) bg / rgba(50,120,255, 0.20) border / #2563eb text
Glass:            rgba(255,255,255, 0.65)  (clean translucent white for cards)
```

**Key design rule:** `--lc-accent` is for CTA buttons only (primary action). Selection states (tabs, filters, cards, checkboxes, nav indicators, focus outlines) use `--lc-select-*` tokens. This prevents dark navy borders in light theme.

### Typography (tokens)

```
Font sans:     Inter var, Inter, system stack
Font mono:     JetBrains Mono, Fira Code, SF Mono
Title:         clamp(1.75rem, 3vw, 2rem) / 700 weight
Heading:       clamp(1.25rem, 2vw, 1.5rem) / 600 weight
Subhead:       1.125rem / 500 weight
Body:          1rem / 400 weight / 1.6 line height
Small:         0.875rem / 400 weight
Caption:       0.75rem / 400 weight / muted color
```

### Shadow Hierarchy (3 levels)

```
--lc-shadow-sm   Cards at rest (barely visible, tonal definition)
--lc-shadow-md   Hover / emphasis (interactive feedback)
--lc-shadow-lg   Floating UI (dropdowns, modals, popovers)
```

### Interactive States (token-driven)

- **Hover (cards)**: `border-color: var(--lc-border-strong); box-shadow: var(--lc-shadow-md)` + optional translateY(-1px)
- **Selected**: `background: var(--lc-select); border: var(--lc-select-border); color: var(--lc-select-text); box-shadow: var(--lc-select-ring)`
- **Focus-visible**: `outline: 2px solid var(--lc-select-border)` (cool blue, not accent)
- **Disabled**: 50-70% opacity, cursor not-allowed
- **Loading**: skeleton shimmer (`lc-shimmer` keyframe)
- **Success**: green badge + toast
- **Error**: red text inline, button text changes

### UI Component Library

Shared components in `webapp/app/components/ui/`:

| Component | Purpose | Variants |
|---|---|---|
| `Badge` | Status/category/urgency indicator | status, category, urgency, tone (6 colors) |
| `Tabs` | Tab navigation with animated indicator | underline, pills |
| `ChallengeCard` | Unified challenge card | category pill, status badge, metrics, CTA |
| `Countdown` | Deadline countdown with urgency colors | sm, md |
| `EmptyState` | Empty list guidance | icon + title + description + CTA |
| `TransformingCTA` | State-aware action button | 7 states (connect → claimed) |
| `WalletPill` | Wallet address + dropdown | connected, disconnected |
| `NavBar` | Flat nav with underline indicator | 5-item default |
| `MobileDrawer` | Full-screen mobile nav | grouped items |
| `Breadcrumb` | Page hierarchy breadcrumb | — |
| `Skeleton` | Loading placeholder | shimmer animation |
| `StatCard` | Metric display card | — |

---

## 8. Implementation Status

All 5 original phases are complete. The design token system (v4) is the current foundation.

| Phase | Status | Key deliverables |
|---|---|---|
| Phase 1: Nav + Visual Foundation | **COMPLETE** | Grouped navbar with mega-dropdowns, wallet pill dropdown, design token system v4, breadcrumbs |
| Phase 2: Explore + Cards | **COMPLETE** | Challenge cards with pool/participants/deadline, horizontal filter pills, sort dropdown, urgency colors |
| Phase 3: Challenge Detail | **COMPLETE** | Tabbed content, TransformingCTA, 3-metric hero, participant rankings, AchievementClaim |
| Phase 4: Homepage | **COMPLETE** | Hero with stats, "How It Works", trending challenges, category cards |
| Phase 5: Polish + Celebration | **COMPLETE** | SuccessSheet + InviteSheet (theme-aware), achievement system (14 types), template picker, reputation levels |

### Additional features shipped (post-blueprint):

| Feature | Status |
|---|---|
| Tournament/competition creation wizard | **COMPLETE** — `/competitions/create` with type cards, schedule presets |
| Competition API (`/api/v1/competitions`) | **COMPLETE** — CRUD with API key + wallet auth |
| Organizations + teams | **COMPLETE** — `/org/new`, `/org/[slug]`, org members |
| Light/dark theme toggle | **COMPLETE** — full token-based theming with `var(--lc-select-*)` for selection states |
| 14 achievement types + milestones | **COMPLETE** — expanded from 2 types to 14 |
| Reputation level system (5 tiers) | **COMPLETE** — Newcomer → Legend progression |
| Competitive challenge ranking | **COMPLETE** — score-based, top-N, tie-breaking |

### Remaining work:

| Item | Priority | Notes |
|---|---|---|
| Command palette (Cmd+K) | Low | Power user feature |
| Confetti on claim success | Low | Polish |
| Bracket/elimination tournament UI | Medium | DB + API exists; needs visual bracket component |
| Discord bot integration | Medium | API-first approach enables this |

---

*This blueprint was originally research-only. It now serves as the living design reference for the LightChallenge platform. Last updated: March 2026.*
