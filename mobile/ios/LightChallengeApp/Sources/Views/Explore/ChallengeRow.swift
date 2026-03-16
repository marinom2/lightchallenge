// ChallengeCard.swift
// Premium challenge card for the explore grid — Cosmic-Glass design.
// Inspired by Strava activity cards + Phantom token cards.

import SwiftUI

struct ChallengeCard: View {
    let challenge: ChallengeMeta
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            // Top row: icon + title + status
            HStack(spacing: LC.space12) {
                // Gradient icon
                Image(systemName: challenge.resolvedCategory.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                            .fill(categoryGradient)
                    )

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text(challenge.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .lineLimit(2)

                    if !challenge.displayDescription.isEmpty {
                        Text(challenge.displayDescription)
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .lineLimit(1)
                    }
                }

                Spacer()

                // Status badge
                if let status = challenge.status {
                    LCStatusBadge(text: status, color: statusColor)
                }
            }

            // Divider
            Rectangle()
                .fill(LC.cardBorder(scheme))
                .frame(height: 0.5)

            // Bottom: metadata pills
            HStack(spacing: LC.space8) {
                if let stake = challenge.stakeDisplay {
                    LCPill(icon: "dollarsign.circle.fill", text: stake, color: LC.gold)
                }

                if let end = challenge.endsDate {
                    let remaining = end.timeIntervalSinceNow
                    if remaining > 0 && remaining < 7 * 86400 {
                        LCPill(icon: "clock.fill", text: end.relativeShort, color: remaining < 86400 ? LC.danger : LC.warning)
                    } else if remaining > 0 {
                        LCPill(icon: "calendar", text: end.formatted(.dateTime.month(.abbreviated).day()), color: LC.textTertiary(scheme))
                    } else {
                        LCPill(icon: "checkmark.circle", text: "Ended", color: LC.textTertiary(scheme))
                    }
                }

                if let tags = challenge.tags, let first = tags.first {
                    LCPill(icon: "tag.fill", text: first, color: LC.gradBlue, small: true)
                }

                Spacer()

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LC.textTertiary(scheme))
            }
        }
        .padding(LC.space16)
        .lcCard()
    }

    private var statusColor: Color {
        switch challenge.status {
        case "Active": LC.success
        case "Finalized": LC.info
        case "Canceled": LC.danger
        default: LC.textTertiary(scheme)
        }
    }

    private var categoryGradient: LinearGradient {
        switch challenge.resolvedCategory {
        case .fitness:
            LC.fitnessGradient
        case .gaming:
            LC.gamingGradient
        case .social:
            LC.socialGradient
        default:
            LC.brandGradient
        }
    }
}

// MARK: - Date Extension

extension Date {
    var relativeShort: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}
