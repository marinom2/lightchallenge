// ChallengeProgressHero.swift
// Apple Fitness-inspired challenge hero with activity figure, themed progress bar,
// numeric progress, and phase timer. Replaces the old icon-badge hero.
//
// Layout:
//   [ phase timer pill ]
//   [ large activity figure ]
//   [ themed progress bar ]    ← only when rules/goal available
//   [ 7.2 / 10 km ]           ← only when rules/goal available
//   [ title + description ]

import SwiftUI

// MARK: - Activity Theme

/// Visual theme derived from the challenge's fitness type.
struct ActivityTheme {
    let icon: String
    let label: String
    let barColors: [Color]
    let figureTint: Color
    let barBackground: Color

    static func from(detail: ChallengeDetail) -> ActivityTheme {
        let swimTheme = ActivityTheme(icon: "figure.pool.swim", label: "Swimming",
            barColors: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)],
            figureTint: Color(hex: 0x06B6D4), barBackground: Color(hex: 0x06B6D4).opacity(0.15))
        let cycleTheme = ActivityTheme(icon: "figure.outdoor.cycle", label: "Cycling",
            barColors: [Color(hex: 0xF97316), Color(hex: 0xEA580C)],
            figureTint: Color(hex: 0xF97316), barBackground: Color(hex: 0xF97316).opacity(0.15))
        let runTheme = ActivityTheme(icon: "figure.run", label: "Running",
            barColors: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)],
            figureTint: Color(hex: 0x3B82F6), barBackground: Color(hex: 0x2563EB).opacity(0.15))
        let strTheme = ActivityTheme(icon: "figure.strengthtraining.traditional", label: "Strength",
            barColors: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)],
            figureTint: Color(hex: 0xEF4444), barBackground: Color(hex: 0xEF4444).opacity(0.15))
        let hikeTheme = ActivityTheme(icon: "figure.hiking", label: "Hiking",
            barColors: [Color(hex: 0x22C55E), Color(hex: 0x15803D)],
            figureTint: Color(hex: 0x22C55E), barBackground: Color(hex: 0x22C55E).opacity(0.15))
        let walkTheme = ActivityTheme(icon: "figure.walk", label: "Walking",
            barColors: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)],
            figureTint: Color(hex: 0x22C55E), barBackground: Color(hex: 0x22C55E).opacity(0.15))

        // 1. Match from modelId (most reliable — e.g. "fitness.cycling@1")
        let modelId = (detail.modelId ?? "").lowercased()
        if modelId.contains("swimming")  { return swimTheme }
        if modelId.contains("cycling")   { return cycleTheme }
        if modelId.contains("distance")  { return runTheme }
        if modelId.contains("strength")  { return strTheme }
        if modelId.contains("hiking")    { return hikeTheme }
        if modelId.contains("steps")     { return walkTheme }

        // 2. Match from metric (rules-based)
        let metric = detail.rules?.metric ?? ""
        if metric == "swimming_km"       { return swimTheme }
        if metric == "cycling_km"        { return cycleTheme }
        if metric == "distance" || metric == "distance_km" { return runTheme }
        if metric == "strength_sessions" { return strTheme }
        if metric == "hiking_km"         { return hikeTheme }
        if metric == "steps"             { return walkTheme }

        // 3. Match from tags
        let tags = (detail.tags ?? []).joined(separator: " ").lowercased()
        if tags.contains("swimming")  { return swimTheme }
        if tags.contains("cycling")   { return cycleTheme }
        if tags.contains("running")   { return runTheme }
        if tags.contains("strength")  { return strTheme }
        if tags.contains("hiking")    { return hikeTheme }
        if tags.contains("walking")   { return walkTheme }

        // 4. Fallback: keyword search in title + description
        let text = [(detail.title ?? ""), (detail.description ?? "")].joined(separator: " ").lowercased()
        if text.contains("swim") || text.contains("pool")  { return swimTheme }
        if text.contains("cycl") || text.contains("bike") || text.contains("ride") { return cycleTheme }
        if text.contains("run")  || text.contains("marathon") || text.contains("jog") { return runTheme }
        if text.contains("strength") || text.contains("lift") || text.contains("weight") { return strTheme }
        if text.contains("hik")  || text.contains("trail") || text.contains("climb") { return hikeTheme }

        return walkTheme
    }
}

