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

struct DailyCyclingDistance: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let distanceMeters: Double
}

struct DailyActiveEnergy: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let kilocalories: Double
}

struct DailyHeartRate: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let avgBpm: Double
    let minBpm: Double
    let maxBpm: Double
}

struct DailyFlightsClimbed: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let flights: Int
}

struct DailySwimmingDistance: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let distanceMeters: Double
}

struct DailyWorkouts: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let count: Int
    let totalMinutes: Double
    let totalDistanceMeters: Double
    let totalCalories: Double
}

struct DailyExerciseTime: Identifiable, Codable {
    var id: String { date }
    let date: String      // "YYYY-MM-DD"
    let minutes: Double
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

/// Server configuration — environment-aware.
struct ServerConfig {
    /// UAT environment (current default for testnet)
    static let uatBaseURL = "https://uat.lightchallenge.app"

    /// Production environment
    static let productionBaseURL = "https://app.lightchallenge.app"

    /// Local dev URL placeholder.
    /// `localhost` won't work from a physical iPhone — it resolves to the phone itself.
    /// Replace YOUR_MAC_IP with your Mac's LAN address (System Settings > Wi-Fi > Details > IP Address).
    /// Example: http://192.168.1.50:3000
    static let devBaseURL = "http://YOUR_MAC_IP:3000"

    /// Default for testnet phase
    static let defaultBaseURL = uatBaseURL

    // Provider-agnostic fitness model hashes
    static let fitnessStepsHash     = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001"
    static let fitnessDistanceHash  = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002"
    static let fitnessCyclingHash   = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003"
    static let fitnessHikingHash    = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004"
    static let fitnessSwimmingHash  = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005"
    static let fitnessStrengthHash  = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006"
    static let fitnessYogaHash      = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60007"
    static let fitnessHiitHash      = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60008"
    static let fitnessCaloriesHash  = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60009"
    static let fitnessRowingHash    = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000a"
    static let fitnessWalkingHash   = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000b"
    static let fitnessExerciseHash  = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000c"

    /// Default model hash for fitness challenges (steps is most common)
    static let defaultFitnessModelHash = fitnessStepsHash
}
