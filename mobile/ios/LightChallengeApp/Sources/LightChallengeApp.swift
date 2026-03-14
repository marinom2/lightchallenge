// LightChallengeApp.swift
// LightChallenge iOS — HealthKit evidence collector
//
// Handles deep links: lightchallenge://challenge/{id}?subject={wallet}
// and universal links: https://app.lightchallenge.io/proofs/{id}

import SwiftUI

@main
struct LightChallengeApp: App {
    @StateObject private var healthService = HealthKitService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthService)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        // lightchallenge://challenge/42?subject=0xABC...&token=0x...&expires=123456
        // or https://app.lightchallenge.io/proofs/42?subject=0xABC...
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }

        var challengeId: String?
        var subject: String?

        // Custom scheme: lightchallenge://challenge/{id}
        if url.scheme == "lightchallenge" {
            let pathParts = url.pathComponents.filter { $0 != "/" }
            if pathParts.count >= 1 {
                challengeId = pathParts.last
            }
        }
        // Universal link: /proofs/{id}
        else if let path = components.path.split(separator: "/").last {
            challengeId = String(path)
        }

        subject = components.queryItems?.first(where: { $0.name == "subject" })?.value
        let token = components.queryItems?.first(where: { $0.name == "token" })?.value
        let expires = components.queryItems?.first(where: { $0.name == "expires" })?.value

        if let cid = challengeId {
            healthService.pendingChallengeId = cid
            healthService.pendingSubject = subject ?? ""
            healthService.pendingToken = token ?? ""
            healthService.pendingExpires = expires ?? ""
        }
    }
}
