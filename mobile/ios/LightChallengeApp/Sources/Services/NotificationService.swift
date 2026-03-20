// NotificationService.swift
// APNS registration and notification management.

import Foundation
import UserNotifications
import UIKit

@MainActor
class NotificationService: ObservableObject {
    static let shared = NotificationService()

    @Published var isAuthorized = false
    @Published var deviceToken: String?
    @Published var notifications: [AppNotification] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false

    // MARK: - Permission

    func requestPermission() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            if granted {
                await registerForRemoteNotifications()
            }
        } catch {
            isAuthorized = false
        }
    }

    func checkPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    private func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: - Device Token

    func setDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        deviceToken = token
        // Send to backend for push delivery
        Task { await registerTokenWithBackend(token) }
    }

    private func registerTokenWithBackend(_ token: String) async {
        // Backend endpoint for device token registration
        // This would need a new API endpoint: POST /api/v1/devices
        // For now, store locally — the backend notification system
        // uses polling, not push delivery yet.
        UserDefaults.standard.set(token, forKey: "apns_device_token")
    }

    // MARK: - Fetch Notifications

    func fetchNotifications(baseURL: String, wallet: String) async {
        guard let url = URL(string: "\(baseURL)/api/v1/notifications?wallet=\(wallet)&limit=50") else {
            return
        }

        isLoading = true
        defer { isLoading = false }

        // Load from local cache first if empty
        if notifications.isEmpty {
            let cached = await CacheService.shared.loadCachedNotifications(wallet: wallet)
            if let cached, !cached.isEmpty {
                notifications = cached
                unreadCount = cached.filter { !$0.read }.count
            }
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

            if let items = json?["data"] as? [[String: Any]] {
                notifications = items.compactMap { AppNotification(json: $0) }
                await CacheService.shared.cacheNotifications(notifications, wallet: wallet)
            }
            if let unread = json?["unread"] as? Int {
                unreadCount = unread
            }
        } catch {
            // Silently fail — cached data shown above
        }
    }

    // MARK: - Mark Read

    func markAllRead(baseURL: String, wallet: String) async {
        guard let url = URL(string: "\(baseURL)/api/v1/notifications/read-all") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["wallet": wallet])

        _ = try? await URLSession.shared.data(for: request)
        unreadCount = 0
        for i in notifications.indices {
            notifications[i].read = true
        }
        await CacheService.shared.cacheNotifications(notifications, wallet: wallet)
    }

    // MARK: - Mark Single Read

    func markRead(id: String, baseURL: String, wallet: String) async {
        // Optimistic local update
        if let idx = notifications.firstIndex(where: { $0.id == id && !$0.read }) {
            notifications[idx].read = true
            unreadCount = max(0, unreadCount - 1)
            await CacheService.shared.cacheNotifications(notifications, wallet: wallet)
        }

        // Fire-and-forget to server
        guard let url = URL(string: "\(baseURL)/api/v1/notifications/\(id)/read") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["wallet": wallet])
        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: - Local Notifications

    /// Schedule a local notification (e.g., challenge deadline reminder).
    func scheduleLocalReminder(title: String, body: String, date: Date, identifier: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, date.timeIntervalSinceNow),
            repeats: false
        )

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Proof Window Reminder

    /// Schedule a local notification when a challenge ends (proof window opens).
    /// This is informational only — server-side evidence collection handles auto-proof independently.
    /// When tapped, the notification deep links to the challenge detail.
    func scheduleProofWindowReminder(challengeId: String, title: String, endDate: Date) {
        // Only schedule if the end date is in the future
        guard endDate > Date() else { return }

        let identifier = "proof-window-\(challengeId)"

        // Remove any existing notification for this challenge to avoid duplicates
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])

        let content = UNMutableNotificationContent()
        content.title = "Proof Window Open"
        content.body = "Your challenge '\(title)' has ended — proof submission is now open!"
        content.sound = .default

        // Deep link to challenge detail when tapped
        content.userInfo = [
            "challengeId": challengeId,
            "deepLink": "lightchallengeapp://challenge/\(challengeId)"
        ]

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, endDate.timeIntervalSinceNow),
            repeats: false
        )

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Smart Challenge Alerts

    /// Evaluate a challenge's progress and schedule local "at risk" notifications.
    /// Called during foreground progress checks and background task execution.
    ///
    /// Tiers:
    ///   - 50% time elapsed, <25% progress → gentle nudge
    ///   - 75% time elapsed, <50% progress → warning
    ///   - 90% time elapsed, <75% progress → urgent
    ///   - ≤24h remaining, <100% progress → final push
    ///   - ≤6h remaining, <100% progress → last chance
    ///   - Goal reached → celebration
    func evaluateAndScheduleAlerts(
        challengeId: String,
        title: String,
        startDate: Date,
        endDate: Date,
        currentValue: Double,
        goalValue: Double,
        metricLabel: String
    ) {
        guard endDate > Date(), startDate < Date(), goalValue > 0 else { return }

        let now = Date()
        let totalDuration = endDate.timeIntervalSince(startDate)
        let elapsed = now.timeIntervalSince(startDate)
        let timeFraction = min(1.0, elapsed / totalDuration)
        let remaining = endDate.timeIntervalSince(now)
        let progress = min(1.0, currentValue / goalValue)
        let pct = Int(progress * 100)

        // Goal reached — schedule immediate celebration (if not already sent)
        if progress >= 1.0 {
            scheduleAlertOnce(
                id: "goal-reached-\(challengeId)",
                title: "Target reached!",
                body: "You hit your goal for \"\(title)\". Your proof will be submitted automatically.",
                delay: 1,
                challengeId: challengeId
            )
            return
        }

        let remainingText = Self.formatRemaining(remaining)

        // Final push: ≤6h
        if remaining <= 6 * 3600 {
            scheduleAlertOnce(
                id: "final-6h-\(challengeId)",
                title: "Final hours — \(title)",
                body: "Only \(remainingText) left at \(pct)% of \(metricLabel). Give it one last push!",
                delay: 1,
                challengeId: challengeId
            )
        }
        // Final push: ≤24h
        else if remaining <= 24 * 3600 {
            scheduleAlertOnce(
                id: "final-24h-\(challengeId)",
                title: "Last day — \(title)",
                body: "\(remainingText) remaining with \(pct)% progress on \(metricLabel). Finish strong!",
                delay: 1,
                challengeId: challengeId
            )
        }

        // Behind pace: 90%+ time, <75% progress
        if timeFraction >= 0.9 && progress < 0.75 {
            scheduleAlertOnce(
                id: "behind-90-\(challengeId)",
                title: "Almost over — \(title)",
                body: "90% done but only \(pct)% progress. \(remainingText) left for \(metricLabel).",
                delay: 1,
                challengeId: challengeId
            )
        }
        // Behind pace: 75%+ time, <50% progress
        else if timeFraction >= 0.75 && progress < 0.50 {
            scheduleAlertOnce(
                id: "behind-75-\(challengeId)",
                title: "Falling behind — \(title)",
                body: "Three-quarters through with only \(pct)% progress. Pick up the pace — \(remainingText) left!",
                delay: 1,
                challengeId: challengeId
            )
        }
        // Behind pace: 50%+ time, <25% progress
        else if timeFraction >= 0.50 && progress < 0.25 {
            scheduleAlertOnce(
                id: "behind-50-\(challengeId)",
                title: "Halfway check — \(title)",
                body: "You're halfway through but only at \(pct)% of \(metricLabel). \(remainingText) to go.",
                delay: 1,
                challengeId: challengeId
            )
        }

        // Also schedule a future notification for the next milestone if not yet triggered.
        // Example: if we're at 40% time, schedule one for when we'll be at 50%.
        if timeFraction < 0.50 {
            let timeUntil50Pct = (0.50 * totalDuration) - elapsed
            if timeUntil50Pct > 60 { // Only if >1 min away
                scheduleAlertOnce(
                    id: "reminder-50-\(challengeId)",
                    title: "Halfway mark — \(title)",
                    body: "You're halfway through \"\(title)\". Check your progress!",
                    delay: timeUntil50Pct,
                    challengeId: challengeId
                )
            }
        } else if timeFraction < 0.75 {
            let timeUntil75Pct = (0.75 * totalDuration) - elapsed
            if timeUntil75Pct > 60 {
                scheduleAlertOnce(
                    id: "reminder-75-\(challengeId)",
                    title: "75% mark — \(title)",
                    body: "Three-quarters of \"\(title)\" is done. How's your progress?",
                    delay: timeUntil75Pct,
                    challengeId: challengeId
                )
            }
        }
    }

    /// Schedule a local notification only if one with the same identifier doesn't already exist.
    private func scheduleAlertOnce(id: String, title: String, body: String, delay: TimeInterval, challengeId: String) {
        let center = UNUserNotificationCenter.current()

        center.getPendingNotificationRequests { existing in
            let alreadyScheduled = existing.contains { $0.identifier == id }
            if alreadyScheduled { return }

            // Also check delivered notifications to avoid re-firing
            center.getDeliveredNotifications { delivered in
                let alreadyDelivered = delivered.contains { $0.request.identifier == id }
                if alreadyDelivered { return }

                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                content.userInfo = [
                    "challengeId": challengeId,
                    "deepLink": "lightchallengeapp://challenge/\(challengeId)"
                ]

                let trigger = UNTimeIntervalNotificationTrigger(
                    timeInterval: max(1, delay),
                    repeats: false
                )

                let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
                center.add(request)
            }
        }
    }

    private static func formatRemaining(_ seconds: TimeInterval) -> String {
        if seconds <= 0 { return "ended" }
        let h = Int(seconds / 3600)
        let d = h / 24
        if d >= 2 { return "\(d) days" }
        if h >= 1 { return "\(h)h" }
        let m = Int(ceil(seconds / 60))
        return "\(m)m"
    }
}

