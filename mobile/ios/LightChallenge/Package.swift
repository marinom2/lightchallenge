// swift-tools-version: 5.9
// LightChallenge iOS — HealthKit evidence collector
//
// This is a SwiftUI app that reads Apple Health data and submits it
// as evidence to the LightChallenge verification platform.
//
// Build with Xcode 15+ targeting iOS 17+.
// Requires HealthKit entitlement and capability.
//
// To build:
//   1. Open in Xcode
//   2. Enable HealthKit capability in Signing & Capabilities
//   3. Build and run on a physical device (HealthKit requires real hardware)

import PackageDescription

let package = Package(
    name: "LightChallenge",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "LightChallenge", targets: ["LightChallenge"])
    ],
    targets: [
        .target(
            name: "LightChallenge",
            path: "Sources"
        )
    ]
)
