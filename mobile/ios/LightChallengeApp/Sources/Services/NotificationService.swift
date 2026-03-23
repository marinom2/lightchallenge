// NotificationService.swift
// APNS registration and notification management.
// Read/unread state persisted locally via UserDefaults (survives app restarts).

import Foundation
import SwiftUI
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

    /// Pending push notification tap payload, set by NotificationDelegate, consumed by app struct.
    @Published var pendingPushTap: PushTapPayload?

    /// Persistent set of notification IDs the user has read.
    /// Stored in UserDefaults — survives app restarts, independent of server sync.
    private var readIDs: Set<String> {
        didSet { persistReadIDs() }
    }

    private static let readIDsKey = "lc_activity_read_ids"

    private init() {
        // Restore persisted read IDs
        let stored = UserDefaults.standard.stringArray(forKey: Self.readIDsKey) ?? []
        self.readIDs = Set(stored)
    }

    private func persistReadIDs() {
        // Cap at 500 most recent to prevent unbounded growth
        let capped = readIDs.count > 500
            ? Set(readIDs.suffix(500))
            : readIDs
        UserDefaults.standard.set(Array(capped), forKey: Self.readIDsKey)
    }

    /// Recompute unread count from current notifications + persisted read IDs.
    private func recomputeUnreadCount() {
        unreadCount = notifications.filter { !$0.read }.count
    }

    /// Apply persisted read IDs to a notification array (mutating).
    private func applyReadState(_ items: inout [AppNotification]) {
        for i in items.indices {
            if readIDs.contains(items[i].id) {
                items[i].read = true
            }
        }
    }

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
        Task { await registerTokenWithBackend(token) }
    }

    private func registerTokenWithBackend(_ token: String) async {
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
            if var cached, !cached.isEmpty {
                applyReadState(&cached)
                notifications = cached
                recomputeUnreadCount()
            }
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

            if let items = json?["data"] as? [[String: Any]] {
                var fresh = items.compactMap { AppNotification(json: $0) }
                // Merge: apply locally persisted read state on top of server data
                applyReadState(&fresh)
                notifications = fresh
                recomputeUnreadCount()
                await CacheService.shared.cacheNotifications(notifications, wallet: wallet)
            }
        } catch {
            // Silently fail — cached data shown above
        }
    }

    // MARK: - Mark All Read

    func markAllRead(baseURL: String, wallet: String) async {
        // Persist all current IDs as read
        for n in notifications {
            readIDs.insert(n.id)
        }
        for i in notifications.indices {
            notifications[i].read = true
        }
        unreadCount = 0
        await CacheService.shared.cacheNotifications(notifications, wallet: wallet)

        // Fire-and-forget to server
        guard let url = URL(string: "\(baseURL)/api/v1/notifications/read-all") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["wallet": wallet])
        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: - Mark Single Read

    func markRead(id: String, baseURL: String, wallet: String) async {
        // Persist this ID as read
        readIDs.insert(id)

        // Optimistic local update
        if let idx = notifications.firstIndex(where: { $0.id == id && !$0.read }) {
            notifications[idx].read = true
            recomputeUnreadCount()
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

    // MARK: - Mark Read by Challenge ID (for push tap routing)

    func markReadByChallengeId(_ challengeId: String, baseURL: String, wallet: String) async {
        let matching = notifications.filter { $0.challengeId == challengeId && !$0.read }
        for n in matching {
            readIDs.insert(n.id)
        }
        for i in notifications.indices {
            if notifications[i].challengeId == challengeId {
                notifications[i].read = true
            }
        }
        recomputeUnreadCount()
        await CacheService.shared.cacheNotifications(notifications, wallet: wallet)
    }

    // MARK: - Local Notifications

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

    func scheduleProofWindowReminder(challengeId: String, title: String, endDate: Date) {
        guard endDate > Date() else { return }

        let identifier = "proof-window-\(challengeId)"
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])

        let content = UNMutableNotificationContent()
        content.title = "Challenge ended"
        content.body = "Your challenge '\(title)' has ended — results are being processed."
        content.sound = .default
        content.userInfo = [
            "challengeId": challengeId,
            "type": "proof_window_open",
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

        // Goal reached
        if progress >= 1.0 {
            scheduleAlertOnce(
                id: "goal-reached-\(challengeId)",
                title: "Goal reached!",
                body: "You hit your target for \"\(title)\". Your activity will be verified automatically.",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_goal_reached"
            )
            return
        }

        let remainingText = Self.formatRemaining(remaining)

        if remaining <= 6 * 3600 {
            scheduleAlertOnce(
                id: "final-6h-\(challengeId)",
                title: "Final hours — \(title)",
                body: "Only \(remainingText) left at \(pct)% of \(metricLabel). Give it one last push!",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_final_push"
            )
        } else if remaining <= 24 * 3600 {
            scheduleAlertOnce(
                id: "final-24h-\(challengeId)",
                title: "Last day — \(title)",
                body: "\(remainingText) remaining with \(pct)% progress on \(metricLabel). Finish strong!",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_final_push"
            )
        }

        if timeFraction >= 0.9 && progress < 0.75 {
            scheduleAlertOnce(
                id: "behind-90-\(challengeId)",
                title: "Almost over — \(title)",
                body: "90% done but only \(pct)% progress. \(remainingText) left for \(metricLabel).",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_behind_pace"
            )
        } else if timeFraction >= 0.75 && progress < 0.50 {
            scheduleAlertOnce(
                id: "behind-75-\(challengeId)",
                title: "Falling behind — \(title)",
                body: "Three-quarters through with only \(pct)% progress. Pick up the pace — \(remainingText) left!",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_behind_pace"
            )
        } else if timeFraction >= 0.50 && progress < 0.25 {
            scheduleAlertOnce(
                id: "behind-50-\(challengeId)",
                title: "Halfway check — \(title)",
                body: "You're halfway through but only at \(pct)% of \(metricLabel). \(remainingText) to go.",
                delay: 1,
                challengeId: challengeId,
                type: "challenge_behind_pace"
            )
        }

        if timeFraction < 0.50 {
            let timeUntil50Pct = (0.50 * totalDuration) - elapsed
            if timeUntil50Pct > 60 {
                scheduleAlertOnce(
                    id: "reminder-50-\(challengeId)",
                    title: "Halfway mark — \(title)",
                    body: "You're halfway through \"\(title)\". Check your progress!",
                    delay: timeUntil50Pct,
                    challengeId: challengeId,
                    type: "challenge_behind_pace"
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
                    challengeId: challengeId,
                    type: "challenge_behind_pace"
                )
            }
        }
    }

    private func scheduleAlertOnce(id: String, title: String, body: String, delay: TimeInterval, challengeId: String, type: String) {
        let center = UNUserNotificationCenter.current()

        center.getPendingNotificationRequests { existing in
            let alreadyScheduled = existing.contains { $0.identifier == id }
            if alreadyScheduled { return }

            center.getDeliveredNotifications { delivered in
                let alreadyDelivered = delivered.contains { $0.request.identifier == id }
                if alreadyDelivered { return }

                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                content.userInfo = [
                    "challengeId": challengeId,
                    "type": type,
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

struct AppNotification: Identifiable, Codable, Equatable {
    static func == (lhs: AppNotification, rhs: AppNotification) -> Bool {
        lhs.id == rhs.id
    }

    let id: String
    let type: String
    let title: String
    let body: String?
    let dataDict: [String: String]  // Flattened string dict for Codable
    var read: Bool
    let createdAt: Date?

    /// Access data as [String: Any] for backward compatibility.
    var data: [String: Any] { dataDict as [String: Any] }

    /// Extract challengeId from data dict.
    var challengeId: String? {
        dataDict["challengeId"] ?? dataDict["challenge_id"]
    }

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

    // MARK: - Interaction Model

    /// Whether tapping this item should navigate directly (action) or show detail sheet (informational).
    var isActionEvent: Bool {
        switch type {
        case "challenge_starting", "challenge_joined", "competition_started",
             "claim_available", "claim_reminder",
             "challenge_final_push", "challenge_behind_pace",
             "proof_window_open", "match_upcoming":
            return true
        default:
            return false
        }
    }

    // MARK: - Human-Readable Display

    /// Clean, outcome-focused title. No technical jargon.
    var displayTitle: String {
        switch type {
        case "challenge_goal_reached": return "Goal reached"
        case "challenge_finalized": return "Challenge result ready"
        case "proof_submitted": return "Activity verified"
        case "competition_completed": return "Challenge completed"
        case "challenge_starting": return "Challenge starting soon"
        case "challenge_joined": return "You're in"
        case "claim_available": return "Reward ready"
        case "claim_reminder": return "Don't forget your reward"
        case "challenge_behind_pace": return "You're falling behind"
        case "challenge_final_push": return "Last chance"
        case "proof_window_open": return "Challenge ended"
        case "match_result": return "Match result"
        case "match_upcoming": return "Match coming up"
        case "registration_confirmed": return "You're registered"
        case "achievement_earned": return "Achievement unlocked"
        case "dispute_filed": return "Dispute opened"
        case "dispute_resolved": return "Dispute resolved"
        case "funds_received": return "Funds received"
        case "refund_received": return "Refund received"
        default: return title
        }
    }

    /// Human-readable body text. Falls back to server body if no override.
    var displayBody: String? {
        switch type {
        case "challenge_goal_reached":
            return body ?? "You completed the challenge. Your activity will be verified automatically."
        case "challenge_finalized":
            return body ?? "The results have been finalized. Check your outcome."
        case "proof_submitted":
            return body ?? "Your activity has been verified successfully."
        case "competition_completed":
            return body ?? "This challenge is now complete. See the final results."
        case "challenge_starting":
            return body ?? "Get ready — your challenge is about to begin."
        case "challenge_joined":
            return body ?? "You've joined the challenge. Good luck!"
        case "claim_available":
            return body ?? "Your reward is ready to claim."
        case "claim_reminder":
            return body ?? "You have an unclaimed reward waiting for you."
        case "challenge_behind_pace":
            return body ?? "You're behind your target. Pick up the pace!"
        case "challenge_final_push":
            return body ?? "Time is almost up. Give it everything you've got."
        case "proof_window_open":
            return body ?? "The challenge has ended. Results are being processed."
        case "funds_received":
            return body ?? "Your challenge payout has been sent to your wallet."
        case "refund_received":
            return body ?? "Your stake has been refunded to your wallet."
        default:
            return body
        }
    }

    /// Human-readable state label for the detail sheet.
    var stateLabel: String? {
        switch type {
        case "challenge_goal_reached": return "Awaiting verification"
        case "challenge_finalized": return "Result finalized"
        case "proof_submitted": return "Verified"
        case "competition_completed": return "Completed"
        case "claim_available", "claim_reminder": return "Ready to claim"
        case "challenge_behind_pace": return "In progress"
        case "challenge_final_push": return "Ending soon"
        case "challenge_starting": return "Starting soon"
        case "challenge_joined": return "Joined"
        case "proof_window_open": return "Processing results"
        case "funds_received": return "Funds sent"
        case "refund_received": return "Refunded"
        default: return nil
        }
    }

    /// State chip color for the detail sheet.
    var stateColor: Color {
        switch type {
        case "challenge_goal_reached", "proof_submitted", "competition_completed":
            return LC.success
        case "claim_available", "claim_reminder":
            return LC.accent
        case "challenge_behind_pace", "challenge_final_push":
            return LC.warning
        case "challenge_finalized", "proof_window_open":
            return LC.info
        case "challenge_joined", "challenge_starting":
            return LC.accent
        default:
            return Color(.secondaryLabel)
        }
    }

    // MARK: - Semantic Icon System

    /// Structured icon: SF Symbol name + semantic color.
    struct IconStyle {
        let name: String
        let color: Color
    }

    /// Semantic icon matched to event meaning.
    var iconStyle: IconStyle {
        switch type {
        // Success / Goal
        case "challenge_goal_reached":
            return IconStyle(name: "checkmark.circle.fill", color: LC.success)
        case "proof_submitted":
            return IconStyle(name: "checkmark.shield.fill", color: LC.success)
        case "competition_completed":
            return IconStyle(name: "checkmark.seal.fill", color: LC.success)

        // Failure / Warning
        case "challenge_behind_pace":
            return IconStyle(name: "exclamationmark.triangle.fill", color: LC.warning)
        case "challenge_final_push":
            return IconStyle(name: "flame.fill", color: Color(hex: 0xF97316))

        // Time / Progress
        case "challenge_starting":
            return IconStyle(name: "play.circle.fill", color: LC.accent)
        case "proof_window_open":
            return IconStyle(name: "hourglass", color: LC.info)
        case "challenge_finalized":
            return IconStyle(name: "flag.checkered.2.crossed", color: LC.info)

        // Reward
        case "claim_available":
            return IconStyle(name: "gift.fill", color: LC.accent)
        case "claim_reminder":
            return IconStyle(name: "gift.fill", color: LC.warning)

        // Participation
        case "challenge_joined":
            return IconStyle(name: "person.fill.checkmark", color: LC.accent)
        case "registration_confirmed":
            return IconStyle(name: "person.fill.checkmark", color: LC.accent)

        // Competition
        case "match_result":
            return IconStyle(name: "trophy.fill", color: Color(hex: 0xF59E0B))
        case "match_upcoming":
            return IconStyle(name: "calendar.badge.clock", color: LC.info)
        case "competition_started":
            return IconStyle(name: "play.circle.fill", color: LC.accent)

        // Achievement
        case "achievement_earned":
            return IconStyle(name: "star.fill", color: Color(hex: 0xF59E0B))

        // Dispute
        case "dispute_filed":
            return IconStyle(name: "exclamationmark.bubble.fill", color: LC.danger)
        case "dispute_resolved":
            return IconStyle(name: "checkmark.bubble.fill", color: LC.success)

        default:
            return IconStyle(name: "bell.fill", color: Color(.secondaryLabel))
        }
    }

    /// Legacy icon name (kept for compatibility).
    var icon: String { iconStyle.name }
}
