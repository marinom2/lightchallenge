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
- **Minimal top bar**: 4-5 items max + primary CTA
- Primary nav: **Explore**, **Create**, **My Challenges**, **Claims**
- Secondary items ("More"): Achievements, Linked Accounts, Admin
- Primary CTA: **Connect Wallet** (if disconnected) or **wallet pill** (if connected)
- No sidebar for primary navigation — only for browse filters on Explore
- Mobile: hamburger menu with the same item order

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

## 5. LightChallenge UX Weaknesses (Current State vs. Best-in-Class)

### Critical Issues

| # | Weakness | Best Practice Violated | Severity |
|---|----------|----------------------|----------|
| 1 | **Homepage is a marketing page, not a product** | Lido/OpenSea show product immediately; Uniswap centers the swap card | High |
| 2 | **"More" dropdown hides key pages** (Achievements, Submit Proof, Linked Accounts) | All critical user flows should be ≤1 click from any page | High |
| 3 | **No deadline urgency on challenge cards** | Kaggle, Devpost: countdown is the #1 scanning element | High |
| 4 | **No transforming CTA on challenge detail** | Kaggle: "Join" becomes "Submit"; Uniswap: button text adapts to state | Medium |
| 5 | **Dual data loading (meta + chain)** causes 5-15s wait | Aave/Uniswap: skeleton loading with near-instant useful state | Medium |

### Navigation Issues

| # | Weakness | Fix Direction |
|---|----------|--------------|
| 6 | 4 primary + "More" dropdown = buried secondary pages | Flatten to 5 visible items, move Admin to settings |
| 7 | No breadcrumbs on deep pages (challenge detail, proofs) | Add breadcrumbs for context |
| 8 | No "back" affordance from challenge detail to explore | Breadcrumb: Explore > Challenge #42 |
| 9 | Footer duplicates nav without adding value | Footer should have: Docs, GitHub, API, Status, Discord links |

### Explore Page Issues

| # | Weakness | Fix Direction |
|---|----------|--------------|
| 10 | **Sidebar filters invisible on mobile** | Collapsible filter sheet (bottom sheet on mobile) |
| 11 | Grid/table toggle adds cognitive load | Default to cards; table view for power users only |
| 12 | Category sections (Dota 2, CS2, etc.) feel like browsing a game store, not challenges | Unified card grid with category pills on cards instead |
| 13 | No sort options visible (only tabs) | Add explicit sort: Newest, Ending Soon, Highest Pool |
| 14 | Challenge cards don't show pool amount or participant count prominently | These are the #1 and #2 social proof signals |

### Challenge Detail Issues

| # | Weakness | Fix Direction |
|---|----------|--------------|
| 15 | No tabbed content — details/rules/activity are in panels | Adopt Kaggle's tab pattern: Overview / Participants / Evidence / Activity |
| 16 | Hero section shows too many metrics initially | Show 3 max: Pool, Participants, Time Left |
| 17 | No participant list or leaderboard visible | Add Participants tab with scores/rankings |
| 18 | Achievement claim is a separate component, not part of the flow | Integrate into the transforming CTA |

### Create Challenge Issues

| # | Weakness | Fix Direction |
|---|----------|--------------|
| 19 | 4-step flow is already good, but step naming is generic | Use human labels: "What" → "Stakes" → "Rules" → "Review" |
| 20 | No template/quick-start option | "Start from template" for common challenge types |

### Visual/Polish Issues

| # | Weakness | Fix Direction |
|---|----------|--------------|
| 21 | "Cosmic glass" aesthetic is unique but inconsistent with premium patterns | Move toward Vercel/Linear dark theme: cleaner, less glow, more structure |
| 22 | Too many visual effects (gradients, glows, backdrop blur stacking) | Reduce to: dark bg + single accent + subtle borders |
| 23 | Card shadows are heavy (46px blur) | Lighter shadows or none; use border for card definition |
| 24 | Multiple accent colors used (warm gold, accent blue, etc.) | Single accent color throughout |
| 25 | Emoji icons in Use Cases section feel casual | Use clean line icons or filled icons (Lucide, Heroicons) |

---

## 6. Full UX/UI Design Blueprint

### 6.1 Page Hierarchy

```
lightchallenge.app/
├── /                          → Homepage (hero + stats + featured challenges)
├── /explore                   → Challenge browser (grid + filters)
├── /challenge/[id]            → Challenge detail (tabbed: Overview/Participants/Evidence/Activity)
├── /challenges/create         → Create wizard (4-step)
├── /me/
│   ├── /challenges            → My participated challenges
│   ├── /achievements          → Achievements + reputation profile
│   └── /claims                → Reward claims dashboard
├── /proofs/[challengeId]      → Evidence submission page
├── /settings/
│   ├── /linked-accounts       → Platform connections
│   └── /admin                 → Admin panel (admin-only)
└── /docs → redirect to uat.docs.lightchallenge.app
```

### 6.2 Navigation Architecture

#### Desktop Top Bar (left to right)
```
[Logo: LightChallenge]  [Explore] [Create] [My Challenges] [Claims] [Achievements]    [NetworkStatus] [ThemeToggle] [ConnectWallet]
```

