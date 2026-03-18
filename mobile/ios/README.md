# LightChallenge iOS App

Full-featured iOS client for the LightChallenge protocol — browse challenges, create and join with on-chain transactions, submit fitness evidence via HealthKit, and track achievements.

## Features

- **WalletConnect v2** (Reown AppKit): Connect MetaMask, Trust Wallet, or any WC-compatible wallet on LightChain (chain ID 504)
- **Challenge creation**: On-chain `createChallenge()` via WalletConnect, followed by off-chain metadata save with tx-receipt auth
- **Challenge browsing**: Explore by category (fitness, gaming, custom), search, filter by status
- **Join challenges**: On-chain `joinChallengeNative()` with stake amount
- **HealthKit integration**: Read steps, distance, cycling, swimming data; submit as evidence
- **Auto-proof**: Automatic HealthKit evidence submission during proof window (via `AutoProofService`)
- **Strava OAuth**: Link Strava account for server-side activity collection
- **Phase-aware UI**: Shows correct status per challenge lifecycle phase (upcoming → active → proofWindow → ended → finalized)
- **Achievements & claims**: View soulbound NFTs, claim rewards
- **Leaderboard**: Seasonal protocol-wide rankings
- **Push notifications**: Proof window reminders, verdict notifications
- **Token prices**: Live LCAI/USDC conversion via `TokenPriceService`

## Requirements

- Xcode 16+
- iOS 17+
- Physical device (HealthKit not available in Simulator)

## Build

```bash
cd mobile/ios/LightChallengeApp
xcodebuild -scheme LightChallengeApp -destination 'id=<DEVICE_ID>' build
```

Or open `LightChallengeApp.xcodeproj` in Xcode and build to a physical device.

## Source Tree

```
Sources/
├── LightChallengeApp.swift                 # App entry, deep links, WalletConnect setup
├── Models/
│   ├── Challenge.swift                     # ChallengeMeta, ChallengeDetail, ChallengePhase, enums
│   ├── Contracts.swift                     # ABI definitions, contract addresses
│   ├── Models.swift                        # Shared data models (evidence, verdicts, claims)
│   └── Templates.swift                     # Challenge template definitions
├── Services/
│   ├── ABIEncoder.swift                    # Ethereum ABI encoding for contract calls
│   ├── APIClient.swift                     # Network layer (all /api/* calls)
│   ├── AppState.swift                      # Global state (wallet, environment, navigation)
│   ├── AutoProofService.swift              # Automatic HealthKit evidence submission
│   ├── AvatarService.swift                 # Wallet-based avatar generation
│   ├── CacheService.swift                  # Disk + memory cache for API responses
│   ├── ContractService.swift               # On-chain tx construction (create, join, claim)
│   ├── HealthKitService.swift              # HealthKit data collection + evidence building
│   ├── NotificationService.swift           # Push notification scheduling
│   ├── OAuthService.swift                  # Strava OAuth flow
│   ├── TokenPriceService.swift             # LCAI/USDC price fetching
│   └── WalletManager.swift                 # WalletConnect session + signing via Reown AppKit
├── Theme/
│   └── DesignTokens.swift                  # Colors, spacing, typography constants
└── Views/
    ├── ContentView.swift                   # Root view (onboarding vs main)
    ├── MainTabView.swift                   # Tab bar (Explore, Challenges, Activity, Profile)
    ├── Achievements/
    │   ├── AchievementsView.swift          # Achievement NFT gallery
    │   ├── AchievementShareCard.swift      # Shareable achievement image
    │   └── ChallengeShareCard.swift        # Shareable challenge image
    ├── Activity/
    │   └── MyActivityView.swift            # User's challenge participation list
    ├── Challenges/
    │   └── ChallengesView.swift            # Active + past challenge list
    ├── Claims/
    │   └── ClaimsView.swift                # Reward claims UI
    ├── Create/
    │   └── CreateChallengeView.swift        # Challenge creation wizard
    ├── Detail/
    │   ├── ChallengeDetailView.swift       # Full challenge detail (phases, actions, cards)
    │   ├── ChallengeProgressHero.swift     # Progress ring, phase badge, UserChallengeState
    │   ├── ActivityFigureView.swift        # Activity stat display
    │   ├── ActivitySourceNudgeSheet.swift  # Prompt to connect data source
    │   ├── FitnessProofView.swift          # HealthKit evidence submission UI
    │   ├── GamingHandoffView.swift         # Desktop handoff for gaming challenges
    │   ├── ProgressMetricsView.swift       # Challenge-wide progress stats
    │   └── VictoryCelebrationView.swift    # Victory animation
    ├── Explore/
    │   ├── ExploreView.swift               # Category grid + featured challenges
    │   ├── CategoryDetailView.swift        # Challenges in a single category
    │   └── ChallengeRow.swift              # Challenge list row component
    ├── Leaderboard/
    │   └── LeaderboardView.swift           # Seasonal leaderboard
    ├── Library/
    │   └── ProofSelectionView.swift        # Evidence source picker
    ├── Notifications/
    │   └── NotificationsView.swift         # Notification center
    ├── Onboarding/
    │   ├── OnboardingView.swift            # First-launch onboarding flow
    │   └── SplashPortal.swift              # Splash screen animation
    ├── Profile/
    │   └── ProfileView.swift               # User profile (reputation, stats)
    ├── Settings/
    │   ├── SettingsView.swift              # App settings
    │   ├── AvatarPickerView.swift          # Avatar selection
    │   └── AvatarView.swift                # Avatar display component
    └── Wallet/
        └── WalletSheet.swift               # Wallet connection sheet
```

## Key Concepts

### Authentication

The iOS app cannot reliably perform EIP-191 `personal_sign` on LightChain's custom chain via WalletConnect. Instead, the API uses **tx-receipt verification** as a fallback: after a successful on-chain transaction, the app sends the `txHash` + `subject` (wallet address) to the API, which verifies that `receipt.from` matches the claimed wallet.

### Challenge Phases

`ChallengePhase` is derived from challenge dates and on-chain status:

| Phase | Condition |
|-------|-----------|
| `upcoming` | `startsAt` is in the future |
| `active` | Started but not ended |
| `proofWindow` | Challenge ended, proof deadline not passed |
| `ended` | Proof deadline passed, not yet finalized |
| `finalized` | On-chain status is Finalized or Canceled |

### User Challenge State

`UserChallengeState` is phase-aware:

| State | Meaning |
|-------|---------|
| `notJoined` | Wallet has not joined |
| `active` | Joined, challenge in progress |
| `awaitingProof` | Challenge ended, no evidence yet, proof window open |
| `awaitingVerdict` | Evidence submitted, AI verification in progress |
| `submitted` | Evidence submitted, challenge ended — awaiting finalization |
| `completed` | Verdict passed, challenge finalized |
| `failed` | Verdict failed |
| `ended` | Challenge ended, not joined or no action taken |

### Gaming Challenges

Gaming challenges (Dota 2, CS2, LoL) require desktop for data source linking (Steam, Riot). The iOS app shows a "Desktop Required" handoff card for these — users browse and join on mobile but submit evidence via the web app.

## Privacy

HealthKit access is **read-only**. Data is aggregated to daily totals before transmission. No raw samples, timestamps, or device identifiers are included in evidence payloads.

## Deep Links

The app registers `lightchallenge://` URL scheme:

```
lightchallenge://challenge/{id}?subject={wallet}
```

QR codes on the web app generate these links for mobile handoff.
