// HealthKitService.swift
// Core HealthKit data collection service.
//
// Reads step count, walking/running distance, cycling distance, swimming distance,
// active energy, heart rate, and flights climbed from HealthKit. Packages the data
// as JSON evidence and submits to the LightChallenge API.

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
    @Published var cyclingDays: [DailyCyclingDistance] = []
    @Published var swimmingDays: [DailySwimmingDistance] = []
    @Published var activeEnergyDays: [DailyActiveEnergy] = []
    @Published var heartRateDays: [DailyHeartRate] = []
    @Published var flightsClimbedDays: [DailyFlightsClimbed] = []

    // MARK: - Authorization

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            error = "Health data not available on this device."
            return
        }

        let readTypes: Set<HKSampleType> = [
            HKQuantityType(.stepCount),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKQuantityType(.distanceSwimming),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.heartRate),
            HKQuantityType(.flightsClimbed),
        ]

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
            error = nil
        } catch {
            self.error = "HealthKit authorization failed: \(error.localizedDescription)"
            isAuthorized = false
        }
    }

    func ensureAuthorization() async {
        if !isAuthorized {
            await requestAuthorization()
        }
    }

    // MARK: - Data Collection

    /// Collect evidence for exactly the challenge period (startDate → endDate).
    func collectEvidence(from challengeStart: Date, to challengeEnd: Date) async {
        await _collectEvidence(startDate: challengeStart, endDate: challengeEnd)
    }

    /// Legacy: collect evidence for a lookback window from now.
    func collectEvidence(days: Int = 90) async {
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: endDate) else {
            error = "Invalid date range."
            return
        }
        await _collectEvidence(startDate: startDate, endDate: endDate)
    }

    private func _collectEvidence(startDate: Date, endDate: Date) async {
        guard isAuthorized else {
            error = "HealthKit not authorized. Please grant access first."
            return
        }

        isLoading = true
        error = nil

        async let steps = fetchDailySteps(from: startDate, to: endDate)
        async let distances = fetchDailyDistance(from: startDate, to: endDate)
        async let cycling = fetchDailyCyclingDistance(from: startDate, to: endDate)
        async let swimming = fetchDailySwimmingDistance(from: startDate, to: endDate)
        async let energy = fetchDailyActiveEnergy(from: startDate, to: endDate)
        async let hr = fetchDailyHeartRate(from: startDate, to: endDate)
        async let flights = fetchDailyFlightsClimbed(from: startDate, to: endDate)

        do {
            let (s, d, c, sw, e, h, f) = try await (steps, distances, cycling, swimming, energy, hr, flights)
            stepDays = s
            distanceDays = d
            cyclingDays = c
            swimmingDays = sw
            activeEnergyDays = e
            heartRateDays = h
            flightsClimbedDays = f
            isLoading = false
        } catch {
            self.error = "Failed to read HealthKit data: \(error.localizedDescription)"
            isLoading = false
        }
    }

    // MARK: - Cumulative Quantity Fetchers

    private func fetchDailyCumulative(
        type: HKQuantityType,
        unit: HKUnit,
        from start: Date,
        to end: Date
    ) async throws -> [(date: String, value: Double)] {
        let interval = DateComponents(day: 1)
        let anchor = Calendar.current.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
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
                var days: [(String, Double)] = []
                results?.enumerateStatistics(from: start, to: end) { stats, _ in
                    let val = stats.sumQuantity()?.doubleValue(for: unit) ?? 0
                    let dateStr = ISO8601DateFormatter().string(from: stats.startDate).prefix(10)
                    days.append((String(dateStr), val))
                }
                continuation.resume(returning: days)
            }
            healthStore.execute(query)
        }
    }

    private func fetchDailySteps(from start: Date, to end: Date) async throws -> [DailySteps] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.stepCount), unit: .count(), from: start, to: end
        )
        return raw.map { DailySteps(date: $0.date, steps: Int($0.value)) }
    }

    private func fetchDailyDistance(from start: Date, to end: Date) async throws -> [DailyDistance] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.distanceWalkingRunning), unit: .meter(), from: start, to: end
        )
        return raw.map { DailyDistance(date: $0.date, distanceMeters: $0.value) }
    }

    private func fetchDailyCyclingDistance(from start: Date, to end: Date) async throws -> [DailyCyclingDistance] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.distanceCycling), unit: .meter(), from: start, to: end
        )
        return raw.map { DailyCyclingDistance(date: $0.date, distanceMeters: $0.value) }
    }

    private func fetchDailySwimmingDistance(from start: Date, to end: Date) async throws -> [DailySwimmingDistance] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.distanceSwimming), unit: .meter(), from: start, to: end
        )
        return raw.map { DailySwimmingDistance(date: $0.date, distanceMeters: $0.value) }
    }

    private func fetchDailyActiveEnergy(from start: Date, to end: Date) async throws -> [DailyActiveEnergy] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), from: start, to: end
        )
        return raw.map { DailyActiveEnergy(date: $0.date, kilocalories: $0.value) }
    }

    private func fetchDailyFlightsClimbed(from start: Date, to end: Date) async throws -> [DailyFlightsClimbed] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.flightsClimbed), unit: .count(), from: start, to: end
        )
        return raw.map { DailyFlightsClimbed(date: $0.date, flights: Int($0.value)) }
    }

    // MARK: - Heart Rate (discrete average)

    private func fetchDailyHeartRate(from start: Date, to end: Date) async throws -> [DailyHeartRate] {
        let hrType = HKQuantityType(.heartRate)
        let interval = DateComponents(day: 1)
        let anchor = Calendar.current.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let bpmUnit = HKUnit.count().unitDivided(by: .minute())

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: hrType,
                quantitySamplePredicate: predicate,
                options: [.discreteAverage, .discreteMin, .discreteMax],
                anchorDate: anchor,
                intervalComponents: interval
            )
            query.initialResultsHandler = { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                var days: [DailyHeartRate] = []
                results?.enumerateStatistics(from: start, to: end) { stats, _ in
                    guard let avg = stats.averageQuantity()?.doubleValue(for: bpmUnit) else { return }
                    let minVal = stats.minimumQuantity()?.doubleValue(for: bpmUnit) ?? avg
                    let maxVal = stats.maximumQuantity()?.doubleValue(for: bpmUnit) ?? avg
                    let dateStr = ISO8601DateFormatter().string(from: stats.startDate).prefix(10)
                    days.append(DailyHeartRate(
                        date: String(dateStr),
                        avgBpm: avg,
                        minBpm: minVal,
                        maxBpm: maxVal
                    ))
                }
                continuation.resume(returning: days)
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Evidence Payload

    func buildEvidencePayload(subject: String) -> EvidencePayload {
        var records: [[String: Any]] = []
        let userId = sha256Hex(subject)

        // Steps
        for day in stepDays where day.steps > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_steps:\(day.date)",
                "type": "steps",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "steps": day.steps,
                "source_device": "HealthKit",
            ])
        }

        // Walking/running distance
        for day in distanceDays where day.distanceMeters > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_dist:\(day.date)",
                "type": "walk",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "distance_m": day.distanceMeters,
                "source_device": "HealthKit",
            ])
        }

        // Cycling distance
        for day in cyclingDays where day.distanceMeters > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_cycle:\(day.date)",
                "type": "cycle",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "distance_m": day.distanceMeters,
                "source_device": "HealthKit",
            ])
        }

        // Swimming distance
        for day in swimmingDays where day.distanceMeters > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_swim:\(day.date)",
                "type": "swim",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "distance_m": day.distanceMeters,
                "source_device": "HealthKit",
            ])
        }

        // Active energy burned
        for day in activeEnergyDays where day.kilocalories > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_energy:\(day.date)",
                "type": "steps",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "calories": day.kilocalories,
                "source_device": "HealthKit",
            ])
        }

        // Heart rate
        for day in heartRateDays {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_hr:\(day.date)",
                "type": "steps",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "avg_hr_bpm": day.avgBpm,
                "max_hr_bpm": day.maxBpm,
                "source_device": "HealthKit",
            ])
        }

        // Flights climbed (elevation proxy: 1 flight ≈ 3 m)
        for day in flightsClimbedDays where day.flights > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_flights:\(day.date)",
                "type": "walk",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "elev_gain_m": Double(day.flights) * 3.0,
                "source_device": "HealthKit",
            ])
        }

        let jsonData = try? JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
        let hash = sha256Hex(String(data: jsonData ?? Data(), encoding: .utf8) ?? "")

        return EvidencePayload(records: records, evidenceHash: hash)
    }

    // MARK: - Submission

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
        appendField("provider", "apple")

        if !pendingToken.isEmpty && !pendingExpires.isEmpty {
            appendField("evidenceToken", pendingToken)
            appendField("evidenceExpires", pendingExpires)
        }

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

    private func dayTimestamps(_ dateStr: String) -> (Int, Int) {
        let startTs = ISO8601DateFormatter().date(from: "\(dateStr)T00:00:00Z")?.timeIntervalSince1970 ?? 0
        return (Int(startTs), Int(startTs) + 86399)
    }

    private func sha256Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return "0x" + hash.map { String(format: "%02x", $0) }.joined()
    }
}