- **5 visible nav items** (no "More" dropdown)
- **Logo** links to homepage
- **Active route** indicated by underline or filled background
- **ConnectWallet** button: primary CTA when disconnected (accent color, filled). When connected: wallet pill showing truncated address + chain icon
- **Admin** access: moved to `/settings/admin`, accessible from user menu (click connected wallet pill)
- **Linked Accounts**: moved to settings, accessible from wallet pill dropdown
- **Submit Proof**: removed from nav (accessed via challenge detail or My Challenges)

#### Mobile Top Bar
```
[Logo]                                    [ConnectWallet] [☰ Hamburger]
```

Hamburger opens full-screen drawer with all nav items + theme toggle.

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

### 6.7 Create Challenge Blueprint

Keep the 4-step wizard but with improved labels and a template option:

```
Step 0 (optional): Choose a template
  → "10K Steps Daily" / "Dota 2 Win Streak" / "Marathon Distance" / "Custom"

Step 1: "What" — Challenge Type
  → Intent (Gaming/Fitness), specific game/activity, mode

Step 2: "Stakes" — Budget & Timeline
  → Stake amount, currency, join deadline, start/end dates, proof deadline

Step 3: "Rules" — Verification
  → Verification model, thresholds, allowlist

Step 4: "Review" — Confirm & Create
  → Full summary, estimated gas, create button
```

### 6.8 Achievements Page Blueprint

```
┌──────────────────────────────────────────────────────────────────┐
│ Achievements                                                      │
│                                                                    │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ ★ Competitor  ·  Level 3                                     │  │
│ │                                                               │  │
│ │ 350 points  ·  5 completions  ·  2 victories                 │  │
│ │                                                               │  │
│ │ [████████████████░░░░░░░░] 350/800 → Champion               │  │
│ └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ [All] [Victories 🏆] [Completions ✓]                             │
│                                                                    │
│ ┌───────────────────────────────────────────────────────────┐    │
│ │ 🏆 Victory: 10K Steps Challenge                            │    │
│ │    Challenge #42  ·  Fitness  ·  Mar 10, 2026              │    │
│ ├───────────────────────────────────────────────────────────┤    │
│ │ ✓ Completion: Dota 2 Win Streak                            │    │
│ │    Challenge #38  ·  Gaming  ·  Mar 8, 2026                │    │
│ ├───────────────────────────────────────────────────────────┤    │
│ │ ✓ Completion: Marathon Prep                                │    │
│ │    Challenge #35  ·  Fitness  ·  Mar 5, 2026               │    │
│ └───────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

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

## 7. Visual Philosophy

### Color System

```
Background:    #0a0a0a (near-black, not pure black)
Surface:       #141414 (cards, panels)
Border:        #1f1f1f (subtle, barely visible)
Text primary:  #fafafa (high contrast)
Text secondary:#888888 (muted)
Accent:        #6B5CFF (brand purple — single accent throughout)
Success:       #22c55e (green — pass, active, healthy)
Warning:       #eab308 (yellow — ending soon, pending)
Danger:        #ef4444 (red — failed, ended, error)
Info:          #3b82f6 (blue — informational badges)
```

### Typography

```
Font:          Inter (already in use)
Title:         32px / 700 weight / -0.02em tracking
Heading:       24px / 600 weight
Subheading:    18px / 500 weight
Body:          16px / 400 weight / 1.6 line height
Small:         14px / 400 weight
Caption:       12px / 400 weight / muted color
Mono:          14px / JetBrains Mono or similar (addresses, hashes)
```

### Spacing Scale

```
4px  — tight (icon margins, inline spacing)
8px  — compact (between related items)
12px — default (card padding, list gaps)
16px — comfortable (section internals)
24px — spacious (between card groups)
32px — section gap (between page sections)
48px — major section gap (hero to content)
64px — page-level separation
```

### Interactive States

- **Hover**: subtle background brightening (+5% white overlay), optional border accent
- **Focus**: 2px ring in accent color (accessibility)
- **Active**: background fills to accent color (for selected tabs, active nav)
- **Disabled**: 50% opacity, cursor not-allowed
- **Loading**: skeleton shimmer (not spinners, except inline in buttons)
- **Success**: green checkmark + brief toast, optional confetti for claims
- **Error**: red text inline, button text changes ("Insufficient Balance")

---

## 8. Implementation Priority

### Phase 1: Navigation + Visual Foundation
1. Flatten navbar (5 visible items, no "More" dropdown)
2. Add wallet pill dropdown with user links
3. Standardize color system (single accent, reduce visual effects)
4. Add breadcrumbs to detail pages

### Phase 2: Explore + Cards
1. Redesign challenge cards (pool, participants, deadline prominent)
2. Horizontal filter pills (replace sidebar)
3. Sort dropdown
4. Deadline countdown with color urgency

### Phase 3: Challenge Detail
1. Tabbed content (Overview / Participants / Evidence / Activity)
2. Transforming CTA button
3. 3-metric hero (Pool, Participants, Time Left)
4. Participants tab with rankings

### Phase 4: Homepage
1. Tighten hero copy
2. Live trending challenges from API
3. Category cards with challenge counts
4. Clean footer with docs/GitHub/API/status links

### Phase 5: Polish + Celebration
1. Success/celebration states for claims and wins
2. Achievement claim integrated into challenge detail flow
3. Template picker on create challenge
4. Command palette (Cmd+K) for power users

---

*This blueprint is research and planning only. No code was modified.*
