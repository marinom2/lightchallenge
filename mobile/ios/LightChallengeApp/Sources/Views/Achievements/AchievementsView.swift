// AchievementsView.swift
// Trophy cabinet — badges, reputation level, milestones, shareable cards.
// Inspired by Apple Fitness Awards + Peloton badges + Strava stats.

import SwiftUI

struct AchievementsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var avatarService: AvatarService

    @State private var achievements: [Achievement] = []
    @State private var reputation: Reputation = .empty
    @State private var claims: [Claim] = []
    @State private var competitionStats: CompetitionStats = .empty
    @State private var isLoading = false
    @State private var shareTarget: Achievement?
    @State private var showingAvatarPicker = false
    @Environment(\.colorScheme) private var scheme

    private let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    /// Dummy achievements for preview when user has none yet.
    private static let dummyAchievements: [Achievement] = [
        Achievement(tokenId: "demo-1", challengeId: "1", recipient: nil, achievementType: "first_win", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-2", challengeId: "2", recipient: nil, achievementType: "completion", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-3", challengeId: "3", recipient: nil, achievementType: "participation", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-4", challengeId: "4", recipient: nil, achievementType: "victory", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-5", challengeId: "5", recipient: nil, achievementType: "early_adopter", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-6", challengeId: "6", recipient: nil, achievementType: "explorer", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-7", challengeId: "7", recipient: nil, achievementType: "speedrun", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-8", challengeId: "8", recipient: nil, achievementType: "comeback", txHash: nil, blockNumber: nil, mintedAt: nil),
        Achievement(tokenId: "demo-9", challengeId: "9", recipient: nil, achievementType: "social", txHash: nil, blockNumber: nil, mintedAt: nil),
    ]

    private var displayAchievements: [Achievement] {
        achievements.isEmpty ? Self.dummyAchievements : achievements
    }

    private var showingDummyBadges: Bool { achievements.isEmpty }

    private var totalEarningsLCAI: Double {
        claims.reduce(0) { $0 + $1.amountLCAI }
    }

    private var totalEarningsDisplay: String {
        if totalEarningsLCAI >= 1000 {
            return String(format: "%.0f LCAI", totalEarningsLCAI)
        } else if totalEarningsLCAI >= 1 {
            return String(format: "%.2f LCAI", totalEarningsLCAI)
        } else if totalEarningsLCAI >= 0.01 {
            return String(format: "%.3f LCAI", totalEarningsLCAI)
        } else if totalEarningsLCAI > 0 {
            return String(format: "%.4f LCAI", totalEarningsLCAI)
        }
        return "0 LCAI"
    }

    var body: some View {
        NavigationStack {
            Group {
                if !appState.hasWallet {
                    connectPrompt
                } else if isLoading && achievements.isEmpty {
                    loadingView
                } else {
                    achievementContent
                }
            }
            .background {
                Color(.systemGroupedBackground).ignoresSafeArea()
                LCAmbientGlow().ignoresSafeArea()
            }
            .navigationTitle("Achievements")
            .navigationBarTitleDisplayMode(.large)
            .task { await loadData() }
            .refreshable { await loadData() }
            .sheet(item: $shareTarget) { achievement in
                AchievementShareSheet(achievement: achievement, reputation: reputation)
            }
            .sheet(isPresented: $showingAvatarPicker) {
                AvatarPickerView()
            }
        }
    }

    // MARK: - Content

    private var achievementContent: some View {
        ScrollView {
            VStack(spacing: LC.space24) {
                // Unified profile + reputation card
                profileReputationCard
                competitionRecord
                statsRow

                // Leaderboard link
                NavigationLink {
                    LeaderboardView()
                } label: {
                    HStack(spacing: LC.space12) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(LC.accent)
                        VStack(alignment: .leading, spacing: LC.space2) {
                            Text("Rankings")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(LC.textPrimary(scheme))
                            Text("View seasonal leaderboard")
                                .font(.caption)
                                .foregroundStyle(LC.textSecondary(scheme))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(LC.space16)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                }
                .buttonStyle(.plain)

                // Earnings section
                if !claims.isEmpty {
                    earningsSection
                }

                badgeGrid
                milestonesSection
            }
            .padding(.horizontal, LC.space16)
            .padding(.bottom, LC.space32)
        }
    }

    // MARK: - Unified Profile + Reputation Card

    private var profileReputationCard: some View {
        VStack(spacing: LC.space16) {
            // Avatar (tappable)
            Button {
                showingAvatarPicker = true
            } label: {
                ZStack {
                    // Level ring
                    Circle()
                        .stroke(
                            LinearGradient(
                                colors: levelColors,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 3
                        )
                        .frame(width: 104, height: 104)

                    AvatarView(size: 92, walletAddress: appState.walletAddress)

                    // Edit badge
                    Image(systemName: "pencil.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(LC.accent)
                        .background(Circle().fill(Color(.systemBackground)).frame(width: 22, height: 22))
                        .offset(x: 38, y: 38)
                }
            }
            .buttonStyle(.plain)

            // Level name + level number
            VStack(spacing: LC.space4) {
                Text(reputation.levelName)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(LC.textPrimary(scheme))

                HStack(spacing: LC.space8) {
                    HStack(spacing: LC.space4) {
                        Image(systemName: reputation.levelIcon)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(levelColors.first ?? LC.accent)
                        Text("Level \(reputation.level)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(levelColors.first ?? LC.accent)
                    }

                    Text("•")
                        .foregroundStyle(.tertiary)

                    Text("\(reputation.points) pts")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(LC.textSecondary(scheme))
                }
            }

            // Progress bar
            VStack(spacing: LC.space6) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 5)
                            .fill(scheme == .dark ? Color.white.opacity(0.08) : Color(.systemGray5))
                            .frame(height: 10)

                        RoundedRectangle(cornerRadius: 5)
                            .fill(
                                LinearGradient(colors: levelColors, startPoint: .leading, endPoint: .trailing)
                            )
                            .frame(width: max(10, geo.size.width * reputation.progress), height: 10)
                    }
                }
                .frame(height: 10)

                if reputation.level < 5 {
                    Text("\(reputation.nextLevelPoints - reputation.points) pts to Level \(reputation.level + 1)")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                } else {
                    Text("Max level reached")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.accent)
                }
            }
            .padding(.horizontal, LC.space8)
        }
        .padding(.vertical, LC.space24)
        .padding(.horizontal, LC.space20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [levelColors.first?.opacity(0.3) ?? .clear, levelColors.last?.opacity(0.1) ?? .clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .padding(.top, LC.space8)
    }

    private var levelColors: [Color] {
        switch reputation.level {
        case 1: return [Color(.systemGray), Color(.systemGray3)]
        case 2: return [LC.accent, LC.accentLight]
        case 3: return [LC.accent, LC.gradBlue]
        case 4: return [LC.navy, LC.accent]
        case 5: return [LC.warning, LC.accent]
        default: return [Color(.systemGray), Color(.systemGray3)]
        }
    }

    // MARK: - Competition Record

    private var competitionRecord: some View {
        VStack(spacing: LC.space12) {
            HStack {
                Text("Competition Record")
                    .font(.headline)
                Spacer()
            }

            HStack(spacing: LC.space12) {
                recordStat("Wins", value: "\(competitionStats.wins)", color: LC.success)
                recordStat("Losses", value: "\(competitionStats.losses)", color: LC.danger)
                recordStat("Win Rate", value: competitionStats.winRateDisplay, color: LC.accent)
            }

            HStack(spacing: LC.space12) {
                recordStat("Streak", value: competitionStats.streak > 0 ? "\(competitionStats.streak)" : "—", color: LC.warning)
                recordStat("Rank", value: competitionStats.rank.map { "#\($0)" } ?? "—", color: LC.info)
                recordStat("Earned", value: competitionStats.totalEarned > 0 ? String(format: "%.2f", competitionStats.totalEarned) : "0", color: LC.accent)
            }
        }
    }

    private func recordStat(_ label: String, value: String, color: Color) -> some View {
        VStack(spacing: LC.space4) {
            Text(value)
                .font(.headline.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(LC.textSecondary(scheme))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Earnings Section

    private var earningsSection: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack {
                Text("Earnings")
                    .font(.headline)
                Spacer()
                Text(totalEarningsDisplay)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(LC.accent)
            }

            VStack(spacing: LC.space8) {
                ForEach(claims.prefix(5)) { claim in
                    HStack(spacing: LC.space12) {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(LC.success)

                        VStack(alignment: .leading, spacing: LC.space2) {
                            Text(claim.typeLabel)
                                .font(.caption.weight(.semibold))
                            if let cid = claim.challengeId {
                                Text("Challenge #\(cid)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        Text(claim.displayAmount)
                            .font(.caption.weight(.bold).monospacedDigit())
                            .foregroundStyle(LC.textPrimary(scheme))
                    }
                    .padding(LC.space12)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                }

                if claims.count > 5 {
                    Text("+ \(claims.count - 5) more claims")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    // MARK: - Stats Row

    private var statsRow: some View {
        HStack(spacing: LC.space12) {
            statCard("Achievements", value: "\(achievements.count)", icon: "trophy.fill", color: LC.accent)
            statCard("Victories", value: "\(reputation.victories)", icon: "star.fill", color: LC.success)
            statCard("Earned", value: totalEarningsLCAI > 0 ? totalEarningsDisplay : "0", icon: "banknote.fill", color: LC.accent)
        }
    }

    private func statCard(_ label: String, value: String, icon: String, color: Color) -> some View {
        VStack(spacing: LC.space8) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(color)
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Badge Grid

    private var badgeGrid: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack {
                Text("Your Badges")
                    .font(.headline)
                Spacer()
                if showingDummyBadges {
                    Text("Preview")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(LC.accent.opacity(0.1))
                        .clipShape(Capsule())
                } else {
                    Text("\(achievements.count) earned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            LazyVGrid(columns: columns, spacing: LC.space12) {
                ForEach(displayAchievements) { achievement in
                    badgeCell(achievement)
                        .opacity(showingDummyBadges ? 0.5 : 1.0)
                }
            }

            if showingDummyBadges {
                Text("Complete challenges to earn achievement badges!")
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, LC.space4)
            }
        }
    }

    private func badgeCell(_ achievement: Achievement) -> some View {
        let type = achievement.type
        let colors = type.color

        return Button {
            shareTarget = achievement
        } label: {
            VStack(spacing: LC.space8) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [colors.0, colors.1],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 56, height: 56)
                        .shadow(color: colors.0.opacity(0.3), radius: 8, y: 4)

                    Image(systemName: type.icon)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                }

                Text(type.label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)

                Text("+\(type.points) pts")
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .foregroundStyle(colors.0)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, LC.space12)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Milestones

    private var milestonesSection: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack {
                Text("Milestones")
                    .font(.headline)
                Spacer()
                Text("Level \(reputation.level)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(levelColors.first ?? LC.accent)
            }

            VStack(spacing: LC.space8) {
                milestoneRow("First Achievement", current: achievements.count, target: 1, icon: "star")
                milestoneRow("5 Achievements", current: achievements.count, target: 5, icon: "rosette")
                milestoneRow("10 Achievements", current: achievements.count, target: 10, icon: "medal")
                milestoneRow("First Victory", current: reputation.victories, target: 1, icon: "trophy")
                milestoneRow("5 Victories", current: reputation.victories, target: 5, icon: "crown")
                milestoneRow("Level 3", current: reputation.level, target: 3, icon: "flame")
                milestoneRow("Level 5", current: reputation.level, target: 5, icon: "star.circle")
            }
        }
    }

    private func milestoneRow(_ title: String, current: Int, target: Int, icon: String) -> some View {
        let completed = current >= target
        let progress = min(1.0, Double(current) / Double(target))

        return HStack(spacing: LC.space12) {
            Image(systemName: completed ? "\(icon).fill" : icon)
                .font(.system(size: 16))
                .foregroundStyle(completed ? LC.accent : Color(.tertiaryLabel))
                .frame(width: 24)

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(title)
                    .font(.subheadline.weight(completed ? .semibold : .regular))
                    .foregroundStyle(completed ? LC.textPrimary(scheme) : .secondary)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color(.systemGray5))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(completed ? LC.accent : LC.accent.opacity(0.4))
                            .frame(width: geo.size.width * progress, height: 6)
                    }
                }
                .frame(height: 6)
            }

            Text("\(min(current, target))/\(target)")
                .font(.caption2.weight(.bold).monospacedDigit())
                .foregroundStyle(completed ? LC.accent : Color(.tertiaryLabel))
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Empty State

    private var connectPrompt: some View {
        VStack(spacing: LC.space24) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 56))
                .foregroundStyle(LC.accent.opacity(0.3))

            Text("Your Trophy Cabinet")
                .font(.title3.weight(.bold))

            Text("Connect your wallet to track achievements, earn badges, and share your progress.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                appState.selectedTab = .profile
            } label: {
                Label("Connect Wallet", systemImage: "wallet.bifold.fill")
            }
            .buttonStyle(LCGoldButton())
            .frame(width: 220)
        }
        .padding(LC.space32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var loadingView: some View {
        ScrollView {
            VStack(spacing: LC.space16) {
                ShimmerView().frame(height: 140).clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
                HStack(spacing: LC.space12) {
                    ForEach(0..<3, id: \.self) { _ in
                        ShimmerView().frame(height: 90).clipShape(RoundedRectangle(cornerRadius: LC.radiusMD))
                    }
                }
                ShimmerView().frame(height: 200).clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
            }
            .padding(.horizontal, LC.space16)
            .padding(.top, LC.space16)
        }
    }

    // MARK: - Data

    private func loadData() async {
        guard appState.hasWallet else { return }
        isLoading = true

        async let achievementsTask = APIClient.shared.fetchAchievements(
            baseURL: appState.serverURL,
            address: appState.walletAddress
        )
        async let reputationTask = APIClient.shared.fetchReputation(
            baseURL: appState.serverURL,
            address: appState.walletAddress
        )
        async let claimsTask = APIClient.shared.fetchClaims(
            baseURL: appState.serverURL,
            address: appState.walletAddress
        )
        async let statsTask = APIClient.shared.fetchCompetitionStats(
            baseURL: appState.serverURL,
            address: appState.walletAddress
        )

        do {
            let (a, r, c, s) = try await (achievementsTask, reputationTask, claimsTask, statsTask)
            achievements = a
            reputation = r
            claims = c
            competitionStats = s
        } catch {
            // Silent — show empty state
        }

        isLoading = false
    }
}
