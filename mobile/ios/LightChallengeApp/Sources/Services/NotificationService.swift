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

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

            if let items = json?["data"] as? [[String: Any]] {
                notifications = items.compactMap { AppNotification(json: $0) }
            }
            if let unread = json?["unread"] as? Int {
                unreadCount = unread
            }
        } catch {
            // Silently fail
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
}

// MARK: - Notification Model

struct AppNotification: Identifiable {
    let id: String
    let type: String
    let title: String
    let body: String?
    let data: [String: Any]
    var read: Bool
    let createdAt: Date?

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
        self.data = json["data"] as? [String: Any] ?? [:]
        self.read = json["read"] as? Bool ?? false

        if let ts = json["created_at"] as? String {
            self.createdAt = ISO8601DateFormatter().date(from: ts)
        } else {
            self.createdAt = nil
        }
    }

    var icon: String {
        switch type {
        case "match_result": "trophy.fill"
        case "competition_started": "flag.fill"
        case "competition_completed": "checkmark.seal.fill"
        case "registration_confirmed": "person.badge.plus"
        case "achievement_earned": "star.fill"
        default: "bell.fill"
        }
    }
}
