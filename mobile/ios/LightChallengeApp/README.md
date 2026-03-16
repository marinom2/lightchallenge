# LightChallenge iOS App

A full-featured native SwiftUI client for creating, joining, and completing fitness challenges on-chain.

## Requirements

- Xcode 15+ (tested with Xcode 16)
- iOS 17+
- Physical iPhone (HealthKit unavailable on Simulator)
- Apple Developer account with HealthKit capability
- WalletConnect-compatible wallet (MetaMask, Rainbow, Trust, etc.)

## Build & Run

1. Generate the Xcode project (if needed): `xcodegen generate` from this directory
2. Open `LightChallengeApp.xcodeproj` in Xcode
3. Set your **Signing Team** in target → Signing & Capabilities
4. Connect your iPhone and select it as the build destination
5. Build and run (Cmd+R)

Or from the command line:

```bash
xcodebuild \
  -project LightChallengeApp.xcodeproj \
  -scheme LightChallengeApp \
  -destination 'generic/platform=iOS' \
  build
```

## Architecture

4-tab SwiftUI app: **Explore** | **Challenges** | **Achievements** | **Profile**

Key services:
- `WalletManager` — Reown AppKit (WalletConnect v2) wallet connection
- `ContractService` — On-chain create/join/claim via ChallengePay
- `HealthKitService` — Apple Health data collection (7 metrics, date-range scoped)
- `AutoProofService` — Automatic evidence submission during proof window
- `OAuthService` — Strava/Fitbit/Garmin OAuth linking

## Deep Links

- **Custom scheme:** `lightchallengeapp://challenge/{id}?subject={wallet}&token={token}&expires={expiry}`
- **OAuth callback:** `lightchallengeapp://auth/callback?provider={strava|fitbit}&status=ok`
- **Universal link:** `https://uat.lightchallenge.app/challenge/{id}?subject={wallet}`

## Server URL

The API base URL defaults to `https://uat.lightchallenge.app`. Change at runtime in **Profile → Settings**, or edit `Sources/Models/Models.swift`:

| Environment | URL |
|-------------|-----|
| UAT (default) | `https://uat.lightchallenge.app` |
| Production | `https://lightchallenge.app` |
| Local dev | `http://{YOUR_MAC_IP}:3000` |

## Documentation

Full documentation: [uat.docs.lightchallenge.app/ios](https://uat.docs.lightchallenge.app/ios)
