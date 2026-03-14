# LightChallenge iOS — Apple Health Collector

A native iOS app that reads Apple Health data (steps + walking distance) and submits it as challenge evidence to the LightChallenge platform.

## Requirements

- Xcode 15+ (tested with Xcode 16)
- iOS 17+
- Physical iPhone (HealthKit is unavailable on Simulator)
- Apple Developer account with HealthKit capability

## Build & Run

1. Open `LightChallengeApp.xcodeproj` in Xcode
2. Set your **Signing Team** in target → Signing & Capabilities
3. Verify the **HealthKit** capability is enabled
4. Connect your iPhone and select it as the build destination
5. Build and run (Cmd+R)

The app will request HealthKit permission on first launch.

## Deep Links

The app supports two deep link formats:

- **Custom scheme:** `lightchallenge://challenge/{id}?subject={wallet}`
- **Universal link:** `https://app.lightchallenge.io/proofs/{id}?subject={wallet}`

The webapp QR code feature generates these links so users can scan and open directly in the app.

## How It Works

1. User opens app (via QR code or manually)
2. App requests HealthKit read permission (steps + distance)
3. User enters challenge ID and wallet address (or pre-filled from deep link)
4. App reads daily aggregates from HealthKit for the selected period
5. Data is submitted to `POST /api/aivm/intake` as multipart/form-data
6. Server validates, persists evidence, and triggers evaluation pipeline

## API Endpoint

The app submits to the same endpoint as the web upload:

```
POST {baseURL}/api/aivm/intake
Content-Type: multipart/form-data

Fields:
  - modelHash: 0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e
  - challengeId: {number}
  - subject: {wallet address}
  - json: [{provider, user_id, activity_id, type, start_ts, end_ts, ...}]
```

## Configuration

The API base URL defaults to `https://app.lightchallenge.io`. To change it for development, edit `HealthKitService.swift`:

```swift
static let defaultBaseURL = "http://localhost:3000"
```

## Project Structure

```
Sources/
├── LightChallengeApp.swift       # @main entry point + deep link handler
├── Info.plist                    # HealthKit permissions + URL scheme
├── LightChallengeApp.entitlements # HealthKit entitlement
├── Assets.xcassets/              # App icon placeholder
├── Models/
│   └── Models.swift              # DailySteps, DailyDistance, EvidencePayload
├── Services/
│   └── HealthKitService.swift    # HealthKit queries + API submission
└── Views/
    └── ContentView.swift         # SwiftUI UI (auth, preview, submit)
```

## Remaining Setup (User-Specific)

- [ ] Set your Apple Developer Team ID in Signing & Capabilities
- [ ] Add a 1024x1024 app icon to `Assets.xcassets/AppIcon.appiconset/`
- [ ] Configure universal links (apple-app-site-association on your domain)
