// AppState.swift
// Persistent app state: wallet address, server URL, preferences, navigation.

import SwiftUI
import WidgetKit

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
        case challenges = 1
        case achievements = 2
        case profile = 3

        var label: String {
            switch self {
            case .explore: "Explore"
            case .challenges: "Challenges"
            case .achievements: "Achievements"
            case .profile: "Profile"
            }
        }

        var icon: String {
            switch self {
            case .explore: "magnifyingglass"
            case .challenges: "flame.fill"
            case .achievements: "trophy.fill"
            case .profile: "person.circle.fill"
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
        print("[DEEPLINK] url=\(url) scheme=\(url.scheme ?? "nil") host=\(url.host ?? "nil") path=\(url.path)")
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }

        var challengeId: String?
        var subject: String?

        // Custom scheme: lightchallengeapp://challenge/{id}
        // Note: In custom URL schemes, the first segment after :// is the host,
        // e.g. lightchallengeapp://callback → host="callback", path=""
        //      lightchallengeapp://challenge/42 → host="challenge", path="/42"
        if url.scheme == "lightchallengeapp" {
            var parts = [String]()
            if let host = url.host, !host.isEmpty { parts.append(host) }
            parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })

            print("[DEEPLINK] parts=\(parts)")

            // WalletConnect redirect: lightchallengeapp://wc — not a challenge link
            if parts.first == "wc" {
                print("[DEEPLINK] → WalletConnect redirect, skipping")
                return
            }

            // Auth callback: lightchallengeapp://callback?status=ok&provider=strava
            if parts.first == "callback" || parts.first == "auth" {
                print("[DEEPLINK] → handleAuthCallback")
                handleAuthCallback(components)
                return
            }

            // Extract numeric challenge ID from the last path segment
            if let last = parts.last, last.allSatisfy(\.isNumber), !last.isEmpty {
                challengeId = last
            }
        }
        // Universal links: https://uat.lightchallenge.app/challenge/{id}
        //                   https://lightchallenge.app/explore
        //                   https://lightchallenge.app/me/challenges
        else if url.scheme == "https" || url.scheme == "http" {
            let host = url.host ?? ""
            let isOurDomain = host == "uat.lightchallenge.app"
                           || host == "lightchallenge.app"
                           || host == "app.lightchallenge.app"
            guard isOurDomain else { return }

            let pathSegments = url.pathComponents.filter { $0 != "/" }
            print("[DEEPLINK] universal link pathSegments=\(pathSegments)")

            // /challenge/{id}
            if pathSegments.count >= 2, pathSegments[0] == "challenge" {
                let idSegment = pathSegments[1]
                if idSegment.allSatisfy(\.isNumber), !idSegment.isEmpty {
                    challengeId = idSegment
                }
            }
            // /explore — switch to explore tab
            else if pathSegments.first == "explore" {
                selectedTab = .explore
                return
            }
            // /me/challenges — switch to challenges tab
            else if pathSegments.count >= 2, pathSegments[0] == "me", pathSegments[1] == "challenges" {
                selectedTab = .challenges
                return
            }
        }
        // Fallback: legacy /proofs/{id}
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
            // Switch to challenges tab so the navigation push works
            selectedTab = .challenges
        }
    }

    private func handleAuthCallback(_ components: URLComponents) {
        let provider = components.queryItems?.first(where: { $0.name == "provider" })?.value
        let status = components.queryItems?.first(where: { $0.name == "status" })?.value
        print("[AUTH] callback: provider=\(provider ?? "nil") status=\(status ?? "nil")")

        Task {
            await OAuthService.shared.handleOAuthCallback(provider: provider, status: status)
            // Fallback: always refresh if status=ok and we have a wallet.
            // Covers the case where pendingOAuth was lost (app killed by iOS).
            if status == "ok" && hasWallet {
                await OAuthService.shared.refreshLinkedAccounts(baseURL: serverURL, wallet: walletAddress)
            }
        }
    }

    // MARK: - Widget Data (shared via App Group)

    /// Persist the most urgent active challenge to the shared app group for the widget.
    /// Call this after loading challenges from the API.
    func updateWidgetChallenge(challenges: [ChallengeMeta]) {
        let suiteName = "group.io.lightchallenge.app"
        let key = "widget_active_challenge"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }

        // Find the most urgent active challenge (earliest deadline)
        let activeChallenges = challenges.filter { $0.isActive }

        guard let most = pickMostUrgent(activeChallenges) else {
            // No active challenges — clear widget data
            defaults.removeObject(forKey: key)
            reloadWidgetTimelines()
            return
        }

        // Determine phase and phase end timestamp
        let now = Date()
        let phase: String
        let phaseEndTimestamp: Double

        if let endsDate = most.endsDate, endsDate > now {
            phase = "In Progress"
            phaseEndTimestamp = endsDate.timeIntervalSince1970
        } else if let deadline = most.proofDeadlineDate, deadline > now {
            phase = "Proof Window"
            phaseEndTimestamp = deadline.timeIntervalSince1970
        } else {
            phase = "Ended"
            phaseEndTimestamp = now.timeIntervalSince1970
        }

        let widgetData = WidgetChallengePayload(
            challengeId: most.id,
            title: most.displayTitle,
            phase: phase,
            phaseEndTimestamp: phaseEndTimestamp,
            stakeDisplay: most.stakeDisplay,
            updatedAt: now.timeIntervalSince1970
        )

        if let encoded = try? JSONEncoder().encode(widgetData) {
            defaults.set(encoded, forKey: key)
            reloadWidgetTimelines()
        }
    }

    /// Pick the active challenge with the soonest deadline.
    private func pickMostUrgent(_ challenges: [ChallengeMeta]) -> ChallengeMeta? {
        challenges.min { a, b in
            let aEnd = a.endsDate ?? Date.distantFuture
            let bEnd = b.endsDate ?? Date.distantFuture
            return aEnd < bEnd
        }
    }

    /// Tell WidgetKit to refresh all widget timelines.
    private func reloadWidgetTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - Widget Payload (Codable, written by main app)

/// Matches the WidgetChallengeData struct in the widget extension.
/// Duplicated here to avoid cross-target source sharing complexity.
struct WidgetChallengePayload: Codable {
    let challengeId: String
    let title: String
    let phase: String
    let phaseEndTimestamp: Double
    let stakeDisplay: String?
    let updatedAt: Double
}
