// AutoProofService.swift
// Automatically submits fitness proof during the PROOF SUBMISSION WINDOW
// AND pushes periodic Apple Health progress during ACTIVE challenges.
//
// Lifecycle:
//   1. Join window → user joins (no evidence collection)
//   2. Challenge period (startTs → endTs) → periodic progress sync (Apple Health → server)
//   3. Proof window (after endTs → proofDeadlineTs) → final auto-collect + submit
//
// Active-period progress:
//   - Apple Health data is pushed to /api/aivm/intake every ~15 minutes while the app is open
//   - Server-side providers (Strava/Fitbit/gaming) are synced by progressSyncWorker (no iOS action needed)
//   - Progress is visible via GET /api/challenge/{id}/my-progress
//
// Proof window:
//   - Apple Health: collects HealthKit data for the FULL challenge period → submits to /api/aivm/intake
//   - Strava/Fitbit: triggers server-side collection via /api/challenge/{id}/auto-proof

import Foundation
import SwiftUI

@MainActor
class AutoProofService: ObservableObject {
    static let shared = AutoProofService()

    /// Per-challenge auto-proof status.
    @Published var status: [String: ProofStatus] = [:]

    enum ProofStatus: Equatable {
        case pending           // Queued for auto-submission
        case collectingHealth  // Collecting Apple Health data
        case submitting        // Uploading evidence
        case submitted         // Successfully submitted
        case evaluating        // Evidence under review (server-side)
        case passed            // Verdict: passed
        case failed            // Verdict: failed
        case waitingForWindow  // Challenge period hasn't ended yet
        case syncing           // Active-period progress sync in progress
        case synced            // Active-period progress pushed to server
        case error(String)     // Submission failed

        var label: String {
            switch self {
            case .pending: return "Preparing proof..."
            case .collectingHealth: return "Reading health data..."
            case .submitting: return "Submitting proof..."
            case .submitted: return "Proof submitted"
            case .evaluating: return "Under review"
            case .passed: return "Passed"
            case .failed: return "Failed"
            case .waitingForWindow: return "Waiting for challenge to end"
            case .syncing: return "Syncing progress..."
            case .synced: return "Progress synced"
            case .error(let msg): return "Error: \(msg)"
            }
        }

        var icon: String {
            switch self {
            case .pending, .collectingHealth, .submitting, .syncing: return "arrow.triangle.2.circlepath"
            case .submitted, .evaluating: return "hourglass"
            case .passed: return "checkmark.seal.fill"
            case .failed: return "xmark.seal.fill"
            case .waitingForWindow: return "clock.badge.checkmark"
            case .synced: return "checkmark.icloud"
            case .error: return "exclamationmark.triangle.fill"
            }
        }

        var color: Color {
            switch self {
            case .pending, .collectingHealth, .submitting, .syncing: return LC.accent
            case .submitted, .evaluating: return LC.warning
            case .passed, .synced: return LC.success
            case .failed: return LC.danger
            case .waitingForWindow: return LC.info
            case .error: return LC.danger
            }
        }

