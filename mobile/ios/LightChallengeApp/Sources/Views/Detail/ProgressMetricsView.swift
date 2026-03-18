// ProgressMetricsView.swift
// Detailed progress metrics page — shows ring, daily breakdown, and goal status.
// Opened by tapping the hero card on the challenge detail.

import SwiftUI

struct ProgressMetricsView: View {
    let detail: ChallengeDetail
    let participantStatus: ParticipantStatus?
    let healthService: HealthKitService
    let tokenPrice: Double?

    @EnvironmentObject private var appState: AppState
    @State private var currentValue: Double = 0
    @State private var goalValue: Double = 0
    @State private var animatedProgress: Double = 0
    @State private var dailyValues: [(date: String, value: Double)] = []
    @State private var activityMetrics: [(label: String, icon: String, value: Double, unit: String, daily: [(date: String, value: Double)])] = []
    @State private var hasLoaded = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    private var theme: ActivityTheme { ActivityTheme.from(detail: detail) }
    private var rules: ChallengeRules? { detail.rules }
    private var metricLabel: String { rules?.metricLabel ?? "" }

    private var phase: ChallengePhase {
        ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
    }
    private var userState: UserChallengeState {
        UserChallengeState.from(detail: detail, participantStatus: participantStatus, phase: phase)
    }

    private var ringState: RingState {
        if userState == .completed { return .complete }
        if case .finalized(let passed) = phase, passed == true { return .complete }
        if animatedProgress > 0 { return .progress(animatedProgress) }
        return .empty
    }

