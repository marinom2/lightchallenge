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

## 7. Apple HIG-Informed Design System (v5)

> Informed by Apple Human Interface Guidelines, WWDC 2025 design sessions, and analysis of
> Stripe/Linear/Vercel design systems. All values centralized in `webapp/app/components/ui/tokens.css`.

### 7.1 Design Philosophy

Three pillars from Apple HIG, adapted for Web3:

1. **Clarity** — Text legible at every size, icons precise, adornments purposeful. Users immediately know: "Where am I? What can I do? Where can I go?"
2. **Deference** — Interface never competes with content. Translucent materials hint at depth. Minimal bezels, restrained shadows.
3. **Depth** — Visual layers convey hierarchy. Transitions provide spatial context. Touch/hover feedback is immediate and physical.

Additional principles:
- **Semantic color only** — Color always carries meaning (status, action, alert). Never decorative.
- **Progressive disclosure** — Show only what's needed. Reveal complexity through interaction.
- **Concentric design** — Inner radii = outer radii - padding. Nested elements share a visual center.
- **44px minimum touch targets** — Every interactive element meets Apple's accessibility minimum.

### 7.2 Color System

Inspired by Apple's semantic color architecture with 4-level label opacity hierarchy.

**Dark theme (default):**
```
Surfaces:
  --lc-bg:          #030509     (base — near-black, OLED-friendly)
  --lc-bg-raised:   #0b0e17     (L1 elevated — cards, panels)
  --lc-bg-overlay:  #11141f     (L2 — popovers, sheets)
  --lc-bg-inset:    #07091a     (recessed — inputs, wells)

Text (Apple-style opacity hierarchy):
  --lc-text:          rgba(255,255,255, 0.93)    (primary — 93%)
  --lc-text-secondary: rgba(255,255,255, 0.60)   (secondary — 60%)
  --lc-text-tertiary:  rgba(255,255,255, 0.32)   (tertiary — 32%)
  --lc-text-muted:     rgba(140,150,180, 0.45)   (quaternary — weakest)

Borders (separator hierarchy):
  --lc-border:        rgba(150,165,195, 0.10)    (standard separator)
  --lc-border-strong: rgba(150,165,195, 0.18)    (emphasized separator)

Accent (ice-white, CTAs only):
  --lc-accent:       #f6f7ff
  --lc-accent-text:  #03040c

Selection (cool blue — Apple-grade focus/selected states):
  --lc-select:        rgba(80,140,255, 0.07)
  --lc-select-border: rgba(80,140,255, 0.22)
  --lc-select-text:   #7eb4ff

Semantic status:
  --lc-success:  #22c55e    --lc-warning: #eab308
  --lc-danger:   #ef4444    --lc-info:    #3b82f6
```

**Light theme:**
```
Surfaces:
  --lc-bg:          #f5f7fb     (icy blue-white — cf. Apple #F2F2F7)
  --lc-bg-raised:   #eef1f8     (grouped content)
  --lc-bg-inset:    #eaeff7     (recessed wells)

Text:
  --lc-text:           #0c1020   (deep navy)
  --lc-text-secondary: #4a5370   (60% equivalent)
  --lc-text-tertiary:  #8494b4   (32% equivalent)
  --lc-text-muted:     #7585a5   (quaternary)

Glass (Apple-style translucent material):
  --lc-glass:         rgba(255,255,255, 0.65)
  --lc-glass-hover:   rgba(255,255,255, 0.80)
  --lc-glass-border:  rgba(60,80,130, 0.08)

Accent:  #111d3a (deep navy)
```

**Key rule:** `--lc-accent` for CTA buttons only. Selection states use `--lc-select-*`. This prevents accent-colored borders overwhelming the light theme.

### 7.3 Typography Scale

Mapped to Apple's type style hierarchy with Inter as the primary face:

| Token | Size | Weight | Line Height | Tracking | Apple Equivalent |
|-------|------|--------|-------------|----------|-----------------|
| `--lc-text-display` | clamp(2rem, 4vw, 2.75rem) | 800 | 1.1 | -0.035em | Large Title |
| `--lc-text-title` | clamp(1.75rem, 3vw, 2rem) | 700 | 1.2 | -0.025em | Title 1 |
| `--lc-text-heading` | clamp(1.25rem, 2vw, 1.5rem) | 600 | 1.3 | -0.02em | Title 2 |
| `--lc-text-subhead` | 1.0625rem | 600 | 1.4 | -0.01em | Headline |
| `--lc-text-body` | 1rem | 400 | 1.6 | 0 | Body |
| `--lc-text-small` | 0.875rem | 400 | 1.5 | 0 | Callout |
| `--lc-text-caption` | 0.75rem | 500 | 1.4 | 0.01em | Caption 1 |
| `--lc-text-micro` | 0.6875rem | 500 | 1.3 | 0.02em | Caption 2 |

**Font stack:** `'Inter var', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
**Mono:** `'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`

### 7.4 Spacing Scale (Base-4/Base-8 Grid)

Aligned with Apple's implicit 4pt/8pt grid:

