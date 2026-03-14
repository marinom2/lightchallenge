// HealthKitService.swift
// Core HealthKit data collection service.
//
// Reads step count and walking/running distance from HealthKit,
// packages the data as JSON evidence, and submits to the LightChallenge API.

import Foundation
import HealthKit
import CryptoKit

@MainActor
class HealthKitService: ObservableObject {
    private let healthStore = HKHealthStore()

    // Deep link state
    @Published var pendingChallengeId: String = ""
    @Published var pendingSubject: String = ""
    @Published var pendingToken: String = ""    // evidence token (signed in webapp)
    @Published var pendingExpires: String = ""  // token expiry (Unix ms)

    // UI state
    @Published var isAuthorized = false
    @Published var isLoading = false
    @Published var error: String?
    @Published var lastSubmission: SubmissionResult?

    // Collected data preview
    @Published var stepDays: [DailySteps] = []
    @Published var distanceDays: [DailyDistance] = []

    // MARK: - Authorization

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            error = "Health data not available on this device."
            return
        }

        let stepType = HKQuantityType(.stepCount)
        let distanceType = HKQuantityType(.distanceWalkingRunning)

        let readTypes: Set<HKSampleType> = [stepType, distanceType]

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
            error = nil
        } catch {
            self.error = "HealthKit authorization failed: \(error.localizedDescription)"
            isAuthorized = false
        }
    }

    // MARK: - Data Collection

    /// Collect step counts and distance for a date range.
    /// Default: last 90 days.
    func collectEvidence(days: Int = 90) async {
        guard isAuthorized else {
            error = "HealthKit not authorized. Please grant access first."
            return
        }

        isLoading = true
        error = nil

        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: endDate) else {
            error = "Invalid date range."
            isLoading = false
            return
        }

        async let steps = fetchDailySteps(from: startDate, to: endDate)
        async let distances = fetchDailyDistance(from: startDate, to: endDate)

        do {
            let (s, d) = try await (steps, distances)
            stepDays = s
            distanceDays = d
            isLoading = false
        } catch {
            self.error = "Failed to read HealthKit data: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private func fetchDailySteps(from start: Date, to end: Date) async throws -> [DailySteps] {
        let stepType = HKQuantityType(.stepCount)
        let interval = DateComponents(day: 1)
        let anchor = Calendar.current.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: stepType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum,
                anchorDate: anchor,
                intervalComponents: interval
            )

            query.initialResultsHandler = { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                var days: [DailySteps] = []
                results?.enumerateStatistics(from: start, to: end) { stats, _ in
                    let count = stats.sumQuantity()?.doubleValue(for: .count()) ?? 0
                    let dateStr = ISO8601DateFormatter().string(from: stats.startDate).prefix(10)
                    days.append(DailySteps(date: String(dateStr), steps: Int(count)))
                }
                continuation.resume(returning: days)
            }

            healthStore.execute(query)
        }
    }

    private func fetchDailyDistance(from start: Date, to end: Date) async throws -> [DailyDistance] {
        let distanceType = HKQuantityType(.distanceWalkingRunning)
        let interval = DateComponents(day: 1)
        let anchor = Calendar.current.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: distanceType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum,
                anchorDate: anchor,
                intervalComponents: interval
            )

            query.initialResultsHandler = { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                var days: [DailyDistance] = []
                results?.enumerateStatistics(from: start, to: end) { stats, _ in
                    let meters = stats.sumQuantity()?.doubleValue(for: .meter()) ?? 0
                    let dateStr = ISO8601DateFormatter().string(from: stats.startDate).prefix(10)
                    days.append(DailyDistance(date: String(dateStr), distanceMeters: meters))
                }
                continuation.resume(returning: days)
            }

            healthStore.execute(query)
        }
    }

    // MARK: - Evidence Payload

    /// Build the evidence payload matching the Apple Health adapter's expected format.
    func buildEvidencePayload(subject: String) -> EvidencePayload {
        var records: [[String: Any]] = []

        for day in stepDays where day.steps > 0 {
            let startTs = ISO8601DateFormatter().date(from: "\(day.date)T00:00:00Z")?.timeIntervalSince1970 ?? 0
            let endTs = startTs + 86399

            records.append([
                "provider": "apple_health",
                "user_id": sha256Hex(subject),
                "activity_id": "hk_steps:\(day.date)",
                "type": "steps",
                "start_ts": Int(startTs),
                "end_ts": Int(endTs),
                "duration_s": 86400,
                "steps": day.steps,
                "source_device": "HealthKit",
            ])
        }

        for day in distanceDays where day.distanceMeters > 0 {
            let startTs = ISO8601DateFormatter().date(from: "\(day.date)T00:00:00Z")?.timeIntervalSince1970 ?? 0
            let endTs = startTs + 86399

            records.append([
                "provider": "apple_health",
                "user_id": sha256Hex(subject),
                "activity_id": "hk_dist:\(day.date)",
                "type": "distance",
                "start_ts": Int(startTs),
                "end_ts": Int(endTs),
                "duration_s": 86400,
                "distance_m": day.distanceMeters,
                "source_device": "HealthKit",
            ])
        }

        let jsonData = try? JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
        let hash = sha256Hex(String(data: jsonData ?? Data(), encoding: .utf8) ?? "")

        return EvidencePayload(records: records, evidenceHash: hash)
    }

    // MARK: - Submission

    /// Submit evidence to the LightChallenge API.
    /// If an evidence token was received via deep link, it is included in the
    /// request to authenticate the submission without a private key on the device.
    func submitEvidence(
        baseURL: String,
        challengeId: String,
        subject: String,
        modelHash: String
    ) async {
        isLoading = true
        error = nil

        let payload = buildEvidencePayload(subject: subject)

        guard let url = URL(string: "\(baseURL)/api/aivm/intake") else {
            error = "Invalid server URL."
            isLoading = false
            return
        }

        // Build multipart/form-data request
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        appendField("modelHash", modelHash)
        appendField("challengeId", challengeId)
        appendField("subject", subject)

        // Include evidence token if available (signed in webapp, passed via deep link)
        if !pendingToken.isEmpty && !pendingExpires.isEmpty {
            appendField("evidenceToken", pendingToken)
            appendField("evidenceExpires", pendingExpires)
        }

        // Send records as JSON form field
        if let jsonData = try? JSONSerialization.data(withJSONObject: payload.records, options: []) {
            appendField("json", String(data: jsonData, encoding: .utf8) ?? "[]")
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let httpResponse = response as? HTTPURLResponse

            if let status = httpResponse?.statusCode, status >= 200, status < 300 {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    lastSubmission = SubmissionResult(
                        ok: json["ok"] as? Bool ?? false,
                        evidenceId: json["evidenceId"] as? String,
                        recordCount: json["recordCount"] as? Int ?? payload.records.count,
                        dataHash: json["dataHash"] as? String ?? payload.evidenceHash
                    )
                }
            } else {
                let errBody = String(data: data, encoding: .utf8) ?? "Unknown error"
                error = "Submission failed (HTTP \(httpResponse?.statusCode ?? 0)): \(errBody)"
            }
        } catch {
            self.error = "Network error: \(error.localizedDescription)"
        }

        isLoading = false
    }

    // MARK: - Helpers

    private func sha256Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return "0x" + hash.map { String(format: "%02x", $0) }.joined()
    }
}
