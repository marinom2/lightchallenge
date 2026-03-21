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
    @Published var cyclingDays: [DailyWorkouts] = []
    @Published var swimmingDays: [DailyWorkouts] = []
    @Published var activeEnergyDays: [DailyActiveEnergy] = []
    @Published var heartRateDays: [DailyHeartRate] = []
    @Published var flightsClimbedDays: [DailyFlightsClimbed] = []
    @Published var strengthWorkoutDays: [DailyWorkouts] = []
    @Published var allWorkoutDays: [DailyWorkouts] = []
    @Published var yogaWorkoutDays: [DailyWorkouts] = []
    @Published var hiitWorkoutDays: [DailyWorkouts] = []
    @Published var rowingWorkoutDays: [DailyWorkouts] = []
    @Published var runningWorkoutDays: [DailyWorkouts] = []
    @Published var walkingWorkoutDays: [DailyWorkouts] = []
    @Published var hikingWorkoutDays: [DailyWorkouts] = []
    @Published var exerciseTimeDays: [DailyExerciseTime] = []

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
            HKQuantityType(.appleExerciseTime),
            HKWorkoutType.workoutType(),
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
        async let cycling = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.cycling])
        async let swimming = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.swimming])
        async let energy = fetchDailyActiveEnergy(from: startDate, to: endDate)
        async let hr = fetchDailyHeartRate(from: startDate, to: endDate)
        async let flights = fetchDailyFlightsClimbed(from: startDate, to: endDate)
        async let strength = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.traditionalStrengthTraining, .functionalStrengthTraining])
        async let allWorkouts = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: nil)
        async let yoga = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.yoga])
        async let hiit = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.highIntensityIntervalTraining, .crossTraining, .mixedCardio])
        async let rowing = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.rowing])
        async let running = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.running])
        async let walking = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.walking])
        async let hiking = fetchDailyWorkouts(from: startDate, to: endDate, activityTypes: [.hiking])
        async let exerciseTime = fetchDailyExerciseTime(from: startDate, to: endDate)

        do {
            let (s, d, c, sw, e, h, f, str, aw, y, hi, ro, rn, wk, hk, et) = try await (steps, distances, cycling, swimming, energy, hr, flights, strength, allWorkouts, yoga, hiit, rowing, running, walking, hiking, exerciseTime)
            stepDays = s
            distanceDays = d
            cyclingDays = c
            swimmingDays = sw
            activeEnergyDays = e
            heartRateDays = h
            flightsClimbedDays = f
            strengthWorkoutDays = str
            allWorkoutDays = aw
            yogaWorkoutDays = y
            hiitWorkoutDays = hi
            rowingWorkoutDays = ro
            runningWorkoutDays = rn
            walkingWorkoutDays = wk
            hikingWorkoutDays = hk
            exerciseTimeDays = et
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
                let dateFmt = DateFormatter()
                dateFmt.dateFormat = "yyyy-MM-dd"
                dateFmt.timeZone = .current  // Match HealthKit's local calendar day bucketing
                results?.enumerateStatistics(from: start, to: end) { stats, _ in
                    let val = stats.sumQuantity()?.doubleValue(for: unit) ?? 0
                    let dateStr = dateFmt.string(from: stats.startDate)
                    days.append((dateStr, val))
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

    // MARK: - Workouts (HKWorkout samples)

    private func fetchDailyWorkouts(
        from start: Date,
        to end: Date,
        activityTypes: [HKWorkoutActivityType]?
    ) async throws -> [DailyWorkouts] {
        let predicate: NSPredicate
        if let types = activityTypes {
            let typePreds = types.map { HKQuery.predicateForWorkouts(with: $0) }
            let timePred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
                timePred,
                NSCompoundPredicate(orPredicateWithSubpredicates: typePreds)
            ])
        } else {
            predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        }

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKWorkoutType.workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let workouts = (samples as? [HKWorkout]) ?? []
                // Group by date (local timezone to match HealthKit calendar day)
                var byDate: [String: (count: Int, minutes: Double, distanceM: Double, calories: Double, elevM: Double)] = [:]
                let fmt = DateFormatter()
                fmt.dateFormat = "yyyy-MM-dd"
                fmt.timeZone = .current
                for w in workouts {
                    let dateStr = fmt.string(from: w.startDate)
                    let minutes = w.duration / 60.0
                    let dist = w.totalDistance?.doubleValue(for: .meter()) ?? 0
                    let cals = w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0
                    // iOS 17+: HKMetadataKeyElevationAscended gives real elevation gain per workout
                    let elev = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?
                        .doubleValue(for: .meter()) ?? 0
                    var entry = byDate[dateStr] ?? (count: 0, minutes: 0, distanceM: 0, calories: 0, elevM: 0)
                    entry.count += 1
                    entry.minutes += minutes
                    entry.distanceM += dist
                    entry.calories += cals
                    entry.elevM += elev
                    byDate[dateStr] = entry
                }
                let result = byDate.map {
                    DailyWorkouts(date: $0.key, count: $0.value.count, totalMinutes: $0.value.minutes,
                                  totalDistanceMeters: $0.value.distanceM, totalCalories: $0.value.calories,
                                  totalElevationMeters: $0.value.elevM)
                }.sorted { $0.date < $1.date }
                continuation.resume(returning: result)
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Exercise Time (Apple's green ring)

    private func fetchDailyExerciseTime(from start: Date, to end: Date) async throws -> [DailyExerciseTime] {
        let raw = try await fetchDailyCumulative(
            type: HKQuantityType(.appleExerciseTime), unit: .minute(), from: start, to: end
        )
        return raw.map { DailyExerciseTime(date: $0.date, minutes: $0.value) }
    }

    // MARK: - Standalone Per-Challenge Queries
    //
    // These methods return data for a specific date range WITHOUT mutating the
    // shared @Published properties. This is critical when multiple challenge
    // views are visible simultaneously — each needs its own independent data.

    /// Query daily values for a specific metric and date range.
    /// Returns (date, value) pairs without affecting shared state.
    func queryDailyMetric(_ metric: String, from start: Date, to end: Date) async -> [(date: String, value: Double)] {
        guard isAuthorized else { return [] }
        do {
            switch metric {
            case "steps":
                return try await fetchDailyCumulative(type: HKQuantityType(.stepCount), unit: .count(), from: start, to: end)
            case "distance", "distance_km":
                return try await fetchDailyCumulative(type: HKQuantityType(.distanceWalkingRunning), unit: .meter(), from: start, to: end)
                    .map { ($0.0, $0.1 / 1000.0) }
            case "walking_km":
                // Walking distance is passively tracked (same as steps) — no workout needed
                return try await fetchDailyCumulative(type: HKQuantityType(.distanceWalkingRunning), unit: .meter(), from: start, to: end)
                    .map { ($0.0, $0.1 / 1000.0) }
            case "cycling_km":
                let cycleWorkouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.cycling])
                return cycleWorkouts.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
            case "swimming_km":
                let swimWorkouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.swimming])
                return swimWorkouts.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
            case "hiking_km":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.hiking])
                return workouts.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
            case "elev_gain_m":
                let hiking = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.hiking])
                let flights = try await fetchDailyCumulative(type: HKQuantityType(.flightsClimbed), unit: .count(), from: start, to: end)
                var byDate: [String: Double] = [:]
                for h in hiking { byDate[h.date, default: 0] += h.totalElevationMeters }
                for f in flights { byDate[f.0, default: 0] += f.1 * 3.0 }
                return byDate.sorted { $0.key < $1.key }.map { ($0.key, $0.value) }
            case "active_minutes":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: nil)
                return workouts.map { ($0.date, $0.totalMinutes) }
            case "strength_sessions":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.traditionalStrengthTraining, .functionalStrengthTraining])
                return workouts.map { ($0.date, Double($0.count)) }
            case "yoga_min":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.yoga])
                return workouts.map { ($0.date, $0.totalMinutes) }
            case "hiit_min":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.highIntensityIntervalTraining, .crossTraining, .mixedCardio])
                return workouts.map { ($0.date, $0.totalMinutes) }
            case "crossfit_min":
                let cfWorkouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.crossTraining, .highIntensityIntervalTraining, .mixedCardio])
                return cfWorkouts.map { ($0.date, $0.totalMinutes) }
            case "rowing_km":
                let workouts = try await fetchDailyWorkouts(from: start, to: end, activityTypes: [.rowing])
                return workouts.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
            case "exercise_time":
                return try await fetchDailyCumulative(type: HKQuantityType(.appleExerciseTime), unit: .minute(), from: start, to: end)
            case "calories":
                return try await fetchDailyCumulative(type: HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), from: start, to: end)
            default:
                return []
            }
        } catch {
            return []
        }
    }

    /// Query the total value for a metric in a date range (standalone, no shared state mutation).
    func queryMetricTotal(_ metric: String, from start: Date, to end: Date) async -> Double {
        let daily = await queryDailyMetric(metric, from: start, to: end)
        return daily.reduce(0) { $0 + $1.value }
    }

    /// Query all activity metrics for discovery mode (no rules).
    /// Returns an array of (label, icon, total, unit, daily) tuples.
    func queryAllActivity(from start: Date, to end: Date) async -> [(label: String, icon: String, total: Double, unit: String, daily: [(date: String, value: Double)])] {
        guard isAuthorized else { return [] }
        var metrics: [(label: String, icon: String, total: Double, unit: String, daily: [(date: String, value: Double)])] = []

        let stepDaily = await queryDailyMetric("steps", from: start, to: end)
        let totalSteps = stepDaily.reduce(0) { $0 + $1.value }
        if totalSteps > 0 { metrics.append(("Steps", "figure.walk", totalSteps, "steps", stepDaily.filter { $0.value > 0 })) }

        let distDaily = await queryDailyMetric("cycling_km", from: start, to: end)
        let totalCycling = distDaily.reduce(0) { $0 + $1.value }
        if totalCycling > 0.01 { metrics.append(("Cycling", "figure.outdoor.cycle", totalCycling, "km", distDaily.filter { $0.value > 0 })) }

        let swimDaily = await queryDailyMetric("swimming_km", from: start, to: end)
        let totalSwimming = swimDaily.reduce(0) { $0 + $1.value }
        if totalSwimming > 0.01 { metrics.append(("Swimming", "figure.pool.swim", totalSwimming, "km", swimDaily.filter { $0.value > 0 })) }

        let calDaily = await queryDailyMetric("calories", from: start, to: end)
        let totalCals = calDaily.reduce(0) { $0 + $1.value }
        if totalCals > 0 { metrics.append(("Energy", "flame.fill", totalCals, "kcal", calDaily.filter { $0.value > 0 })) }

        return metrics
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
                    let hrFmt = DateFormatter()
                    hrFmt.dateFormat = "yyyy-MM-dd"
                    hrFmt.timeZone = .current
                    let dateStr = hrFmt.string(from: stats.startDate)
                    days.append(DailyHeartRate(
                        date: dateStr,
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

        // NOTE: distanceWalkingRunning omitted — it combines walking+running into one
        // ambiguous value. Use workout-level running/walking records below for isolation.

        // Cycling workouts (explicit sessions only — no passive detection)
        for day in cyclingDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_cycle:\(day.date)",
                "type": "cycle",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Swimming workouts (explicit sessions only — no passive detection)
        for day in swimmingDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_swim:\(day.date)",
                "type": "swim",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Active energy burned (cross-activity aggregate)
        for day in activeEnergyDays where day.kilocalories > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_energy:\(day.date)",
                "type": "calories",
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

        // Running workouts (type: "run" — only counts actual running, not walking)
        for day in runningWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_run:\(day.date)",
                "type": "run",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Walking workouts (type: "walk" — only counts explicit walking workouts)
        for day in walkingWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_walk_workout:\(day.date)",
                "type": "walk",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Strength workouts
        for day in strengthWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_strength:\(day.date)",
                "type": "strength",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Yoga workouts
        for day in yogaWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_yoga:\(day.date)",
                "type": "yoga",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // HIIT workouts
        for day in hiitWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_hiit:\(day.date)",
                "type": "hiit",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Rowing workouts
        for day in rowingWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_rowing:\(day.date)",
                "type": "rowing",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Hiking workouts (type: "hike" — distinct from walking, captures elevation + distance)
        for day in hikingWorkoutDays where day.count > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_hike:\(day.date)",
                "type": "hike",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": Int(day.totalMinutes * 60),
                "distance_m": day.totalDistanceMeters,
                "elev_gain_m": day.totalElevationMeters,
                "calories": day.totalCalories,
                "sessions": day.count,
                "source_device": "HealthKit",
            ])
        }

        // Apple Exercise Time (green ring minutes)
        for day in exerciseTimeDays where day.minutes > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_exercise_time:\(day.date)",
                "type": "exercise_time",
                "start_ts": startTs,
                "end_ts": endTs,
                "duration_s": 86400,
                "exercise_minutes": day.minutes,
                "source_device": "HealthKit",
            ])
        }

        // Flights climbed (elevation proxy: 1 flight ≈ 3 m — counts toward hiking challenges)
        for day in flightsClimbedDays where day.flights > 0 {
            let (startTs, endTs) = dayTimestamps(day.date)
            records.append([
                "provider": "apple_health",
                "user_id": userId,
                "activity_id": "hk_flights:\(day.date)",
                "type": "hike",
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
        // HealthKit buckets data by local calendar day, so use the device's
        // timezone to derive start-of-day — NOT UTC midnight.
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        if let localDay = formatter.date(from: dateStr) {
            let startTs = Int(localDay.timeIntervalSince1970)
            return (startTs, startTs + 86399)
        }
        // Fallback: UTC midnight (shouldn't normally be reached)
        let startTs = ISO8601DateFormatter().date(from: "\(dateStr)T00:00:00Z")?.timeIntervalSince1970 ?? 0
        return (Int(startTs), Int(startTs) + 86399)
    }

    private func sha256Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return "0x" + hash.map { String(format: "%02x", $0) }.joined()
    }
}