| Token | Value | Usage |
|-------|-------|-------|
| `--lc-space-0` | 2px | Micro gaps (badge padding) |
| `--lc-space-1` | 4px | Icon-to-label, tight pairs |
| `--lc-space-2` | 8px | Inline spacing, chip padding |
| `--lc-space-3` | 12px | Card internal padding (compact) |
| `--lc-space-4` | 16px | Standard content margin (Apple: 16pt phone) |
| `--lc-space-5` | 20px | Card padding, section gaps (Apple: 20pt tablet) |
| `--lc-space-6` | 24px | Section separation |
| `--lc-space-8` | 32px | Major section breaks |
| `--lc-space-10` | 40px | Page section gaps |
| `--lc-space-12` | 48px | Hero spacing |
| `--lc-space-16` | 64px | Page-level vertical rhythm |

### 7.5 Component Sizing

| Token | Value | Usage |
|-------|-------|-------|
| `--lc-ctl-h` | 42px | Standard control height (≥44px touch target) |
| `--lc-ctl-h-sm` | 36px | Compact control (44px touch area via padding) |
| `--lc-ctl-h-lg` | 48px | Large control |
| `--lc-icon-xs` | 14px | Inline text icons |
| `--lc-icon-sm` | 16px | Button icons, nav icons |
| `--lc-icon-md` | 20px | Card icons, list icons |
| `--lc-icon-lg` | 24px | Feature icons, section icons |
| `--lc-icon-xl` | 32px | Hero icons, integration icons |
| `--lc-icon-2xl` | 48px | Page hero icons |

### 7.6 Border Radius (Concentric Squircle System)

| Token | Value | Usage |
|-------|-------|-------|
| `--lc-radius-xs` | 6px | Badges, tiny elements |
| `--lc-radius-sm` | 10px | Icons, small cards, inputs |
| `--lc-radius-md` | 14px | Buttons, standard cards |
| `--lc-radius-lg` | 18px | Panels, large cards |
| `--lc-radius-xl` | 22px | Sheets, hero sections |
| `--lc-radius-pill` | 999px | Pills, capsule buttons |

**Concentric rule:** Inner element radius = parent radius - padding between them.
Example: Panel (18px) with 16px padding → inner card should use 10px radius (14-4 ≈ 10).

### 7.7 Shadow Hierarchy (3 Levels + Glow)

```
--lc-shadow-sm    L1: Cards at rest — tonal definition, barely visible
--lc-shadow-md    L2: Hover emphasis — interactive feedback
--lc-shadow-lg    L3: Floating UI — dropdowns, modals, popovers

Glow variants (for accent elements):
--glow-accent     Soft brand glow
--glow-warm       Gold CTA glow
--glow-info       Blue informational glow
```

### 7.8 Glass Materials (Apple-Inspired)

| Material | Blur | Opacity | Usage |
|----------|------|---------|-------|
| Ultra-thin | 6px | 0.04 | Background ambient |
| Regular | 12px | 0.65 (light) / 0.04 (dark) | Cards, surfaces |
| Thick | 16px | 0.82 (light) / 0.78 (dark) | Navbar, sheets |
| Chrome | 24px | 0.92 (light) / 0.92 (dark) | Modal overlay |

All glass materials include `saturate(1.15-1.3)` to prevent muddy blur (Apple technique).

### 7.9 Motion System

Inspired by Apple's spring animation model:

| Preset | Duration | Easing | Usage |
|--------|----------|--------|-------|
| Instant | 0ms | — | State changes (color, opacity) |
| Fast | 120ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Micro-interactions (hover, press) |
| Base | 180ms | Same | Standard transitions |
| Slow | 300ms | Same | Layout shifts, reveals |
| Spring | 350ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy elements (modals, sheets) |