        static func == (lhs: ProofStatus, rhs: ProofStatus) -> Bool {
            switch (lhs, rhs) {
            case (.pending, .pending),
                 (.collectingHealth, .collectingHealth),
                 (.submitting, .submitting),
                 (.submitted, .submitted),
                 (.evaluating, .evaluating),
                 (.passed, .passed),
                 (.failed, .failed),
                 (.waitingForWindow, .waitingForWindow),
                 (.syncing, .syncing),
                 (.synced, .synced):
                return true
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    // MARK: - Progress Sync Interval

    /// Minimum interval between active-period progress syncs (15 minutes).
    private static let progressSyncInterval: TimeInterval = 15 * 60
    /// Tracks last sync time per challenge to avoid over-syncing.
    private var lastSyncTime: [String: Date] = [:]

    // MARK: - Period Checks

    /// Returns true if the challenge is currently in the proof submission window:
    /// challenge period has ended AND proof deadline hasn't passed.
    private func isInProofWindow(_ challenge: ChallengeMeta?) -> Bool {
        guard let challenge else { return false }
        let now = Date()

        // Challenge must have ended
        guard let endDate = challenge.endsDate, endDate <= now else { return false }

        // Proof deadline must not have passed (if set)
        if let deadline = challenge.proofDeadlineDate, deadline <= now { return false }

        return true
    }

    /// Returns true if the challenge is currently in the active period:
    /// startTs <= now < endTs
    private func isInActivePeriod(_ challenge: ChallengeMeta?) -> Bool {
        guard let challenge else { return false }
        let now = Date()
        guard let startDate = challenge.startDate, startDate <= now else { return false }
        guard let endDate = challenge.endsDate, now < endDate else { return false }
        return true
    }

    /// Returns the challenge start and end dates for evidence collection.
    private func challengePeriod(_ challenge: ChallengeMeta?) -> (start: Date, end: Date)? {
        guard let challenge else { return nil }
        guard let startDate = challenge.startDate else { return nil }
        guard let endDate = challenge.endsDate else { return nil }
        return (startDate, endDate)
    }

    // MARK: - Active-Period Progress Sync

    /// Push Apple Health progress to the server during active challenges.
    /// Called periodically (every ~15 min) or when the user views an active challenge.
    /// Server-side providers (Strava/Fitbit/gaming) are synced by progressSyncWorker — no iOS action needed.
    func syncActiveProgress(
        challengeId: String,
        challenge: ChallengeMeta?,
        appState: AppState,
        healthService: HealthKitService
    ) {
        guard isInActivePeriod(challenge) else { return }
        guard challenge?.resolvedCategory.isFitness == true || challenge?.resolvedCategory == .unknown else { return }

        // Throttle: don't sync more often than every 15 min per challenge
        if let lastSync = lastSyncTime[challengeId],
           Date().timeIntervalSince(lastSync) < Self.progressSyncInterval {
            return
        }

        // Don't interrupt proof submission or final states
        if let existing = status[challengeId] {
            switch existing {
            case .pending, .collectingHealth, .submitting, .submitted, .evaluating, .passed, .failed:
                return
            case .syncing:
                return
            default:
                break
            }
        }

        status[challengeId] = .syncing
        lastSyncTime[challengeId] = Date()

        Task {
            await pushHealthProgress(
                challengeId: challengeId,
                challenge: challenge,
                appState: appState,
                healthService: healthService
            )
        }
    }

    /// Batch-sync all joined active challenges.
    func syncActiveChallenges(
        challenges: [ChallengeMeta],
        activities: [String: MyChallenge],
        appState: AppState,
        healthService: HealthKitService
    ) {
        guard healthService.isAuthorized else { return }

        for (challengeId, _) in activities {
            let challenge = challenges.first { $0.id == challengeId }
            syncActiveProgress(
                challengeId: challengeId,
                challenge: challenge,
                appState: appState,
                healthService: healthService
            )
        }
    }

    /// Push Apple Health data for the active challenge period (start → now).
    private func pushHealthProgress(
        challengeId: String,
        challenge: ChallengeMeta?,
        appState: AppState,
        healthService: HealthKitService
    ) async {
        let subject = appState.walletAddress
        let baseURL = appState.serverURL
        let modelHash = challenge?.proof?.modelHash ?? challenge?.modelHash ?? ServerConfig.defaultFitnessModelHash

        guard healthService.isAuthorized else {
            status[challengeId] = .waitingForWindow
            return
        }

        // Collect from challenge start to NOW (not end — challenge is still active)
        if let startDate = challenge?.startDate {
            await healthService.collectEvidence(from: startDate, to: Date())
        } else {
            await healthService.collectEvidence(days: 30)
        }

        if healthService.error != nil {
            status[challengeId] = .error("Progress sync failed")
            return
        }

        await healthService.submitEvidence(
            baseURL: baseURL,
            challengeId: challengeId,
            subject: subject,
            modelHash: modelHash
        )

        if healthService.lastSubmission?.ok == true {
            status[challengeId] = .synced
        } else {
            // Don't show error for progress sync — it's non-critical
            status[challengeId] = .waitingForWindow
        }
    }

    // MARK: - Trigger Auto-Proof

    /// Called when user views a challenge that is in the proof window.
    /// Only triggers if the challenge period has ended and deadline hasn't passed.
    func triggerAutoProof(
        challengeId: String,
        challenge: ChallengeMeta?,
        appState: AppState,
        healthService: HealthKitService
    ) {
        // Don't re-trigger if already processing (unless it was an error)
        if let existing = status[challengeId] {
            switch existing {
            case .error: break // Allow retry
            case .waitingForWindow: break // Re-check window
            default: return
            }
        }

        // Check if we're in the proof window
        guard isInProofWindow(challenge) else {
            // If in active period, push Apple Health progress instead
            if isInActivePeriod(challenge) {
                syncActiveProgress(
                    challengeId: challengeId,
                    challenge: challenge,
                    appState: appState,
                    healthService: healthService
                )
            } else if let endDate = challenge?.endsDate, endDate > Date() {
                status[challengeId] = .waitingForWindow
            }
            return
        }

        status[challengeId] = .pending

        Task {
            await autoSubmit(
                challengeId: challengeId,
                challenge: challenge,
                appState: appState,
                healthService: healthService
            )
        }
    }

    /// Check all joined challenges and auto-submit where needed.
    /// Only triggers for challenges in the proof submission window.
    func checkPendingChallenges(
        challenges: [ChallengeMeta],
        activities: [String: MyChallenge],
        appState: AppState,
        healthService: HealthKitService
    ) {
        for (challengeId, activity) in activities {
            // Skip if already has evidence or verdict
            if activity.hasEvidence == true || activity.verdictPass != nil { continue }

            // Skip if already being processed successfully
            if let existing = status[challengeId] {
                switch existing {
                case .error, .waitingForWindow: break // Allow retry/re-check
                default: continue
                }
            }

            // Find the challenge
            let challenge = challenges.first { $0.id == challengeId }
            guard challenge?.resolvedCategory.isFitness == true || challenge?.resolvedCategory == .unknown else { continue }

            // Proof window: trigger full auto-proof
            if isInProofWindow(challenge) {
                triggerAutoProof(
                    challengeId: challengeId,
                    challenge: challenge,
                    appState: appState,
                    healthService: healthService
                )
            } else if isInActivePeriod(challenge) {
                // Active period: push Apple Health progress
                syncActiveProgress(
                    challengeId: challengeId,
                    challenge: challenge,
                    appState: appState,
                    healthService: healthService
                )
            } else if let endDate = challenge?.endsDate, endDate > Date() {
                status[challengeId] = .waitingForWindow
            }
        }
    }

    // MARK: - Auto-Submit Logic

    private func autoSubmit(
        challengeId: String,
        challenge: ChallengeMeta?,
        appState: AppState,
        healthService: HealthKitService
    ) async {
        let subject = appState.walletAddress
        let baseURL = appState.serverURL
        let modelHash = challenge?.proof?.modelHash ?? challenge?.modelHash ?? ServerConfig.defaultFitnessModelHash

        // Strategy 1: Try server-side auto-proof first (Strava/Fitbit)
        // The server enforces proof window and uses challenge dates
        let serverResult = await tryServerAutoProof(challengeId: challengeId, subject: subject, baseURL: baseURL)

        if serverResult == .collected {
            status[challengeId] = .submitted
            return
        }

        // Strategy 2: Apple Health (collect locally for challenge period + upload)
        if appState.healthEnabled || healthService.isAuthorized {
            await submitViaAppleHealth(
                challengeId: challengeId,
                challenge: challenge,
                subject: subject,
                baseURL: baseURL,
                modelHash: modelHash,
                healthService: healthService
            )
            return
        }

        // Strategy 3: Try requesting HealthKit authorization
        status[challengeId] = .collectingHealth
        await healthService.requestAuthorization()

        if healthService.isAuthorized {
            await submitViaAppleHealth(
                challengeId: challengeId,
                challenge: challenge,
                subject: subject,
                baseURL: baseURL,
                modelHash: modelHash,
                healthService: healthService
            )
            return
        }

        // No available platform
        if serverResult == .uploadRequired {
            status[challengeId] = .error("Grant HealthKit access to auto-submit")
        } else {
            status[challengeId] = .error("Connect a fitness platform")
        }
    }

    // MARK: - Server-Side Auto-Proof (Strava/Fitbit)

    private enum ServerAutoProofResult {
        case collected
        case uploadRequired
        case noAccount
        case notInWindow
        case error
    }

    private func tryServerAutoProof(challengeId: String, subject: String, baseURL: String) async -> ServerAutoProofResult {
        guard let url = URL(string: "\(baseURL)/api/challenge/\(challengeId)/auto-proof") else {
            return .error
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let body: [String: String] = ["subject": subject]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return .error }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return .noAccount
            }

            // Server returns 200 even for "not in proof window" — check ok flag
            let ok = json["ok"] as? Bool ?? false
            if !ok {
                let errorMsg = json["error"] as? String ?? ""
                if errorMsg.contains("hasn't ended") { return .notInWindow }
                if errorMsg.contains("deadline has passed") { return .error }
            }

            guard httpResponse.statusCode == 200 else { return .noAccount }

            guard let results = json["results"] as? [[String: Any]] else {
                return .noAccount
            }

            for result in results {
                let resultStatus = result["status"] as? String ?? ""
                if resultStatus == "collected" { return .collected }
                if resultStatus == "already-submitted" { return .collected }
                if resultStatus == "upload-required" { return .uploadRequired }
            }

            return results.isEmpty ? .noAccount : .uploadRequired
        } catch {
            return .error
        }
    }

    // MARK: - Apple Health Submission

    private func submitViaAppleHealth(
        challengeId: String,
        challenge: ChallengeMeta?,
        subject: String,
        baseURL: String,
        modelHash: String,
        healthService: HealthKitService
    ) async {
        status[challengeId] = .collectingHealth

        // Collect health data for exactly the challenge period
        if let period = challengePeriod(challenge) {
            await healthService.collectEvidence(from: period.start, to: period.end)
        } else {
            // Fallback: 90-day lookback if no challenge dates available
            await healthService.collectEvidence(days: 90)
        }

        if healthService.error != nil {
            status[challengeId] = .error("Health data collection failed")
            return
        }

        status[challengeId] = .submitting

        // Submit to backend
        await healthService.submitEvidence(
            baseURL: baseURL,
            challengeId: challengeId,
            subject: subject,
            modelHash: modelHash
        )

        if healthService.lastSubmission?.ok == true {
            status[challengeId] = .submitted
        } else if let err = healthService.error {
            status[challengeId] = .error(err)
        } else {
            status[challengeId] = .error("Submission failed")
        }
    }
}
