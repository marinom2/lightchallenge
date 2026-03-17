// CategoryDetailView.swift
// Apple Music-style category detail — hero + featured scroll + all challenges list.
// Reached by tapping a category card on the Explore grid.

import SwiftUI

struct CategoryDetailView: View {
    let fitnessType: FitnessType
    let challenges: [ChallengeMeta]
    let myActivities: [String: MyChallenge]
    let eligibility: [String: ContractService.ClaimEligibility]
    @EnvironmentObject private var appState: AppState

    @Environment(\.colorScheme) private var scheme

    private var categoryChallenges: [ChallengeMeta] {
        challenges.filter { fitnessType.matches($0) }
    }

    private var activeChallenges: [ChallengeMeta] {
        categoryChallenges.filter { $0.isActive }
    }

    private var featuredChallenges: [ChallengeMeta] {
        Array(activeChallenges.prefix(5))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: LC.space24) {
                // Hero card
                heroSection

                // Featured horizontal scroll
                if featuredChallenges.count > 1 {
                    sectionTitle("Featured")
                    featuredScroll
                }

                // All Challenges
                sectionTitle("All Challenges")
                allChallengesList
            }
            .padding(.bottom, LC.space32)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(fitnessType.label)
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Hero

    private var heroSection: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                // Gradient background
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: fitnessType.gradient,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(height: 200)

                // Decorative icon
                Image(systemName: fitnessType.icon)
                    .font(.system(size: 120, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.15))
                    .offset(x: 140, y: 10)

                // Content
                VStack(alignment: .leading, spacing: LC.space8) {
                    Image(systemName: fitnessType.icon)
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(.white)

                    Text(fitnessType.label)
                        .font(.title.weight(.bold))
                        .foregroundStyle(.white)

                    Text("\(activeChallenges.count) active challenge\(activeChallenges.count == 1 ? "" : "s")")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .padding(LC.space20)
            }
        }
        .padding(.horizontal, LC.space16)
    }

    // MARK: - Section Title

    private func sectionTitle(_ title: String) -> some View {
        HStack {
            Text(title)
                .font(.title3.weight(.bold))
            Spacer()
        }
        .padding(.horizontal, LC.space16)
    }

    // MARK: - Featured Scroll

    private var featuredScroll: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LC.space12) {
                ForEach(featuredChallenges) { challenge in
                    NavigationLink(value: challenge.id) {
                        featuredCard(challenge)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, LC.space16)
        }
    }

    private func featuredCard(_ challenge: ChallengeMeta) -> some View {
        VStack(alignment: .leading, spacing: LC.space8) {
            // Category gradient header strip
            ZStack(alignment: .bottomLeading) {
                LinearGradient(
                    colors: fitnessType.gradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .frame(height: 80)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: LC.radiusLG,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: LC.radiusLG
                    )
                )

                Image(systemName: fitnessType.icon)
                    .font(.system(size: 40, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.3))
                    .offset(x: 130, y: 5)
            }

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(challenge.displayTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(2)

                if let stake = challenge.stakeDisplay {
                    HStack(spacing: LC.space4) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9))
                        Text(stake)
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundStyle(LC.textSecondary(scheme))
                }
            }
            .padding(.horizontal, LC.space12)
            .padding(.bottom, LC.space12)
        }
        .frame(width: 200)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - All Challenges List

    private var allChallengesList: some View {
        LazyVStack(spacing: LC.space12) {
            if categoryChallenges.isEmpty {
                emptyState
            } else {
                ForEach(categoryChallenges) { challenge in
                    NavigationLink(value: challenge.id) {
                        challengeRow(challenge)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, LC.space16)
    }

    private func challengeRow(_ challenge: ChallengeMeta) -> some View {
        HStack(spacing: LC.space12) {
            // Category icon
            Image(systemName: fitnessType.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: fitnessType.gradient,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(challenge.displayTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)

                HStack(spacing: LC.space8) {
                    if let stake = challenge.stakeDisplay {
                        Text(stake)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                    if let end = challenge.endsDate, end.timeIntervalSinceNow > 0 {
                        Text(end.relativeShort)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
            }

            Spacer()

            // Status
            if challenge.isActive {
                LCStatusBadge(text: "Active", color: LC.success)
            } else {
                LCStatusBadge(text: challenge.status ?? "Ended", color: LC.textTertiary(scheme))
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(LC.textTertiary(scheme))
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: fitnessType.icon)
                .font(.system(size: 40))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("No \(fitnessType.label) challenges yet")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity)
    }
}