**Principles:**
- Hover: `translateY(-1px)` + shadow upgrade (L1→L2)
- Press: `scale(0.97)` (Apple's press-down feel)
- Enter: Fade + `translateY(4px)` → origin
- Respect `prefers-reduced-motion` — all animations disabled

### 7.10 Interactive State Matrix

| State | Border | Background | Shadow | Transform | Opacity |
|-------|--------|------------|--------|-----------|---------|
| Rest | `--lc-border` | `--lc-bg-raised` | `shadow-sm` | none | 1 |
| Hover | `--lc-border-strong` | `--lc-glass-hover` | `shadow-md` | `translateY(-1px)` | 1 |
| Press | `--lc-border-strong` | `--lc-bg-raised` | `shadow-sm` | `scale(0.97)` | 1 |
| Selected | `--lc-select-border` | `--lc-select` | `shadow-sm` | none | 1 |
| Focus | `outline: 2px --lc-select-border` | unchanged | unchanged | none | 1 |
| Disabled | `--lc-border` | `--lc-bg-raised` | none | none | 0.45 |
| Loading | `--lc-border` | shimmer gradient | none | none | 1 |

### 7.11 Accessibility Compliance

| Requirement | Target | Implementation |
|-------------|--------|----------------|
| Text contrast (normal) | ≥ 4.5:1 | Verified via `--lc-text` on `--lc-bg` |
| Text contrast (large) | ≥ 3:1 | Verified for headings |
| Touch targets | ≥ 44×44px | `--lc-ctl-h: 42px` + padding |
| Focus indicators | 2px ring, 2px offset | `--lc-select-border` |
| Motion | Respects `prefers-reduced-motion` | All animations gated |
| Color independence | Never color-alone | Icons + text + shape pair with color |

### 7.12 Utility Class System

To eliminate inline styles, the design system provides utility classes:

**Layout:** `.flex`, `.flex-col`, `.flex-center`, `.flex-between`, `.flex-wrap`, `.grid-2`, `.grid-3`, `.grid-4`
**Spacing:** `.gap-1` through `.gap-8`, `.p-1` through `.p-6`, `.px-*`, `.py-*`, `.mt-*`, `.mb-*`
**Text:** `.text-xs` through `.text-display`, `.font-medium`, `.font-semibold`, `.font-bold`, `.text-secondary`, `.text-muted`, `.text-mono`, `.truncate`
**Width:** `.w-full`, `.max-w-narrow`, `.max-w-content`, `.mx-auto`

### 7.13 UI Component Library

| Component | Purpose | Variants |
|---|---|---|
| `Badge` | Status/category/urgency | status, category, urgency, tone (6 colors) |
| `Tabs` | Navigation with animated indicator | underline, pills |
| `ChallengeCard` | Unified challenge card | category pill, metrics, CTA |
| `Countdown` | Deadline with urgency colors | sm, md |
| `EmptyState` | Empty guidance | icon + title + CTA |
| `TransformingCTA` | State-aware button | 7 states (connect → claimed) |
| `WalletPill` | Wallet address dropdown | connected, disconnected |
| `NavBar` | Grouped nav with mega-dropdowns | 5 items |
| `MobileDrawer` | Full-screen mobile nav | grouped sections |
| `Breadcrumb` | Page hierarchy | — |
| `Skeleton` | Loading placeholder | shimmer |
| `StatCard` | Metric display | — |
| `GlassIcon` | Themed icon container | 7 color variants |
| `ConnectWalletGate` | Auth gate with CTA | — |

### 7.14 Icon System (3-Layer)

| Layer | Source | Usage |
|-------|--------|-------|
| Core UI | lucide-react | Navigation, actions, controls (Compass, Trophy, Shield, etc.) |
| Product | `components/icons/ProductIcons.tsx` | Domain concepts (AIVM, Proof, Escrow, Evidence, etc.) |
| Brand | `components/icons/BrandIcons.tsx` | External platforms (Steam, Strava, Apple Health, Garmin, etc.) |

All icons: `currentColor`, consistent stroke-width (1.8), accept `size` + `className` props.

---

## 8. Implementation Status

All 5 original phases + Apple HIG refinement complete. Design token system v5 is the current foundation.

| Phase | Status | Key deliverables |
|---|---|---|
| Phase 1: Nav + Visual Foundation | **COMPLETE** | Grouped navbar, wallet pill, design tokens v4, breadcrumbs |
| Phase 2: Explore + Cards | **COMPLETE** | Challenge cards, filter pills, sort dropdown, urgency colors |
| Phase 3: Challenge Detail | **COMPLETE** | Tabbed content, TransformingCTA, 3-metric hero, rankings |
| Phase 4: Homepage | **COMPLETE** | Hero + stats + "How It Works" + featured challenges |
| Phase 5: Polish + Celebration | **COMPLETE** | Success/Invite sheets, 14 achievements, reputation levels |
| Phase 6: Apple HIG Refinement | **COMPLETE** | Token v5, utility classes, inline style cleanup, 4-level text hierarchy, concentric radii, 44px touch targets, motion system, comprehensive light/dark theme |

### Additional features shipped:

| Feature | Status |
|---|---|
| Tournament/competition wizard | **COMPLETE** — type cards, schedule presets |
| Competition API | **COMPLETE** — CRUD with API key + wallet auth |
| Organizations + teams | **COMPLETE** — create, manage, member lists |
| Light/dark theme toggle | **COMPLETE** — full token-based, 300+ light overrides |
| 14 achievement types + milestones | **COMPLETE** |
| Reputation level system (5 tiers) | **COMPLETE** |
| Learn pages (7 info pages) | **COMPLETE** — platforms + verification |
| Admin panel (20+ pages) | **COMPLETE** — sidebar nav, dashboard, KPIs |
| Icon system (3-layer) | **COMPLETE** — lucide + ProductIcons + BrandIcons |

### Remaining work:

| Item | Priority | Notes |
|---|---|---|
| Command palette (Cmd+K) | Low | Power user feature |
| Confetti on claim success | Low | Polish |
| Bracket tournament visual UI | Medium | DB + API exists |
| Discord bot integration | Medium | API-first approach |

---

*This blueprint serves as the living design reference for the LightChallenge platform.
Informed by Apple HIG, Stripe/Linear/Vercel design analysis, and Web3 dApp best practices.
Last updated: March 2026.*
