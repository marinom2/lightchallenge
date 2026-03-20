// ChallengeProgressHero.swift
// Unified hero card: ring + title + status + prize + insight + action.
// Communicates in 2 seconds: what, state, stakes, next step.

import Combine
import SwiftUI

// MARK: - Activity Theme

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
            barColors: [Color(hex: 0x8B5CF6), Color(hex: 0x7C3AED)],
            figureTint: Color(hex: 0x8B5CF6), barBackground: Color(hex: 0x8B5CF6).opacity(0.15))
        let walkTheme = ActivityTheme(icon: "figure.walk", label: "Walking",
            barColors: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)],
            figureTint: Color(hex: 0x22C55E), barBackground: Color(hex: 0x22C55E).opacity(0.15))
        let yogaTheme = ActivityTheme(icon: "figure.yoga", label: "Yoga",
            barColors: [Color(hex: 0xA855F7), Color(hex: 0x9333EA)],
            figureTint: Color(hex: 0xA855F7), barBackground: Color(hex: 0xA855F7).opacity(0.15))
        let hiitTheme = ActivityTheme(icon: "figure.highintensity.intervaltraining", label: "HIIT",
            barColors: [Color(hex: 0xF43F5E), Color(hex: 0xE11D48)],
            figureTint: Color(hex: 0xF43F5E), barBackground: Color(hex: 0xF43F5E).opacity(0.15))
        let rowingTheme = ActivityTheme(icon: "figure.rowing", label: "Rowing",
            barColors: [Color(hex: 0x0EA5E9), Color(hex: 0x0284C7)],
            figureTint: Color(hex: 0x0EA5E9), barBackground: Color(hex: 0x0EA5E9).opacity(0.15))
        let caloriesTheme = ActivityTheme(icon: "flame.fill", label: "Calories",
            barColors: [Color(hex: 0xF59E0B), Color(hex: 0xD97706)],
            figureTint: Color(hex: 0xF59E0B), barBackground: Color(hex: 0xF59E0B).opacity(0.15))
        let exerciseTheme = ActivityTheme(icon: "heart.circle.fill", label: "Exercise",
            barColors: [Color(hex: 0x10B981), Color(hex: 0x059669)],
            figureTint: Color(hex: 0x10B981), barBackground: Color(hex: 0x10B981).opacity(0.15))

        let modelId = (detail.modelId ?? "").lowercased()
        if modelId.contains("swimming")  { return swimTheme }
        if modelId.contains("cycling")   { return cycleTheme }
        if modelId.contains("distance")  { return runTheme }
        if modelId.contains("strength")  { return strTheme }
        if modelId.contains("hiking")    { return hikeTheme }
        if modelId.contains("yoga")      { return yogaTheme }
        if modelId.contains("hiit")      { return hiitTheme }
        if modelId.contains("rowing")    { return rowingTheme }
        if modelId.contains("calories")  { return caloriesTheme }
        if modelId.contains("exercise")  { return exerciseTheme }
        if modelId.contains("walking")   { return walkTheme }
        if modelId.contains("steps")     { return walkTheme }

        let metric = detail.rules?.metric ?? ""
        if metric == "swimming_km"       { return swimTheme }
        if metric == "cycling_km"        { return cycleTheme }
        if metric == "distance" || metric == "distance_km" { return runTheme }
        if metric == "walking_km"        { return walkTheme }
        if metric == "strength_sessions" { return strTheme }
        if metric == "hiking_km"         { return hikeTheme }
        if metric == "yoga_min"          { return yogaTheme }
        if metric == "hiit_min"          { return hiitTheme }
        if metric == "rowing_km"         { return rowingTheme }
        if metric == "exercise_time"     { return exerciseTheme }
        if metric == "calories"          { return caloriesTheme }
        if metric == "steps"             { return walkTheme }

        let tags = (detail.tags ?? []).joined(separator: " ").lowercased()
        if tags.contains("swimming")  { return swimTheme }
        if tags.contains("cycling")   { return cycleTheme }
        if tags.contains("running")   { return runTheme }
        if tags.contains("strength")  { return strTheme }
        if tags.contains("hiking")    { return hikeTheme }
        if tags.contains("yoga")      { return yogaTheme }
        if tags.contains("hiit")      { return hiitTheme }
        if tags.contains("rowing")    { return rowingTheme }
        if tags.contains("calories")  { return caloriesTheme }
        if tags.contains("walking")   { return walkTheme }

        let text = [(detail.title ?? ""), (detail.description ?? "")].joined(separator: " ").lowercased()
        if text.contains("swim") || text.contains("pool")  { return swimTheme }
        if text.contains("cycl") || text.contains("bike") || text.contains("ride") { return cycleTheme }
        if text.contains("run")  || text.contains("marathon") || text.contains("jog") { return runTheme }
        if text.contains("strength") || text.contains("lift") || text.contains("weight") { return strTheme }
        if text.contains("hik")  || text.contains("trail") || text.contains("climb") { return hikeTheme }
        if text.contains("yoga") || text.contains("meditat") { return yogaTheme }
        if text.contains("hiit") || text.contains("crossfit") || text.contains("interval") { return hiitTheme }
        if text.contains("row")  || text.contains("ergometer") { return rowingTheme }
        if text.contains("calori") || text.contains("burn") { return caloriesTheme }

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
            if ti <= 0 { return "Active" }
            return "\(Self.formatDuration(ti)) left"
        case .proofWindow(let ti):
            if ti <= 0 { return "Submit Proof" }
            return "\(Self.formatDuration(ti)) to submit"
        case .ended:
            return "Ended"
        case .finalized(let passed):
            if let p = passed { return p ? "Completed" : "Failed" }
            return "Finalized"
        }
    }

    var statusLabel: String {
        switch self {
        case .upcoming: return "Upcoming"
        case .active: return "Active"
        case .proofWindow: return "Awaiting Proof"
        case .ended: return "Ended"
        case .finalized(let p):
            if let p { return p ? "Completed" : "Failed" }
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

    /// Ring progress fraction for this phase (decorative when no real progress data).
    var ringFraction: Double {
        switch self {
        case .upcoming: return 0
        case .active: return 0.15
        case .proofWindow: return 0.75
        case .ended: return 0.5
        case .finalized(let p):
            return (p == true) ? 1.0 : 0.5
        }
    }

    /// Whether the ring should appear dimmed/desaturated.
    var ringDimmed: Bool {
        switch self {
        case .ended: return true
        case .finalized(let p): return p != true
        default: return false
        }
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
        if detail.status == "Finalized" || detail.status == "Canceled" {
            return .finalized(passed: verdictPass)
        }

        let now = Date()

        if let start = detail.startDate, start > now {
            return .upcoming(startsIn: start.timeIntervalSince(now))
        }
        if let end = detail.endsDate, end > now {
            return .active(remaining: end.timeIntervalSince(now))
        }
        if let end = detail.endsDate, end <= now {
            if let deadline = detail.proofDeadlineDate, deadline > now {
                return .proofWindow(remaining: deadline.timeIntervalSince(now))
            }
            return .ended
        }

        // No end date but status is Active — check proof deadline as a fallback.
        // If the proof deadline has passed, the challenge is effectively ended.
        if let deadline = detail.proofDeadlineDate, deadline <= now {
            return .ended
        }

        if detail.isActive {
            return .active(remaining: 0)
        }

        return .ended
    }
}

// MARK: - User Challenge State

enum UserChallengeState {
    case notJoined
    case upcoming           // joined but challenge hasn't started
    case active
    case awaitingProof
    case awaitingVerdict
    case submitted          // evidence sent, proof window closed, awaiting pipeline
    case completed
    case failed
    case ended

    var label: String {
        switch self {
        case .notJoined: return "Not Joined"
        case .upcoming: return "Upcoming"
        case .active: return "Active"
        case .awaitingProof: return "Awaiting Proof"
        case .awaitingVerdict: return "Verifying"
        case .submitted: return "Submitted"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .ended: return "Ended"
        }
    }

    var secondaryLabel: String? {
        switch self {
        case .awaitingProof: return "Submit your proof"
        case .submitted: return "Awaiting finalization"
        default: return nil
        }
    }

    /// Map server-computed resolved stage to UserChallengeState.
    /// Returns nil if the resolved field is absent or unrecognized (caller falls back to local logic).
    static func fromResolved(_ resolved: ResolvedStage?) -> UserChallengeState? {
        guard let stage = resolved?.stage else { return nil }
        switch stage {
        case "ACTIVE":              return .active
        case "NEEDS_PROOF":         return .awaitingProof
        case "NEEDS_PROOF_URGENT":  return .awaitingProof
        case "SUBMITTED":           return .submitted
        case "VERIFIED":            return .awaitingVerdict
        case "PASSED":              return .completed
        case "FAILED":              return .failed
        case "REWARD_EARNED":       return .completed
        case "CLAIMABLE":           return .completed
        case "CLAIMED":             return .completed
        case "ENDED":               return .ended
        default:                    return nil
        }
    }

    static func from(detail: ChallengeDetail, participantStatus: ParticipantStatus?, phase: ChallengePhase, autoProofSubmitted: Bool = false) -> UserChallengeState {
        // Primary join signal: on-chain Joined event via the API.
        // Fallback: if the user has a participantStatus with evidence or a verdict,
        // they must have joined (covers edge cases where youJoined hasn't synced yet).
        let joined = detail.youJoined == true
            || participantStatus?.hasEvidence == true
            || participantStatus?.verdictPass != nil

        // Verdict takes precedence — but ONLY after the proof deadline has passed.
        // During active phase and proof window, the pipeline hasn't finalized,
        // so any premature verdict is unreliable and should not drive the UI.
        let proofDeadlinePassed: Bool = {
            if case .active = phase { return false }
            if case .upcoming = phase { return false }
            if case .proofWindow = phase { return false }
            return true
        }()
        if proofDeadlinePassed, let pass = participantStatus?.verdictPass {
            return pass ? .completed : .failed
        }

        // Evidence is submitted if either the DB says so OR auto-proof service confirms it.
        let hasEvidence = participantStatus?.hasEvidence == true || autoProofSubmitted

        if joined {
            if hasEvidence {
                // Evidence submitted but no verdict yet.
                // Phase-aware status:
                // - Upcoming: challenge hasn't started → show Upcoming (not Active)
                // - Active: challenge still running → show Active (not Verifying)
                // - ProofWindow: challenge ended, proof deadline open → Verifying
                // - Ended/Finalized: proof deadline passed → Submitted (awaiting pipeline)
                switch phase {
                case .upcoming:
                    return .upcoming
                case .active:
                    return .active
                case .proofWindow:
                    return .awaitingVerdict
                case .ended, .finalized:
                    return .submitted
                }
            }
            switch phase {
            case .upcoming: return .upcoming
            case .active: return .active
            case .proofWindow: return .awaitingProof
            case .ended, .finalized: return .ended
            }
        }

        if case .finalized = phase { return .ended }
        if case .ended = phase { return .ended }

        // Safety: if the challenge end date has passed, show ended regardless of phase.
        // This handles the edge case where endsDate is nil but the challenge is effectively over
        // (e.g. status "Active" on-chain but proofDeadline has passed).
        if let end = detail.endsDate, end <= Date() { return .ended }
        if let deadline = detail.proofDeadlineDate, deadline <= Date() { return .ended }

        return .notJoined
    }
}

// MARK: - ChallengeProgressHero

struct ChallengeProgressHero: View {
    let detail: ChallengeDetail
    let participantStatus: ParticipantStatus?
    let participantLoaded: Bool
    let healthService: HealthKitService
    let progress: ChallengeProgress?
    let tokenPrice: Double?
    var autoProofSubmitted: Bool = false
    let onAction: (HeroAction) -> Void

    @EnvironmentObject private var appState: AppState
    @State private var animatedProgress: Double = 0
    @State private var currentValue: Double = 0
    @State private var goalValue: Double = 0
    @State private var activitySummary: [(label: String, value: Double, unit: String)] = []
    @State private var hasLoaded = false
    @State private var figureAppeared = false
    @Environment(\.colorScheme) private var scheme

    private var theme: ActivityTheme { ActivityTheme.from(detail: detail) }
    private var phase: ChallengePhase {
        ChallengePhase.from(detail: detail, verdictPass: participantStatus?.verdictPass)
    }
    private var userState: UserChallengeState {
        // Prefer server-computed resolved state; fall back to local derivation
        if let resolved = UserChallengeState.fromResolved(participantStatus?.resolved) {
            return resolved
        }
        return UserChallengeState.from(detail: detail, participantStatus: participantStatus, phase: phase, autoProofSubmitted: autoProofSubmitted)
    }
    private var rules: ChallengeRules? { detail.rules }
    private var metricLabel: String { rules?.metricLabel ?? "" }


    var body: some View {
        VStack(spacing: LC.space20) {
            // Progress ring — tappable for detail
            progressRing
                .scaleEffect(figureAppeared ? 1.0 : 0.3)
                .opacity(figureAppeared ? 1.0 : 0.0)
                .contentShape(Circle())
                .onTapGesture { onAction(.viewProgress) }

            // Status label first for ended/upcoming states (hierarchy: state → data)
            if userState == .completed || userState == .failed || userState == .upcoming {
                systemStateLine
            }

            // Steps + goal (hidden for upcoming — no progress yet)
            if userState != .upcoming {
                VStack(spacing: LC.space4) {
                    if goalValue > 0 {
                        progressLabel
                    } else if !activitySummary.isEmpty {
                        activitySummaryLabel
                    }
                }
            }

            // System state for active states (verifying, submitted, time remaining)
            if userState != .completed && userState != .failed && userState != .upcoming {
                systemStateLine
            }

            // Reward + participants
            rewardLine

            // Primary action
            actionButton
        }
        .padding(.horizontal, LC.space24)
        .padding(.vertical, LC.space20)
        .lcMaterialCard()
        .task { await loadProgress() }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.15)) {
                figureAppeared = true
            }
        }
    }

    // MARK: - System State Line (single source of truth)

    @ViewBuilder
    private var systemStateLine: some View {
        if userState == .upcoming, case .upcoming(let startsIn) = phase {
            Text(upcomingCountdownText(startsIn))
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        } else if userState == .awaitingVerdict {
            AnimatedVerifyingText()
        } else if userState == .submitted {
            Text("Awaiting finalization")
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        } else if userState == .completed {
            Text("Challenge completed")
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        } else if userState == .failed {
            Text("Challenge failed")
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        } else if case .active(let remaining) = phase, remaining > 0 {
            Text(phase.label)
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        } else if case .proofWindow(let remaining) = phase, remaining > 0, userState == .awaitingProof {
            Text(phase.label)
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textTertiary(scheme))
        }
    }

    private func upcomingCountdownText(_ startsIn: TimeInterval) -> String {
        let total = Int(max(0, startsIn))
        let d = total / 86400
        let h = (total % 86400) / 3600
        let m = (total % 3600) / 60
        if d > 0 { return "Starts in \(d)d \(h)h" }
        if h > 0 { return "Starts in \(h)h \(m)m" }
        if m > 0 { return "Starts in \(m)m" }
        return "Starting soon"
    }

    // MARK: - Progress Ring

    private var ringState: RingState {
        // Completed — full ring with checkmark
        if userState == .completed {
            return .completed
        }
        if case .finalized(let passed) = phase, passed == true {
            return .completed
        }
        // Failed — dimmed ring at final progress
        if userState == .failed {
            return .failed(animatedProgress > 0 ? animatedProgress : phase.ringFraction)
        }
        // Verifying — soft pulse on arc
        if userState == .awaitingVerdict || userState == .submitted {
            return .verifying(animatedProgress > 0 ? animatedProgress : phase.ringFraction)
        }
        // Tracking — standard progress
        if animatedProgress > 0 {
            return .tracking(animatedProgress)
        }
        if phase.ringDimmed {
            return .tracking(phase.ringFraction)
        }
        return .empty
    }

    private var ringColor: Color {
        if phase.ringDimmed && userState != .failed { return .secondary.opacity(0.5) }
        let base = theme.barColors.first ?? theme.figureTint
        return base.opacity(0.85)
    }

    private var progressRing: some View {
        ChallengeProgressRing(
            state: ringState,
            symbol: theme.icon,
            color: ringColor,
            diameter: 110,
            lineWidth: 6
        )
    }

    // MARK: - Activity Summary (no rules)

    private var activitySummaryLabel: some View {
        let parts = activitySummary.prefix(3).map { item in
            "\(formatValue(item.value)) \(item.unit)"
        }
        return Text(parts.joined(separator: " · "))
            .font(.caption.weight(.semibold))
            .foregroundStyle(theme.figureTint)
    }

    // MARK: - Numeric Progress

    private var progressLabel: some View {
        let isEnded = userState == .completed || userState == .failed
        let pct = goalValue > 0 ? Int((currentValue / goalValue) * 100) : 0
        let diff = currentValue - goalValue

        return VStack(spacing: 2) {
            // Primary: current / target metric
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(formatValueWithCommas(currentValue))
                    .font(isEnded ? .subheadline.weight(.semibold).monospacedDigit() : .title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(LC.textPrimary(scheme))
                Text("/ \(formatValueWithCommas(goalValue)) \(metricLabel)")
                    .font(isEnded ? .caption.weight(.medium) : .subheadline.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
            }

            // Secondary: percentage + remaining/above/short
            if goalValue > 0 {
                if diff >= 0 {
                    Text("\(pct)% · \(formatValueWithCommas(diff)) above target")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                } else {
                    Text("\(pct)% · \(formatValueWithCommas(abs(diff))) \(isEnded ? "short of target" : "to go")")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
        }
    }

    // MARK: - Reward Line (clean inline — no boxes)

    @ViewBuilder
    private var rewardLine: some View {
        let hasReward = detail.poolDisplayUSD(tokenPrice: tokenPrice) != nil
            || detail.stakeDisplayUSD(tokenPrice: tokenPrice) != nil
        let hasParticipants = (detail.participantsCount ?? 0) > 0

        if hasReward || hasParticipants {
            HStack(alignment: .firstTextBaseline) {
                // Reward — clean value-first format
                if let pool = detail.poolDisplayUSD(tokenPrice: tokenPrice) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(pool)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                        HStack(spacing: LC.space4) {
                            if let lcai = detail.poolDisplay {
                                Text("\u{2248} \(lcai)")
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(LC.textTertiary(scheme))
                                Text("\u{00B7}")
                                    .font(.caption2)
                                    .foregroundStyle(LC.textTertiary(scheme))
                            }
                            Text("Potential reward")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(LC.textTertiary(scheme))
                        }
                    }
                } else if let stake = detail.stakeDisplayUSD(tokenPrice: tokenPrice) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stake)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                        HStack(spacing: LC.space4) {
                            if let lcai = detail.stakeDisplay {
                                Text("\u{2248} \(lcai)")
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(LC.textTertiary(scheme))
                                Text("\u{00B7}")
                                    .font(.caption2)
                                    .foregroundStyle(LC.textTertiary(scheme))
                            }
                            Text("Entry stake")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(LC.textTertiary(scheme))
                        }
                    }
                }

                Spacer()

                // Participants
                if let count = detail.participantsCount, count > 0 {
                    Text("\(count) participant\(count == 1 ? "" : "s")")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
        }
    }

    // MARK: - Action Button

    /// Whether the challenge is still joinable (end date not passed, status active).
    private var isJoinable: Bool {
        // Can't join if end date has passed
        if let end = detail.endsDate, end <= Date() { return false }
        // Can't join if proof deadline has passed
        if let deadline = detail.proofDeadlineDate, deadline <= Date() { return false }
        // Can't join if finalized/canceled
        if detail.status == "Finalized" || detail.status == "Canceled" { return false }
        return true
    }

    @ViewBuilder
    private var actionButton: some View {
        switch userState {
        case .notJoined:
            if !participantLoaded {
                ProgressView()
                    .tint(LC.accent)
                    .frame(maxWidth: .infinity, minHeight: 50)
            } else if isJoinable {
                Button {
                    onAction(.join)
                } label: {
                    Text("Join Challenge")
                }
                .buttonStyle(LCGoldButton())
            } else {
                Button {
                    onAction(.viewResults)
                } label: {
                    Text("View Details")
                }
                .buttonStyle(LCSecondaryButton())
            }

        case .upcoming:
            // Passive pre-start — no action needed
            EmptyView()

        case .active:
            if case .proofWindow = phase {
                Button {
                    onAction(.submitProof)
                } label: {
                    Label("Submit Proof", systemImage: "arrow.up.doc.fill")
                }
                .buttonStyle(LCGoldButton())
            } else {
                // Challenge in progress — no action needed yet
                EmptyView()
            }

        case .awaitingProof:
            Button {
                onAction(.submitProof)
            } label: {
                Label("Submit Proof", systemImage: "arrow.up.doc.fill")
            }
            .buttonStyle(LCGoldButton())

        case .awaitingVerdict, .submitted:
            // No action — awaiting AI verification / finalization
            EmptyView()

        case .completed:
            // Claim button only shown by the completedCard in ChallengeDetailView
            // which checks on-chain eligibility. Hero just shows share.
            Button {
                onAction(.share)
            } label: {
                Label("Share Result", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(LCSecondaryButton())

        case .failed:
            Button {
                onAction(.viewResults)
            } label: {
                Text("View Results")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LC.textTertiary(scheme))
            }

        case .ended:
            Button {
                onAction(.viewResults)
            } label: {
                Text("View Details")
            }
            .buttonStyle(LCSecondaryButton())
        }
    }

    // MARK: - Data Loading

    private func loadProgress() async {
        guard !hasLoaded else { return }
        hasLoaded = true

        let challengeStart = detail.startDate ?? detail.endsDate?.addingTimeInterval(-7 * 86400) ?? Date().addingTimeInterval(-7 * 86400)
        let start = challengeStart
        // Use exact challenge end time for ended challenges, now for active ones
        let challengeEnd = detail.endsDate ?? Date()
        let end = challengeEnd < Date() ? challengeEnd : Date()
        guard end >= start else { return }

        await healthService.ensureAuthorization()

        if let r = rules, r.goalValue > 0 {
            // Focused mode: known rules → standalone query for this challenge's period
            goalValue = r.goalValue
            let hkValue = await healthService.queryMetricTotal(r.metric ?? "steps", from: start, to: end)

            // Check server value too
            var serverValue: Double = 0
            if appState.hasWallet {
                if let sp = try? await APIClient.shared.fetchMyProgress(
                    baseURL: appState.serverURL,
                    challengeId: detail.id,
                    subject: appState.walletAddress
                ) {
                    serverValue = sp.currentValue ?? 0
                    if let sg = sp.goalValue, sg > 0 { goalValue = sg }
                }
            }

            let value = max(hkValue, serverValue)
            currentValue = value
            animatedProgress = goalValue > 0 ? min(1.0, value / goalValue) : 0
        } else {
            // Discovery mode: standalone query for all activity
            let allActivity = await healthService.queryAllActivity(from: start, to: end)
            activitySummary = allActivity.map { ($0.label, $0.total, $0.unit) }

            // Show activity-present state on ring (no percentage since no goal)
            if !activitySummary.isEmpty {
                animatedProgress = 0.15 // subtle activity indicator
            }
        }
    }

    private func formatValue(_ value: Double) -> String {
        if value >= 10000 { return String(format: "%.0f", value) }
        if value >= 100 { return String(format: "%.0f", value) }
        if value >= 1 { return String(format: "%.1f", value) }
        return String(format: "%.2f", value)
    }

    private func formatValueWithCommas(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value >= 100 ? 0 : (value >= 1 ? 1 : 2)
        return formatter.string(from: NSNumber(value: value)) ?? formatValue(value)
    }
}

// MARK: - Hero Action

enum HeroAction {
    case join
    case submitProof
    case claimReward
    case viewResults
    case viewProgress
    case share
}

// MARK: - Animated Verifying Text

/// Subtle "Verifying activity…" with cycling ellipsis — calm system state.
struct AnimatedVerifyingText: View {
    @State private var dotCount = 0
    @Environment(\.colorScheme) private var scheme

    private var dots: String {
        String(repeating: ".", count: (dotCount % 3) + 1)
    }

    var body: some View {
        Text("Verifying activity\(dots)")
            .font(.caption.weight(.medium))
            .foregroundStyle(LC.textTertiary(scheme))
            .onReceive(Timer.publish(every: 0.7, on: .main, in: .common).autoconnect()) { _ in
                dotCount += 1
            }
    }
}
