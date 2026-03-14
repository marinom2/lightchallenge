# LightChallenge UI System — Page Architecture

> Concrete mapping of new `ui/` components to pages, with data sources and props.

---

## Component Inventory

| Component | File | Purpose |
|-----------|------|---------|
| `Badge` | `Badge.tsx` | Status/category/urgency/tone labels |
| `Countdown` | `Countdown.tsx` | Deadline urgency with auto-refresh |
| `StatCard` | `StatCard.tsx` | Key metric (value + label) |
| `Tabs` | `Tabs.tsx` | Underline/pill tab navigation |
| `ChallengeCard` | `ChallengeCard.tsx` | Unified challenge card for grids |
| `Breadcrumb` | `Breadcrumb.tsx` | Navigation trail for deep pages |
| `TransformingCTA` | `TransformingCTA.tsx` | State-aware action button |
| `Skeleton` | `Skeleton.tsx` | Shimmer loading placeholders |
| `EmptyState` | `EmptyState.tsx` | Guidance for empty views |
| `NavBar` | `NavBar.tsx` | Flat 5-item top navigation |
| `WalletPill` | `WalletPill.tsx` | Wallet display + dropdown menu |
| `MobileDrawer` | `MobileDrawer.tsx` | Full-screen mobile nav overlay |

---

## Page → Component Mapping

### 1. Layout (`app/layout.tsx`)

```
NavBar
  items: [{Explore, Create, My Challenges, Claims, Achievements}]
  rightSlot: <NetworkStatus /> <ThemeSwitcher /> <WalletPill />
  mobileMenuSlot: <HamburgerButton />

MobileDrawer
  items: [all nav items, grouped: Primary | Settings]
  footer: <WalletPill /> <ThemeSwitcher />
```

**Data**: `useAccount()` → connected/address/balance for WalletPill. `useReadContract(admin)` → isAdmin for dropdown.

---

### 2. Homepage (`app/page.tsx`)

```
Section: Hero
  <h1> headline </h1>
  <p> subline </p>
  <TransformingCTA state="join" /> → links to /explore
  <Button variant="secondary" /> → links to /challenges/create

Section: Stats Row
  <StatCard label="Challenges" value={count} layout="vertical" />
  <StatCard label="LCAI Pool" value={pool} unit="LCAI" layout="vertical" />
  <StatCard label="Verified" value={verified} layout="vertical" />
  <StatCard label="Network" value="Testnet" layout="vertical" icon={<dot/>} />

Section: How It Works
  3x numbered step cards (static content)

Section: Trending Challenges
  <ChallengeCard /> × 3-4 (from GET /api/challenges?sort=trending&limit=4)
  <Skeleton variant="card" /> while loading
  <EmptyState title="No challenges yet" /> if empty

Section: Categories
  <Tabs variant="pills" tabs={[All, Gaming, Fitness, Custom]} />
```

**Data sources**:
- `GET /api/stats` → challenges count, pool total, verified count
- `GET /api/challenges?sort=trending&limit=4` → featured cards

---

### 3. Explore (`app/explore/page.tsx`)

```
<Breadcrumb items={[{label: "Explore"}]} />   ← single item, just for consistency

Filter bar:
  <input type="search" /> search box
  <Tabs variant="pills" tabs={[All, Gaming, Fitness, Custom]} /> ← category filter
  <Tabs variant="pills" tabs={[Active, Ended]} size="sm" /> ← status filter
  <select> sort dropdown (Ending Soon | Newest | Highest Pool | Most Participants)

Grid:
  <ChallengeCard /> × N
  <ChallengeCardSkeleton /> × 8 while loading
  <EmptyState title="No challenges found" description="Try different filters" />

Pagination:
  "Load more" button or infinite scroll
```

**Data**: `GET /api/challenges?category=X&status=X&sort=X&offset=N&limit=20`

---

### 4. Challenge Detail (`app/challenge/[id]/page.tsx`)

```
<Breadcrumb items={[
  {label: "Explore", href: "/explore"},
  {label: `Challenge #${id}`},
]} />

Hero section:
  <Badge variant="status" status={status} dot />
  <Badge variant="category">{category}</Badge>
  <h1> title </h1>
  <p> description </p>
  <StatCard label="Total Pool" value={pool} unit="LCAI" layout="vertical" size="lg" />
  <StatCard label="Participants" value={count} layout="vertical" size="lg" />
  <Countdown deadline={deadline} size="md" />

CTA section:
  <TransformingCTA
    state={computedState}   ← connect|join|submit|verifying|awaiting|claim|claimed
    subtitle={`Stake: ${amount} LCAI`}
    onClick={handleAction}
  />

<Tabs
  tabs={[
    {id: "overview", label: "Overview"},
    {id: "participants", label: "Participants", count: participantCount},
    {id: "evidence", label: "Evidence", count: evidenceCount},
    {id: "activity", label: "Activity"},
  ]}
  activeId={activeTab}
  onTabChange={setActiveTab}
/>

Tab content:
  overview → rules, timeline, verification model, creator address
  participants → ranked list with <Badge> for scores, verdict status
  evidence → per-participant evidence summary with provider badges
  activity → on-chain event timeline
