# LightChallenge Webapp

Next.js 14 full-stack web application for the LightChallenge protocol.

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Environment

Copy `.env.example` from the repo root to `webapp/.env.local` and fill in required values.

At minimum: `DATABASE_URL`, `NEXT_PUBLIC_CHAIN_ID=504`, `NEXT_PUBLIC_RPC_URL`.

## Structure

```
webapp/
├── app/                    Next.js app router
│   ├── page.tsx            Homepage (hero + stats + featured challenges)
│   ├── explore/            Challenge browser (grid + filters)
│   ├── challenge/[id]/     Challenge detail (tabbed, modular)
│   ├── challenges/create/  Create challenge wizard
│   ├── competitions/       Tournament browser + create wizard
│   ├── me/                 My Challenges, Achievements, Claims
│   ├── proofs/             Evidence submission
│   ├── claims/             Reward claims
│   ├── player/[wallet]/    Player profile
│   ├── org/                Organizations
│   ├── admin/              Admin console (9 panels)
│   ├── settings/           Linked accounts
│   ├── components/         Shared components (Navbar, ThemeProvider, etc.)
│   ├── components/ui/      Design system (Badge, Tabs, ChallengeCard, etc.)
│   ├── api/                Server-side API routes
│   └── globals.css         Global styles + light/dark theme overrides
├── lib/                    Shared libraries (contracts, templates, formatters)
├── public/                 Static assets, ABIs, deployment manifests
└── .env.local              Environment variables (not committed)
```

## Design Tokens

All visual values are in `app/components/ui/tokens.css`. Both themes share the same token names:

- `--lc-bg` / `--lc-bg-raised` / `--lc-bg-overlay` / `--lc-bg-inset` — 4-level surface hierarchy with ~6 L* delta between bg and raised (dark theme)
- `--lc-accent` — CTA buttons only (dark navy in light theme, ice-white in dark)
- `--lc-select-*` — Selection states: tabs, filters, nav indicators, focus outlines
- `--lc-shadow-sm/md/lg` — 3-level shadow hierarchy (blue-tinted in dark theme)
- `--lc-glass` — Translucent card surfaces with `backdrop-filter: blur()`
- `--lc-border` / `--lc-border-strong` — Blue-tinted separator hierarchy

**Tailwind v4 class conventions:** Use `text-(--lc-text-muted)` not `text-[var(--lc-text-muted)]`, `z-80` not `z-[80]`, `py-0.5` not `py-[2px]`, `prefix!` not `!prefix`.

**Surface rendering:** Cards/panels use `color-mix(in oklab, var(--lc-bg-raised) ...)` gradients instead of hardcoded `rgba()` values. This ensures theme tokens propagate correctly to both light and dark themes.

See [DESIGN_BLUEPRINT.md](../DESIGN_BLUEPRINT.md) Section 7 for the full reference.

## Build

```bash
npm run build    # Production build
npx tsc --noEmit # Type check only
```

## API Routes

Key server-side routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/challenges` | GET/POST | Challenge CRUD |
| `/api/challenges/meta/[id]` | GET | Fast DB metadata |
| `/api/challenge/[id]` | GET | Full on-chain + DB data |
| `/api/me/challenges` | GET | User's challenges |
| `/api/me/achievements` | GET | User's achievement mints |
| `/api/me/reputation` | GET | User's reputation/level |
| `/api/v1/competitions` | GET/POST | Competition/tournament CRUD |
| `/api/aivm/intake` | POST | Evidence intake (multipart) |
| `/api/admin/*` | GET/PUT | Admin model/template management |

See the root [README.md](../README.md) for full architecture documentation.