// MARK: - Challenge Phase

enum ChallengePhase {
    case upcoming(startsIn: TimeInterval)
    case active(remaining: TimeInterval)
    case proofWindow(remaining: TimeInterval)
    case ended
    case finalized(passed: Bool?)

    var label: String {
        switch self {
        case .upcoming(let ti):
            if ti <= 0 { return "Starting soon" }
            return "Starts in \(Self.formatDuration(ti))"
        case .active(let ti):
            if ti <= 0 { return "Challenge active" }
            return "\(Self.formatDuration(ti)) left to complete"
        case .proofWindow(let ti):
            if ti <= 0 { return "Proof submission open" }
            return "\(Self.formatDuration(ti)) left to verify"
        case .ended:
            return "Challenge ended"
        case .finalized(let passed):
            if let p = passed { return p ? "Completed" : "Failed" }
            return "Finalized"
        }
    }

    var color: Color {
        switch self {
        case .upcoming: return .blue
        case .active: return Color(hex: 0x22C55E)
        case .proofWindow: return Color(hex: 0xEAB308)
        case .ended: return .secondary
        case .finalized(let p):
            if let p { return p ? Color(hex: 0x22C55E) : Color(hex: 0xEF4444) }
            return .secondary
        }
    }

    var icon: String {
        switch self {
        case .upcoming: return "clock"
        case .active: return "flame.fill"
        case .proofWindow: return "exclamationmark.clock.fill"
        case .ended: return "flag.checkered"
        case .finalized(let p):
            if let p { return p ? "checkmark.seal.fill" : "xmark.seal.fill" }
            return "flag.checkered"
        }
    }

    var isActive: Bool {
        if case .active = self { return true }
        return false
    }

    private static func formatDuration(_ ti: TimeInterval) -> String {
        let total = Int(max(0, ti))
        let d = total / 86400
        let h = (total % 86400) / 3600
        let m = (total % 3600) / 60
        if d > 0 { return "\(d)d \(h)h" }
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m)m"
    }

    static func from(detail: ChallengeDetail, verdictPass: Bool?) -> ChallengePhase {
        // Check finalized status first
        if detail.status == "Finalized" || detail.status == "Canceled" {
            return .finalized(passed: verdictPass)
        }

        let now = Date()

        // Use dates when available
        if let start = detail.startDate, start > now {
            return .upcoming(startsIn: start.timeIntervalSince(now))
        }
        if let end = detail.endsDate, end > now {
            return .active(remaining: end.timeIntervalSince(now))
        }
        if let end = detail.endsDate, end <= now {
            // Challenge period ended
            if let deadline = detail.proofDeadlineDate, deadline > now {
                return .proofWindow(remaining: deadline.timeIntervalSince(now))
            }
            return .ended
        }

        // Dates are nil — fall back to on-chain status
        if detail.isActive {
            return .active(remaining: 0)
        }

        return .ended
    }
}

// MARK: - ChallengeProgressHero

struct ChallengeProgressHero: View {
    let detail: ChallengeDetail
    let participantStatus: ParticipantStatus?
    let healthService: HealthKitService

    @EnvironmentObject private var appState: AppState
    @State private var animatedProgress: Double = 0
    @State private var currentValue: Double = 0
    @State private var goalValue: Double = 0
    @State private var hasLoaded = false
    @State private var figureAppeared = false
    @Environment(\.colorScheme) private var scheme

    private var theme: ActivityTheme { ActivityTheme.from(detail: detail) }
    private var phase: ChallengePhase {
        ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
    }
    private var rules: ChallengeRules? { detail.rules }
    private var metricLabel: String { rules?.metricLabel ?? "km" }

    var body: some View {
        VStack(spacing: LC.space16) {
            // Phase timer pill
            phasePill

            // Progress ring with SF Symbol
            progressRing
                .scaleEffect(figureAppeared ? 1.0 : 0.3)
                .opacity(figureAppeared ? 1.0 : 0.0)

            // Numeric progress below ring
            if goalValue > 0 {
                progressLabel
            }

            // Title
            Text(detail.displayTitle)
                .font(.title3.weight(.bold))
                .multilineTextAlignment(.center)

            if let desc = detail.description, !desc.isEmpty {
                Text(desc)
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }

            // Activity type label when no progress data
            if goalValue == 0 {
                Text(theme.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.figureTint)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(theme.figureTint.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space24)
        .padding(.horizontal, LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .task { await loadProgress() }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.2)) {
                figureAppeared = true
            }
        }
    }

