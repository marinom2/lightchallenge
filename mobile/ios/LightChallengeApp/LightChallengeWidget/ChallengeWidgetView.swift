// ChallengeWidgetView.swift
// Widget UI — shows challenge title, phase, and countdown timer.
// Adapts between small and medium widget families.

import SwiftUI
import WidgetKit

struct ChallengeWidgetView: View {
    let entry: ChallengeEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if entry.isEmpty || entry.challenge == nil {
            emptyView
        } else if let challenge = entry.challenge {
            switch family {
            case .systemSmall:
                smallWidget(challenge)
            case .systemMedium:
                mediumWidget(challenge)
            default:
                smallWidget(challenge)
            }
        }
    }

    // MARK: - Small Widget

    private func smallWidget(_ challenge: WidgetChallengeData) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Phase badge
            HStack(spacing: 4) {
                Circle()
                    .fill(phaseColor(challenge.phase))
                    .frame(width: 6, height: 6)
                Text(challenge.phase)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(phaseColor(challenge.phase))
            }

            Spacer(minLength: 0)

            // Title
            Text(challenge.title)
                .font(.system(size: 14, weight: .bold))
                .lineLimit(2)
                .foregroundStyle(.primary)

            Spacer(minLength: 0)

            // Countdown
            let phaseEnd = Date(timeIntervalSince1970: challenge.phaseEndTimestamp)
            if phaseEnd > Date() {
                Text(phaseEnd, style: .timer)
                    .font(.system(size: 20, weight: .bold, design: .monospaced))
                    .foregroundStyle(phaseTimerColor(challenge.phase))
                    .minimumScaleFactor(0.7)
                Text("remaining")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)
            } else {
                Text("Ended")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetBackground()
        .widgetURL(URL(string: "lightchallengeapp://challenge/\(challenge.challengeId)"))
    }

    // MARK: - Medium Widget

    private func mediumWidget(_ challenge: WidgetChallengeData) -> some View {
        HStack(spacing: 12) {
            // Left column: title + phase
            VStack(alignment: .leading, spacing: 6) {
                // Phase badge
                HStack(spacing: 4) {
                    Circle()
                        .fill(phaseColor(challenge.phase))
                        .frame(width: 6, height: 6)
                    Text(challenge.phase)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(phaseColor(challenge.phase))
                }

                Spacer(minLength: 0)

                Text(challenge.title)
                    .font(.system(size: 15, weight: .bold))
                    .lineLimit(2)
                    .foregroundStyle(.primary)

                if let stake = challenge.stakeDisplay {
                    HStack(spacing: 3) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9))
                        Text(stake)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            Spacer(minLength: 0)

            // Right column: countdown circle
            let phaseEnd = Date(timeIntervalSince1970: challenge.phaseEndTimestamp)
            VStack(spacing: 4) {
                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .stroke(phaseColor(challenge.phase).opacity(0.15), lineWidth: 4)
                        .frame(width: 80, height: 80)

                    Circle()
                        .trim(from: 0, to: countdownProgress(challenge))
                        .stroke(
                            phaseColor(challenge.phase),
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 1) {
                        if phaseEnd > Date() {
                            Text(phaseEnd, style: .timer)
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .minimumScaleFactor(0.5)
                                .foregroundStyle(phaseTimerColor(challenge.phase))
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Text(phaseEnd > Date() ? "remaining" : "ended")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)

                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetBackground()
        .widgetURL(URL(string: "lightchallengeapp://challenge/\(challenge.challengeId)"))
    }

    // MARK: - Empty State

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "flame")
                .font(.system(size: 28))
                .foregroundStyle(Color(red: 0.15, green: 0.39, blue: 0.92)) // LC.accent
            Text("No Active Challenge")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.primary)
            Text("Join a challenge to see your countdown here.")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetBackground()
    }

    // MARK: - Helpers

    private func phaseColor(_ phase: String) -> Color {
        switch phase {
        case "In Progress":
            return Color(red: 0.15, green: 0.39, blue: 0.92) // LC.accent
        case "Proof Window":
            return Color(red: 0.92, green: 0.70, blue: 0.03) // LC.warning
        case "Ended", "Finalized":
            return .secondary
        default:
            return Color(red: 0.15, green: 0.39, blue: 0.92)
        }
    }

    private func phaseTimerColor(_ phase: String) -> Color {
        switch phase {
        case "Proof Window":
            return Color(red: 0.92, green: 0.70, blue: 0.03)
        default:
            return .primary
        }
    }

    /// Rough countdown progress (0..1) based on how much time remains in the phase.
    /// Uses a 7-day max assumption since we don't know the phase start time.
    private func countdownProgress(_ challenge: WidgetChallengeData) -> CGFloat {
        let phaseEnd = Date(timeIntervalSince1970: challenge.phaseEndTimestamp)
        let remaining = phaseEnd.timeIntervalSinceNow
        guard remaining > 0 else { return 0 }
        // Assume max 7-day phase duration for the progress ring
        let maxDuration: TimeInterval = 7 * 24 * 3600
        return CGFloat(min(1, remaining / maxDuration))
    }
}

// MARK: - Widget Background (iOS 17+ containerBackground)

extension View {
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) {
                Color(.systemBackground)
            }
        } else {
            self.background(Color(.systemBackground))
        }
    }
}

// MARK: - Preview

#Preview("Small", as: .systemSmall) {
    ChallengeCountdownWidget()
} timeline: {
    ChallengeEntry.placeholder
    ChallengeEntry.empty
}

#Preview("Medium", as: .systemMedium) {
    ChallengeCountdownWidget()
} timeline: {
    ChallengeEntry.placeholder
    ChallengeEntry.empty
}
