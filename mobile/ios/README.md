# LightChallenge iOS — Apple Health Evidence Collector

Native iOS app that reads step count and distance data from Apple HealthKit and submits it as evidence to the LightChallenge verification platform.

## Why a native app?

Apple Health data is only accessible through the HealthKit framework on iOS. There is no web API, no REST endpoint, no OAuth flow. The only ways to get Apple Health data are:

1. **Native iOS app** (this) — reads HealthKit directly, best UX
2. **Manual ZIP export** — user exports from Health app, uploads via web

This app provides path (1). The web app supports path (2) via the Apple Health adapter.

## Features

- **HealthKit integration**: Reads `HKQuantityTypeIdentifierStepCount` and `HKQuantityTypeIdentifierDistanceWalkingRunning`
- **Deep link support**: `lightchallenge://challenge/{id}?subject={wallet}` — QR code from webapp opens directly to challenge
- **Data preview**: Shows collected step/distance totals before submission
- **API submission**: Sends evidence as JSON to `/api/aivm/intake` (multipart/form-data)
- **Privacy**: Only aggregate daily totals are sent — no raw health samples leave the device

## Setup

### Requirements
- Xcode 15+
- iOS 17+
- Physical device (HealthKit not available in Simulator)

### Build
1. Open `LightChallenge/` in Xcode
2. In Signing & Capabilities, add:
   - **HealthKit** capability (check "Background Delivery" if needed)
   - Configure your Team for signing
3. Build and run on a physical iPhone

### Deep Links
The app registers the `lightchallenge://` URL scheme. The webapp's QR code generates links like:

```
lightchallenge://challenge/42?subject=0xABC123...
```

Scanning this QR code on iPhone opens the app pre-filled with the challenge ID and wallet address.

## Architecture

```
Sources/
├── LightChallengeApp.swift          # App entry point + deep link handler
├── Models/
│   └── Models.swift                 # Data models (DailySteps, DailyDistance, etc.)
├── Services/
│   └── HealthKitService.swift       # HealthKit data collection + API submission
└── Views/
    └── ContentView.swift            # Main UI (auth, preview, submit)
```

## Data Flow

```
iPhone HealthKit → HealthKitService.collectEvidence()
  → DailySteps[] + DailyDistance[]
  → buildEvidencePayload() → JSON records
  → POST /api/aivm/intake (multipart/form-data)
  → Server: evidenceValidator → adapter.ingest() → public.evidence
  → evidenceEvaluator → public.verdicts
```

## Privacy

The app requests **read-only** access to:
- Step Count (`HKQuantityTypeIdentifierStepCount`)
- Walking + Running Distance (`HKQuantityTypeIdentifierDistanceWalkingRunning`)

Data is aggregated to daily totals before transmission. No raw samples, timestamps, or source device identifiers beyond "HealthKit" are included in the evidence payload.