```

**CTA state computation**:
```
if (!connected)              → "connect"
if (!isParticipant)          → "join"
if (isParticipant && !hasEvidence) → "submit"
if (hasEvidence && !verdict) → "verifying"
if (verdict && status=Active) → "awaiting"
if (canClaim)                → "claim"
if (hasClaimed)              → "claimed"
```

**Data sources**:
- `GET /api/challenges/meta/{id}` → fast title/desc (100-300ms)
- `GET /api/challenge/{id}` → on-chain data (5-15s)
- `GET /api/challenges/{id}/results` → participants, verdicts
- `GET /api/challenges/{id}/rankings` → leaderboard
- `GET /api/challenges/{id}/evidence-summary` → evidence aggregates

---

### 5. My Challenges (`app/me/challenges/page.tsx`)

```
<Breadcrumb items={[{label: "My Challenges"}]} />

<Tabs
  tabs={[
    {id: "active", label: "Active", count: activeChallenges.length},
    {id: "completed", label: "Completed", count: completedChallenges.length},
    {id: "all", label: "All"},
  ]}
/>

Grid:
  <ChallengeCard
    challenge={c}
    userState={computeUserState(c)}  ← shows personalized CTA
    onClick={...}
  />
  <ChallengeCardSkeleton /> while loading
  <EmptyState
    title="No challenges yet"
    description="Join a challenge to get started"
    actionLabel="Explore Challenges"
    onAction={() => router.push("/explore")}
  />
```

**Data**: `GET /api/me/challenges?address=X`

---

### 6. Claims (`app/claims/page.tsx`)

```
<Breadcrumb items={[{label: "Claims"}]} />

<StatCard label="Claimable" value={totalClaimable} unit="LCAI" size="lg" />
<StatCard label="Claimed" value={totalClaimed} unit="LCAI" size="lg" />

List:
  per-claim row with:
    <Badge variant="status" status={claimStatus} />
    challenge title, amount, tx hash link
    <TransformingCTA state="claim" /> per row (if claimable)

  <EmptyState title="No claims" description="Win or complete challenges to earn rewards" />
```

**Data**: `GET /api/me/claims?address=X`

---

### 7. Achievements (`app/me/achievements/page.tsx`)

```
<Breadcrumb items={[{label: "Achievements"}]} />

Profile card (top):
  <Badge variant="tone" tone="accent">{levelName}</Badge>
  <StatCard label="Points" value={points} size="lg" />
  progress bar → next level
  <StatCard label="Completions" value={N} layout="horizontal" size="sm" />
  <StatCard label="Victories" value={N} layout="horizontal" size="sm" />

<Tabs variant="pills" tabs={[All, Completion, Victory]} />

Grid:
  achievement cards with:
    <Badge variant="tone" tone={type === 'victory' ? 'success' : 'accent'} />
    challenge title, date, token ID
  <EmptyState title="No achievements yet" description="Complete challenges to earn your first NFT" />
```

**Data**:
- `GET /api/me/reputation?address=X` → level, points, next threshold
- `GET /api/me/achievements?address=X` → achievement list

---

### 8. Create Challenge (`app/challenges/create/page.tsx`)

```
Step indicator (existing 4-step wizard):
  <Tabs variant="pills" tabs={[
    {id: "what", label: "1. What"},
    {id: "stakes", label: "2. Stakes"},
    {id: "rules", label: "3. Rules"},
    {id: "review", label: "4. Review"},
  ]} />

Per step: existing form fields

Review step:
  <StatCard label="Stake" value={amount} unit="LCAI" />
  <Badge variant="category">{category}</Badge>
  <Countdown deadline={endDate} />
  <TransformingCTA state="join" onClick={submitTx}>
    → label overridden to "Create Challenge"
```

---

## Design Token Integration

All new `ui/` components use `var(--lc-*)` tokens exclusively. To activate:

1. Import `tokens.css` in `globals.css`:
   ```css
   @import "./components/ui/tokens.css";
   ```

2. New components work alongside existing styles — no conflicts due to `lc-` prefix.

3. Migration path: gradually replace legacy class-based styles with token-based inline styles in existing page components.

---

## Responsive Breakpoints

Using the existing Tailwind breakpoints, with CSS for `lc-navbar` hide/show:

```css
/* Hide desktop nav on mobile, show mobile trigger */
@media (max-width: 767px) {
  .lc-navbar__nav { display: none !important; }
  .lc-navbar__right { display: none !important; }
  .lc-navbar__mobile-trigger { display: flex; }
}
@media (min-width: 768px) {
  .lc-navbar__mobile-trigger { display: none; }
}
```

---

## Data Flow Summary

| Page | Fast data (< 300ms) | Slow data (1-15s) |
|------|---------------------|-------------------|
| Homepage | `/api/stats`, `/api/challenges?limit=4` | — |
| Explore | `/api/challenges?...` | — |
| Challenge detail | `/api/challenges/meta/{id}` | `/api/challenge/{id}` (on-chain) |
| My Challenges | `/api/me/challenges` | per-card on-chain refresh |
| Claims | `/api/me/claims` | — |
| Achievements | `/api/me/reputation`, `/api/me/achievements` | — |

All slow data paths use `<Skeleton>` placeholders during loading.
