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
        let title = (detail.title ?? "").lowercased()
        let desc = (detail.description ?? "").lowercased()
        let metric = detail.rules?.metric ?? ""
        let modelId = (detail.modelId ?? "").lowercased()
        let tags = (detail.tags ?? []).map { $0.lowercased() }
        let all = [title, desc, metric, modelId, tags.joined(separator: " ")].joined(separator: " ")

        if all.contains("swim") || all.contains("pool") || all.contains("lap") || metric == "swimming_km" {
            return ActivityTheme(
                icon: "figure.pool.swim",
                label: "Swimming",
                barColors: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)],
                figureTint: Color(hex: 0x06B6D4),
                barBackground: Color(hex: 0x06B6D4).opacity(0.15)
            )
        }
        if all.contains("cycl") || all.contains("bike") || all.contains("ride") || metric == "cycling_km" {
            return ActivityTheme(
                icon: "figure.outdoor.cycle",
                label: "Cycling",
                barColors: [Color(hex: 0xF97316), Color(hex: 0xEA580C)],
                figureTint: Color(hex: 0xF97316),
                barBackground: Color(hex: 0xF97316).opacity(0.15)
            )
        }
        if all.contains("run") || all.contains("marathon") || all.contains("jog") || all.contains("sprint") || all.contains("5k") {
            return ActivityTheme(
                icon: "figure.run",
                label: "Running",
                barColors: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)],
                figureTint: Color(hex: 0x3B82F6),
                barBackground: Color(hex: 0x2563EB).opacity(0.15)
            )
        }
        if all.contains("yoga") || all.contains("stretch") || all.contains("flex") || all.contains("pilates") {
            return ActivityTheme(
                icon: "figure.yoga",
                label: "Yoga",
                barColors: [Color(hex: 0xA855F7), Color(hex: 0x7C3AED)],
                figureTint: Color(hex: 0xA855F7),
                barBackground: Color(hex: 0xA855F7).opacity(0.15)
            )
        }
        if all.contains("strength") || all.contains("lift") || all.contains("weight") || all.contains("gym") || all.contains("push") {
            return ActivityTheme(
                icon: "figure.strengthtraining.traditional",
                label: "Strength",
                barColors: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)],
                figureTint: Color(hex: 0xEF4444),
                barBackground: Color(hex: 0xEF4444).opacity(0.15)
            )
        }
        if all.contains("hik") || all.contains("trail") || all.contains("climb") {
            return ActivityTheme(
                icon: "figure.hiking",
                label: "Hiking",
                barColors: [Color(hex: 0x22C55E), Color(hex: 0x15803D)],
                figureTint: Color(hex: 0x22C55E),
                barBackground: Color(hex: 0x22C55E).opacity(0.15)
            )
        }
        // Default: walking
        return ActivityTheme(
            icon: "figure.walk",
            label: "Walking",
            barColors: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)],
            figureTint: Color(hex: 0x22C55E),
            barBackground: Color(hex: 0x22C55E).opacity(0.15)
        )
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

            // Activity figure
            activityFigure

            // Progress bar — only when we have a goal
            if goalValue > 0 {
                progressBar
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

            // Activity type label when no progress bar
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
            // Trigger figure entrance animation
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

    // MARK: - Activity Figure

    private var activityFigure: some View {
        ActivityFigureView(theme: theme, isActive: phase.isActive)
            .scaleEffect(figureAppeared ? 1.0 : 0.3)
            .opacity(figureAppeared ? 1.0 : 0.0)
            .padding(.vertical, LC.space4)
    }

    // MARK: - Themed Progress Bar

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Track background
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(theme.barBackground)
                    .frame(height: 12)

                // Filled portion with gradient
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: theme.barColors,
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(
                        width: max(0, min(geo.size.width, geo.size.width * animatedProgress)),
                        height: 12
                    )
            }
        }
        .frame(height: 12)
        .padding(.horizontal, LC.space8)
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

        // Collect HealthKit data for the challenge window
        await healthService.ensureAuthorization()
        await healthService.collectEvidence(from: start, to: end)

        // Compute current value based on metric
        let value: Double
        switch rules.metric {
        case "steps":
            value = Double(healthService.stepDays.reduce(0) { $0 + $1.steps })
        case "distance":
            value = healthService.distanceDays.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "active_minutes":
            value = healthService.activeEnergyDays.reduce(0) { $0 + $1.kilocalories } / 5.0
        case "cycling_km":
            value = healthService.cyclingDays.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        case "swimming_km":
            value = healthService.swimmingDays.reduce(0) { $0 + $1.distanceMeters } / 1000.0
        default:
            value = Double(healthService.stepDays.reduce(0) { $0 + $1.steps })
        }

        currentValue = value
        let progress = min(1.0, value / goal)

        // Spring animation — overshoot then settle, like Apple Fitness
        withAnimation(.spring(response: 0.8, dampingFraction: 0.7, blendDuration: 0.3)) {
            animatedProgress = progress
        }
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
