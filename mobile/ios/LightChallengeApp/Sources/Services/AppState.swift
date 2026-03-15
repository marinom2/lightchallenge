// AppState.swift
// Persistent app state: wallet address, server URL, preferences, navigation.

import SwiftUI

@MainActor
class AppState: ObservableObject {
    // MARK: - Persisted via UserDefaults

    @AppStorage("wallet_address") var walletAddress: String = ""
    @AppStorage("server_url") var serverURL: String = ServerConfig.defaultBaseURL
    @AppStorage("lookback_days") var lookbackDays: Int = 90
    @AppStorage("has_completed_onboarding") var hasCompletedOnboarding: Bool = false
    @AppStorage("notifications_enabled") var notificationsEnabled: Bool = false
    @AppStorage("health_enabled") var healthEnabled: Bool = false

    // MARK: - Navigation state (transient)

    /// Deep link target: navigate to this challenge on next appearance.
    @Published var deepLinkChallengeId: String?
    @Published var deepLinkToken: String?
    @Published var deepLinkExpires: String?

    /// Active tab selection.
    @Published var selectedTab: Tab = .explore

    enum Tab: Int, CaseIterable {
        case explore = 0
        case activity = 1
        case claims = 2
        case notifications = 3
        case settings = 4

        var label: String {
            switch self {
            case .explore: "Explore"
            case .activity: "Activity"
            case .claims: "Claims"
            case .notifications: "Alerts"
            case .settings: "Settings"
            }
        }

        var icon: String {
            switch self {
            case .explore: "flame.fill"
            case .activity: "list.bullet.rectangle.portrait.fill"
            case .claims: "trophy.fill"
            case .notifications: "bell.fill"
            case .settings: "gearshape.fill"
            }
        }
    }

    // MARK: - Wallet helpers

    var hasWallet: Bool {
        !walletAddress.isEmpty && walletAddress.hasPrefix("0x") && walletAddress.count >= 42
    }

    var truncatedWallet: String {
        guard hasWallet else { return "Not set" }
        let addr = walletAddress
        return "\(addr.prefix(6))...\(addr.suffix(4))"
    }

    // MARK: - Deep link handling

    func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }

        var challengeId: String?
        var subject: String?

        // Custom scheme: lightchallenge://challenge/{id}
        if url.scheme == "lightchallenge" {
            let pathParts = url.pathComponents.filter { $0 != "/" }

            // Auth callback: lightchallenge://auth/callback?provider=strava&status=ok
            if pathParts.first == "auth" {
                handleAuthCallback(components)
                return
            }

            challengeId = pathParts.last
        }
        // Universal link: /proofs/{id}
        else if let path = components.path.split(separator: "/").last {
            challengeId = String(path)
        }

        subject = components.queryItems?.first(where: { $0.name == "subject" })?.value
        let token = components.queryItems?.first(where: { $0.name == "token" })?.value
        let expires = components.queryItems?.first(where: { $0.name == "expires" })?.value

        // Persist wallet if provided
        if let subject, !subject.isEmpty, subject.hasPrefix("0x") {
            walletAddress = subject
        }

        // Set deep link navigation target
        if let cid = challengeId, !cid.isEmpty {
            deepLinkChallengeId = cid
            deepLinkToken = token
            deepLinkExpires = expires
            // Switch to explore tab so the navigation push works
            selectedTab = .explore
        }
    }

    private func handleAuthCallback(_ components: URLComponents) {
        let provider = components.queryItems?.first(where: { $0.name == "provider" })?.value
        let status = components.queryItems?.first(where: { $0.name == "status" })?.value

        if status == "ok", let _ = provider {
            // OAuth completed successfully — refresh linked accounts
            Task {
                await OAuthService.shared.refreshLinkedAccounts(
                    baseURL: serverURL,
                    wallet: walletAddress
                )
            }
        }
    }
}
