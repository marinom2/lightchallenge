// Models.swift
// Data models for the LightChallenge iOS evidence collector.

import Foundation

struct DailySteps: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let steps: Int
}

struct DailyDistance: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let distanceMeters: Double
}

struct EvidencePayload {
    let records: [[String: Any]]
    let evidenceHash: String
}

struct SubmissionResult {
    let ok: Bool
    let evidenceId: String?
    let recordCount: Int
    let dataHash: String
}

/// Server configuration — defaults to production for release.
struct ServerConfig {
    static let defaultBaseURL = "https://app.lightchallenge.io"

    /// Local dev URL placeholder.
    /// `localhost` won't work from a physical iPhone — it resolves to the phone itself.
    /// Replace YOUR_MAC_IP with your Mac's LAN address (System Settings > Wi-Fi > Details > IP Address).
    /// Example: http://192.168.1.50:3000
    static let devBaseURL = "http://YOUR_MAC_IP:3000"

    /// Apple Health steps model hash (matches models.json)
    static let appleStepsModelHash = "0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e"
}