    private var ringColor: Color {
        if phase.ringDimmed { return .secondary }
        return theme.barColors.first ?? theme.figureTint
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LC.space24) {
                    // Large progress ring
                    ringSection

                    if rules != nil {
                        // Focused mode: known goal
                        if goalValue > 0 {
                            goalCard
                        }
                        requirementsCard
                        if !dailyValues.isEmpty {
                            dailyBreakdown
                        }
                    } else {
                        // Discovery mode: show all activity
                        if !activityMetrics.isEmpty {
                            activityOverviewCard
                        } else if hasLoaded {
                            noActivityCard
                        }
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.bottom, LC.space32)
            }
            .background(LC.pageBg(scheme))
            .navigationTitle("Progress")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(LC.accent)
                }
            }
            .task { await loadMetrics() }
        }
    }

    // MARK: - Ring Section

    private var ringSection: some View {
        VStack(spacing: LC.space16) {
            ChallengeProgressRing(
                state: ringState,
                symbol: theme.icon,
                color: ringColor,
                diameter: 200,
                lineWidth: 18
            )
            .padding(.top, LC.space16)

            // Status label
            HStack(spacing: LC.space8) {
                Image(systemName: phase.icon)
                    .foregroundStyle(phase.color)
                Text(userState.label)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(phase.color)
            }
        }
    }

    // MARK: - Goal Card

    private var goalCard: some View {
        VStack(spacing: LC.space12) {
            // Progress numbers
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(formatValue(currentValue))
                    .font(.system(size: 42, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(ringColor)

                Text("/ \(formatValue(goalValue)) \(metricLabel)")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
            }

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(ringColor.opacity(0.15))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: theme.barColors,
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * min(1.0, animatedProgress))
                        .animation(.easeInOut(duration: 0.8), value: animatedProgress)
                }
            }
            .frame(height: 8)

            // Percentage + remaining
            HStack {
                Text("\(Int(animatedProgress * 100))% complete")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ringColor)

                Spacer()

                if goalValue > currentValue {
                    let remaining = goalValue - currentValue
                    Text("\(formatValue(remaining)) \(metricLabel) to go")
                        .font(.caption)
                        .foregroundStyle(LC.textTertiary(scheme))
                } else if currentValue >= goalValue && goalValue > 0 {
                    Label("Goal reached", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.success)
                }
            }
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - Daily Breakdown

    private var dailyBreakdown: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            Text("Daily Breakdown")
                .font(.headline.weight(.bold))
                .foregroundStyle(LC.textPrimary(scheme))

            let maxVal = dailyValues.map(\.value).max() ?? 1

            ForEach(dailyValues.suffix(14), id: \.date) { day in
                HStack(spacing: LC.space12) {
                    // Date
                    Text(formatDayLabel(day.date))
                        .font(.caption.monospaced())
                        .foregroundStyle(LC.textTertiary(scheme))
                        .frame(width: 50, alignment: .leading)

                    // Bar
                    GeometryReader { geo in
                        let fraction = maxVal > 0 ? day.value / maxVal : 0
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: theme.barColors,
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(4, geo.size.width * fraction))
                    }
                    .frame(height: 16)

                    // Value
                    Text(formatValue(day.value))
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundStyle(LC.textSecondary(scheme))
                        .frame(width: 55, alignment: .trailing)
                }
            }
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - Requirements Card

    /// Human-readable goal description, e.g. "Walk 10,000 steps within the challenge period"
    private var goalDescription: String {
        guard let rules else { return "Complete the challenge requirements." }
        let goal = rules.goalValue
        let metric = rules.metric ?? "steps"
        let period = rules.period ?? "total"

        let formattedGoal: String = {
            if goal >= 1000 && goal == goal.rounded() {
                let fmt = NumberFormatter()
                fmt.numberStyle = .decimal
                fmt.maximumFractionDigits = 0
                return fmt.string(from: NSNumber(value: goal)) ?? formatValue(goal)
            }
            return formatValue(goal)
        }()

        let activityVerb: String
        let unit: String
        switch metric {
        case "steps":
            activityVerb = "Walk"
            unit = "steps"
        case "distance", "distance_km":
            activityVerb = "Cover"
            unit = "km"
        case "walking_km":
            activityVerb = "Walk"
            unit = "km"
        case "active_minutes":
            activityVerb = "Log"
            unit = "active minutes"
        case "cycling_km":
            activityVerb = "Cycle"
            unit = "km"
        case "swimming_km":
            activityVerb = "Swim"
            unit = "km"
        case "hiking_km":
            activityVerb = "Hike"
            unit = "km"
        case "elev_gain_m":
            activityVerb = "Climb"
            unit = "m elevation"
        case "rowing_km":
            activityVerb = "Row"
            unit = "km"
        case "strength_sessions":
            activityVerb = "Complete"
            unit = "strength sessions"
        case "yoga_min":
            activityVerb = "Practice"
            unit = "minutes of yoga"
        case "hiit_min":
            activityVerb = "Train"
            unit = "minutes of HIIT"
        case "exercise_time":
            activityVerb = "Exercise"
            unit = "minutes"
        case "calories":
            activityVerb = "Burn"
            unit = "kcal"
        default:
            activityVerb = "Achieve"
            unit = metricLabel
        }

        let timeframe: String
        switch period {
        case "daily":
            timeframe = "every day"
        case "weekly":
            timeframe = "per week"
        case "average":
            timeframe = "on average"
        default:
            timeframe = "in total"
        }

        return "\(activityVerb) \(formattedGoal) \(unit) \(timeframe)"
    }

    /// Time window description
    private var timeWindowDescription: String? {
        guard let start = detail.startDate else { return nil }
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM yyyy"
        let startStr = fmt.string(from: start)
        if let end = detail.endsDate {
            let endStr = fmt.string(from: end)
            let days = Int(end.timeIntervalSince(start) / 86400)
            if days > 0 {
                return "\(startStr) – \(endStr) (\(days) day\(days == 1 ? "" : "s"))"
            }
            return "\(startStr) – \(endStr)"
        }
        return "Started \(startStr)"
    }

    private var requirementsCard: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            // Header
            HStack(spacing: LC.space8) {
                Image(systemName: "target")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(theme.figureTint)
                Text("What You Need To Do")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(LC.textPrimary(scheme))
            }

            // Goal description
            Text(goalDescription)
                .font(.body.weight(.medium))
                .foregroundStyle(LC.textPrimary(scheme))

            // Requirement rows
            VStack(alignment: .leading, spacing: LC.space8) {
                let displayGoal = goalValue > 0 ? goalValue : (rules?.goalValue ?? 0)
                requirementRow(
                    icon: theme.icon,
                    label: rules?.metricName ?? "Activity",
                    value: displayGoal > 0 ? "\(formatValue(displayGoal)) \(metricLabel)" : metricLabel,
                    color: theme.figureTint
                )

                if let period = rules?.period, !period.isEmpty {
                    requirementRow(
                        icon: "clock.fill",
                        label: "Tracking",
                        value: period.capitalized,
                        color: .blue
                    )
                }

                if let tw = timeWindowDescription {
                    requirementRow(
                        icon: "calendar",
                        label: "Window",
                        value: tw,
                        color: .orange
                    )
                }
            }

            // Current status summary
            Divider()

            HStack(spacing: LC.space12) {
                let pct = Int(animatedProgress * 100)
                let statusIcon: String
                let statusColor: Color
                let statusText: String

                if userState == .completed {
                    let _ = (statusIcon = "checkmark.circle.fill",
                             statusColor = LC.success,
                             statusText = "Goal achieved — you passed!")
                } else if userState == .failed {
                    let _ = (statusIcon = "xmark.circle.fill",
                             statusColor = LC.danger,
                             statusText = "Goal not met — \(formatValue(goalValue - currentValue)) \(metricLabel) short")
                } else if animatedProgress >= 1.0 {
                    let _ = (statusIcon = "checkmark.circle.fill",
                             statusColor = LC.success,
                             statusText = "Goal reached — awaiting verification")
                } else if animatedProgress > 0 {
                    let _ = (statusIcon = "circle.dotted.circle",
                             statusColor = theme.figureTint,
                             statusText = "\(pct)% done — \(formatValue(goalValue - currentValue)) \(metricLabel) to go")
                } else {
                    let _ = (statusIcon = "circle.dashed",
                             statusColor = LC.textTertiary(scheme),
                             statusText = "No activity recorded yet")
                }

                Image(systemName: statusIcon)
                    .font(.system(size: 18))
                    .foregroundStyle(statusColor)
                Text(statusText)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
            }
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    private func requirementRow(icon: String, label: String, value: String, color: Color) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(color)
                .frame(width: 24)
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
                .frame(width: 65, alignment: .leading)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(LC.textPrimary(scheme))
        }
    }

    // MARK: - Activity Overview (Discovery Mode)

    private var activityOverviewCard: some View {
        VStack(alignment: .leading, spacing: LC.space16) {
            HStack(spacing: LC.space8) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(theme.figureTint)
                Text("Your Activity")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(LC.textPrimary(scheme))
            }

            ForEach(Array(activityMetrics.enumerated()), id: \.offset) { _, metric in
                VStack(alignment: .leading, spacing: LC.space8) {
                    HStack(spacing: LC.space8) {
                        Image(systemName: metric.icon)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(theme.figureTint)
                            .frame(width: 24)
                        Text(metric.label)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(LC.textTertiary(scheme))
                        Spacer()
                        Text("\(formatValue(metric.value)) \(metric.unit)")
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .foregroundStyle(LC.textPrimary(scheme))
                    }

                    // Mini daily bar chart
                    if !metric.daily.isEmpty {
                        let maxVal = metric.daily.map(\.value).max() ?? 1
                        HStack(alignment: .bottom, spacing: 2) {
                            ForEach(metric.daily.suffix(14), id: \.date) { day in
                                let fraction = maxVal > 0 ? day.value / maxVal : 0
                                RoundedRectangle(cornerRadius: 2, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: theme.barColors,
                                            startPoint: .bottom,
                                            endPoint: .top
                                        )
                                    )
                                    .frame(maxWidth: .infinity)
                                    .frame(height: max(2, 40 * fraction))
                            }
                        }
                        .frame(height: 40)
                    }
                }
                .padding(LC.space12)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                        .fill(LC.cardBgElevated(scheme))
                )
            }

            // Time window
            if let tw = timeWindowDescription {
                HStack(spacing: LC.space8) {
                    Image(systemName: "calendar")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.orange)
                        .frame(width: 24)
                    Text("Window")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                    Text(tw)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                }
            }
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    private var noActivityCard: some View {
        VStack(spacing: LC.space12) {
            Image(systemName: "figure.walk")
                .font(.system(size: 36))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("No activity recorded yet")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))
            Text("Start moving — your HealthKit data will appear here")
                .font(.caption)
                .foregroundStyle(LC.textTertiary(scheme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(LC.space24)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - Data Loading

    private func loadMetrics() async {
        guard !hasLoaded else { return }
        hasLoaded = true

        let start = detail.startDate ?? detail.endsDate?.addingTimeInterval(-7 * 86400) ?? Date().addingTimeInterval(-7 * 86400)
        let end = min(Date(), detail.endsDate ?? Date())
        guard end > start else { return }

        await healthService.ensureAuthorization()
        await healthService.collectEvidence(from: start, to: end)

        if let r = rules, r.goalValue > 0 {
            // Focused mode: known rules → show progress toward specific goal
            goalValue = r.goalValue
            let daily = dailyValuesForMetric(r.metric)

            currentValue = daily.reduce(0) { $0 + $1.value }

            if appState.hasWallet {
                if let sp = try? await APIClient.shared.fetchMyProgress(
                    baseURL: appState.serverURL,
                    challengeId: detail.id,
                    subject: appState.walletAddress
                ) {
                    let serverVal = sp.currentValue ?? 0
                    if serverVal > currentValue { currentValue = serverVal }
                    if let sg = sp.goalValue, sg > 0 { goalValue = sg }
                }
            }

            dailyValues = daily.filter { $0.value > 0 }
            withAnimation(.easeInOut(duration: 0.8)) {
                animatedProgress = goalValue > 0 ? min(1.0, currentValue / goalValue) : 0
            }
        } else {
            // Discovery mode: no rules → show all HealthKit activity
            var metrics: [(label: String, icon: String, value: Double, unit: String, daily: [(date: String, value: Double)])] = []

            let stepDaily = healthService.stepDays.map { ($0.date, Double($0.steps)) }
            let totalSteps = stepDaily.reduce(0) { $0 + $1.1 }
            if totalSteps > 0 {
                metrics.append(("Steps", "figure.walk", totalSteps, "steps", stepDaily.filter { $0.1 > 0 }))
            }

            let distDaily = healthService.distanceDays.map { ($0.date, $0.distanceMeters / 1000.0) }
            let totalDist = distDaily.reduce(0) { $0 + $1.1 }
            if totalDist > 0.01 {
                metrics.append(("Distance", "point.bottomleft.forward.to.point.topright.scurvepath", totalDist, "km", distDaily.filter { $0.1 > 0 }))
            }

            let cycleDaily = healthService.cyclingDays.map { ($0.date, $0.distanceMeters / 1000.0) }
            let totalCycling = cycleDaily.reduce(0) { $0 + $1.1 }
            if totalCycling > 0.01 {
                metrics.append(("Cycling", "figure.outdoor.cycle", totalCycling, "km", cycleDaily.filter { $0.1 > 0 }))
            }

            let swimDaily = healthService.swimmingDays.map { ($0.date, $0.distanceMeters / 1000.0) }
            let totalSwimming = swimDaily.reduce(0) { $0 + $1.1 }
            if totalSwimming > 0.01 {
                metrics.append(("Swimming", "figure.pool.swim", totalSwimming, "km", swimDaily.filter { $0.1 > 0 }))
            }

            let workoutDaily = healthService.allWorkoutDays.map { ($0.date, $0.totalMinutes) }
            let totalWorkouts = workoutDaily.reduce(0) { $0 + $1.1 }
            if totalWorkouts > 0 {
                metrics.append(("Workouts", "figure.strengthtraining.traditional", totalWorkouts, "min", workoutDaily.filter { $0.1 > 0 }))
            }

            let energyDaily = healthService.activeEnergyDays.map { ($0.date, $0.kilocalories) }
            let totalEnergy = energyDaily.reduce(0) { $0 + $1.1 }
            if totalEnergy > 0 {
                metrics.append(("Energy", "flame.fill", totalEnergy, "kcal", energyDaily.filter { $0.1 > 0 }))
            }

            activityMetrics = metrics

            if !metrics.isEmpty {
                withAnimation(.easeInOut(duration: 0.8)) {
                    animatedProgress = 0.15  // subtle activity indicator
                }
            }
        }
    }

    /// Map a rule metric to daily HealthKit values.
    /// Uses workout-level data for type-specific metrics (running vs walking isolation).
    private func dailyValuesForMetric(_ metric: String?) -> [(date: String, value: Double)] {
        switch metric {
        case "steps":
            return healthService.stepDays.map { ($0.date, Double($0.steps)) }
        case "distance", "distance_km":
            // Running distance from actual running workouts
            return healthService.runningWorkoutDays.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
        case "walking_km":
            // Walking distance from walking workouts only
            return healthService.walkingWorkoutDays.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
        case "cycling_km":
            return healthService.cyclingDays.map { ($0.date, $0.distanceMeters / 1000.0) }
        case "swimming_km":
            return healthService.swimmingDays.map { ($0.date, $0.distanceMeters / 1000.0) }
        case "hiking_km":
            return healthService.hikingWorkoutDays.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
        case "elev_gain_m":
            // Real elevation from HKMetadataKeyElevationAscended + flights climbed proxy
            var elevByDate: [String: Double] = [:]
            for day in healthService.hikingWorkoutDays where day.totalElevationMeters > 0 {
                elevByDate[day.date, default: 0] += day.totalElevationMeters
            }
            for day in healthService.flightsClimbedDays where day.flights > 0 {
                elevByDate[day.date, default: 0] += Double(day.flights) * 3.0
            }
            return elevByDate.map { ($0.key, $0.value) }.sorted { $0.0 < $1.0 }
        case "active_minutes":
            return healthService.allWorkoutDays.map { ($0.date, $0.totalMinutes) }
        case "strength_sessions":
            return healthService.strengthWorkoutDays.map { ($0.date, Double($0.count)) }
        case "yoga_min":
            return healthService.yogaWorkoutDays.map { ($0.date, $0.totalMinutes) }
        case "hiit_min":
            return healthService.hiitWorkoutDays.map { ($0.date, $0.totalMinutes) }
        case "rowing_km":
            return healthService.rowingWorkoutDays.map { ($0.date, $0.totalDistanceMeters / 1000.0) }
        case "exercise_time":
            return healthService.exerciseTimeDays.map { ($0.date, $0.minutes) }
        case "calories":
            return healthService.activeEnergyDays.map { ($0.date, $0.kilocalories) }
        default:
            return [] // Unknown metric — don't fake data
        }
    }

    // MARK: - Formatters

    private func formatValue(_ value: Double) -> String {
        if value >= 10000 { return String(format: "%.0f", value) }
        if value >= 100 { return String(format: "%.0f", value) }
        if value >= 1 { return String(format: "%.1f", value) }
        return String(format: "%.2f", value)
    }

    private func formatDayLabel(_ dateStr: String) -> String {
        // "2026-03-15" → "Mar 15"
        let parts = dateStr.split(separator: "-")
        guard parts.count == 3 else { return dateStr }
        let months = ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        let monthIdx = Int(parts[1]) ?? 0
        let day = Int(parts[2]) ?? 0
        guard monthIdx > 0, monthIdx <= 12 else { return dateStr }
        return "\(months[monthIdx]) \(day)"
    }

}