// MARK: - Notification Model

struct AppNotification: Identifiable, Codable {
    let id: String
    let type: String
    let title: String
    let body: String?
    let dataDict: [String: String]  // Flattened string dict for Codable
    var read: Bool
    let createdAt: Date?

    /// Access data as [String: Any] for backward compatibility.
    var data: [String: Any] { dataDict as [String: Any] }

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String,
              let type = json["type"] as? String,
              let title = json["title"] as? String else {
            return nil
        }
        self.id = id
        self.type = type
        self.title = title
        self.body = json["body"] as? String
        self.read = json["read"] as? Bool ?? false

        // Flatten data dict to [String: String] for persistence
        var flat: [String: String] = [:]
        if let raw = json["data"] as? [String: Any] {
            for (k, v) in raw {
                flat[k] = "\(v)"
            }
        }
        self.dataDict = flat

        if let ts = json["created_at"] as? String {
            self.createdAt = ISO8601DateFormatter().date(from: ts)
        } else {
            self.createdAt = nil
        }
    }

    var icon: String {
        switch type {
        // Competition / match
        case "match_result": "trophy.fill"
        case "match_upcoming": "calendar.badge.clock"
        case "competition_started": "flag.fill"
        case "competition_completed": "checkmark.seal.fill"
        case "registration_confirmed": "person.badge.plus"
        case "achievement_earned": "star.fill"
        // Progress alerts
        case "challenge_behind_pace": "exclamationmark.triangle.fill"
        case "challenge_final_push": "flame.fill"
        case "challenge_goal_reached": "checkmark.circle.fill"
        // Lifecycle events
        case "challenge_finalized": "flag.checkered"
        case "claim_available": "banknote.fill"
        case "claim_reminder": "bell.badge.fill"
        case "challenge_joined": "person.badge.plus"
        case "proof_submitted": "arrow.up.doc.fill"
        case "challenge_starting": "play.circle.fill"
        case "proof_window_open": "clock.badge.exclamationmark.fill"
        // Disputes
        case "dispute_filed": "exclamationmark.bubble.fill"
        case "dispute_resolved": "checkmark.bubble.fill"
        default: "bell.fill"
        }
    }
}