    // MARK: - Phase Pill

    private var phasePill: some View {
        HStack(spacing: 6) {
            Image(systemName: phase.icon)
                .font(.system(size: 10, weight: .bold))
            Text(phase.label)
                .font(.caption2.weight(.bold))
        }
        .foregroundStyle(phase.color)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(phase.color.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - Progress Ring

    private var ringState: RingState {
        // Completed challenge
        if case .finalized(let passed) = phase, passed == true {
            return .complete
        }
        // Has real progress data
        if animatedProgress > 0 {
            return .progress(animatedProgress)
        }
        // Active but no data yet — show empty
        return .empty
    }

    private var progressRing: some View {
        ChallengeProgressRing(
            state: ringState,
            symbol: theme.icon,
            color: theme.barColors.first ?? theme.figureTint,
            diameter: 180,
            lineWidth: 20
        )
    }

    // MARK: - Numeric Progress

    private var progressLabel: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(formatValue(currentValue))
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(theme.barColors.first ?? LC.accent)
            Text("/")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("\(formatValue(goalValue)) \(metricLabel)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))
        }
    }

    // MARK: - Data Loading

    private func loadProgress() async {
        guard !hasLoaded else { return }
        hasLoaded = true

        guard let rules else { return }
        let goal = rules.goalValue
        guard goal > 0 else { return }

        goalValue = goal

        // Determine the date range: challenge start → min(now, challengeEnd)
        let start = detail.startDate ?? detail.endsDate?.addingTimeInterval(-7 * 86400) ?? Date().addingTimeInterval(-7 * 86400)
        let end = min(Date(), detail.endsDate ?? Date())

        guard end > start else { return }

        // 1. Try HealthKit first (on-device data)
        var hkValue: Double = 0
        await healthService.ensureAuthorization()
        await healthService.collectEvidence(from: start, to: end)

        // Capture HealthKit arrays immediately (avoid race with other views)
        let steps = healthService.stepDays
        let distances = healthService.distanceDays
        let cycling = healthService.cyclingDays
        let swimming = healthService.swimmingDays
        let energy = healthService.activeEnergyDays

        switch rules.metric {
        case "steps":
            hkValue = Double(steps.reduce(0) { $0 + $1.steps })
        case "distance", "distance_km":
            hkValue = distances.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "active_minutes":
            hkValue = energy.reduce(0) { $0 + $1.kilocalories } / 5.0
        case "cycling_km":
            hkValue = cycling.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "swimming_km":
            hkValue = swimming.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "hiking_km":
            // Hiking uses walking distance as proxy (HealthKit doesn't separate hiking)
            hkValue = distances.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "strength_sessions":
            // HealthKit doesn't track strength sessions directly — rely on server progress
            hkValue = 0
        default:
            hkValue = Double(steps.reduce(0) { $0 + $1.steps })
        }

        // 2. Fetch server-side progress (from submitted evidence)
        var serverValue: Double = 0
        if appState.hasWallet {
            if let sp = try? await APIClient.shared.fetchMyProgress(
                baseURL: appState.serverURL,
                challengeId: detail.id,
                subject: appState.walletAddress
            ) {
                serverValue = sp.currentValue ?? 0
                // Update goal from server if available (may be more accurate)
                if let sg = sp.goalValue, sg > 0 { goalValue = sg }
            }
        }

        // 3. Use whichever is higher — HealthKit is real-time, server is submitted evidence
        let value = max(hkValue, serverValue)
        currentValue = value
        animatedProgress = min(1.0, value / goalValue)
    }

    private func formatValue(_ value: Double) -> String {
        if value >= 10000 {
            return String(format: "%.0f", value)
        } else if value >= 100 {
            return String(format: "%.0f", value)
        } else if value >= 1 {
            return String(format: "%.1f", value)
        } else {
            return String(format: "%.2f", value)
        }
    }
}
