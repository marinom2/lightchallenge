// LeaderboardView.swift
// Seasonal rankings — quarterly leaderboards with top competitors.
// Accessible from Explore or Achievements tab.

import SwiftUI

struct LeaderboardView: View {
    @EnvironmentObject private var appState: AppState
    @State private var entries: [LeaderboardEntry] = []
    @State private var season: SeasonInfo?
    @State private var isLoading = false
    @State private var selectedPeriod: LeaderboardPeriod = .season
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if isLoading && entries.isEmpty {
                loadingView
            } else if entries.isEmpty {
                emptyView
            } else {
                leaderboardContent
            }
        }
        .navigationTitle("Rankings")
        .navigationBarTitleDisplayMode(.large)
        .task { await loadData() }
        .refreshable { await loadData() }
    }

    // MARK: - Content

    private var leaderboardContent: some View {
        ScrollView {
            VStack(spacing: LC.space20) {
                // Season header
                if let season {
                    seasonHeader(season)
                }

                // Period filter
                periodPicker

                // Podium (top 3)
                if entries.count >= 3 {
                    podiumView
                }

                // Full list
                rankingsList
            }
            .padding(.horizontal, LC.space16)
            .padding(.bottom, LC.space32)
        }
        .background {
            Color(.systemGroupedBackground).ignoresSafeArea()
            LCAmbientGlow().ignoresSafeArea()
        }
    }

    // MARK: - Season Header

    private func seasonHeader(_ season: SeasonInfo) -> some View {
        VStack(spacing: LC.space8) {
            HStack(spacing: LC.space8) {
                Image(systemName: "calendar.badge.clock")
                    .foregroundStyle(LC.accent)
                Text(season.name)
                    .font(.headline.weight(.bold))
                Spacer()
                if season.isActive {
                    LCStatusBadge(text: "Active", color: LC.success)
                }
            }

            if let endsAt = season.endsAt {
                HStack(spacing: LC.space4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                    Text("Ends \(endsAt.relativeShort)")
                        .font(.caption)
                }
                .foregroundStyle(LC.textSecondary(scheme))
            }
        }
        .padding(LC.space16)
        .lcCard()
    }

    // MARK: - Period Picker

    private var periodPicker: some View {
        HStack(spacing: LC.space8) {
            ForEach(LeaderboardPeriod.allCases) { period in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedPeriod = period
                    }
                    Task { await loadData() }
                } label: {
                    Text(period.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(selectedPeriod == period ? .white : LC.textPrimary(scheme))
                        .padding(.horizontal, LC.space16)
                        .padding(.vertical, LC.space8)
                        .background(
                            Capsule()
                                .fill(selectedPeriod == period ? LC.accent : Color(.secondarySystemGroupedBackground))
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    // MARK: - Podium

    private var podiumView: some View {
        HStack(alignment: .bottom, spacing: LC.space12) {
            // 2nd place
            podiumCard(entries[1], rank: 2, height: 100, color: Color(.systemGray))

            // 1st place
            podiumCard(entries[0], rank: 1, height: 130, color: LC.accent)

            // 3rd place
            podiumCard(entries[2], rank: 3, height: 80, color: Color(hex: 0x94A3B8))
        }
    }

    private func podiumCard(_ entry: LeaderboardEntry, rank: Int, height: CGFloat, color: Color) -> some View {
        let isMe = entry.wallet.lowercased() == appState.walletAddress.lowercased()

        return VStack(spacing: LC.space8) {
            // Medal
            Image(systemName: rank == 1 ? "crown.fill" : rank == 2 ? "medal.fill" : "medal")
                .font(.system(size: rank == 1 ? 28 : 22, weight: .bold))
                .foregroundStyle(color)

            // Avatar
            AvatarView(size: rank == 1 ? 56 : 44, walletAddress: entry.wallet)

            // Name
            Text(entry.displayName ?? entry.truncatedWallet)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(isMe ? LC.accent : LC.textPrimary(scheme))
                .lineLimit(1)

            // Score
            Text("\(entry.points) pts")
                .font(.caption2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)

            // Podium block
            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [color.opacity(0.3), color.opacity(0.15)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(height: height)
                .overlay(
                    Text("#\(rank)")
                        .font(.title2.weight(.black))
                        .foregroundStyle(color.opacity(0.5))
                )
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space8)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(isMe ? LC.accent.opacity(0.06) : Color.clear)
        )
    }

    // MARK: - Rankings List

    private var rankingsList: some View {
        VStack(alignment: .leading, spacing: LC.space8) {
            Text("Full Rankings")
                .font(.headline)

            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                rankRow(entry, rank: index + 1)
            }
        }
    }

    private func rankRow(_ entry: LeaderboardEntry, rank: Int) -> some View {
        let isMe = entry.wallet.lowercased() == appState.walletAddress.lowercased()

        return HStack(spacing: LC.space12) {
            // Rank
            Text("#\(rank)")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(rank <= 3 ? rankColor(rank) : LC.textTertiary(scheme))
                .frame(width: 32)

            AvatarView(size: 36, walletAddress: entry.wallet)

            VStack(alignment: .leading, spacing: LC.space2) {
                Text(entry.displayName ?? entry.truncatedWallet)
                    .font(.subheadline.weight(isMe ? .bold : .medium))
                    .foregroundStyle(isMe ? LC.accent : LC.textPrimary(scheme))

                HStack(spacing: LC.space8) {
                    Text("\(entry.victories)W \(entry.completions - entry.victories)L")
                        .font(.caption2)
                        .foregroundStyle(LC.textSecondary(scheme))

                    if entry.streak > 0 {
                        HStack(spacing: 2) {
                            Image(systemName: "flame.fill")
                                .font(.system(size: 9))
                            Text("\(entry.streak)")
                                .font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(LC.warning)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: LC.space2) {
                Text("\(entry.points)")
                    .font(.subheadline.weight(.bold).monospacedDigit())

                if entry.totalEarnedLCAI > 0 {
                    Text(LCFormatter.format(wei: entry.totalEarnedLCAI * 1e18))
                        .font(.caption2)
                        .foregroundStyle(LC.success)
                }
            }
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                .fill(isMe ? LC.accent.opacity(0.06) : Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                .stroke(isMe ? LC.accent.opacity(0.2) : .clear, lineWidth: 1)
        )
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: LC.accent
        case 2: Color(.systemGray)
        case 3: Color(hex: 0x94A3B8)
        default: LC.textTertiary(scheme)
        }
    }

    // MARK: - States

    private var loadingView: some View {
        ScrollView {
            VStack(spacing: LC.space12) {
                ForEach(0..<6, id: \.self) { _ in
                    ShimmerView().frame(height: 60).clipShape(RoundedRectangle(cornerRadius: LC.radiusSM))
                }
            }
            .padding(LC.space16)
        }
    }

    private var emptyView: some View {
        ContentUnavailableView(
            "No Rankings Yet",
            systemImage: "chart.bar.fill",
            description: Text("Complete challenges to appear on the leaderboard.")
        )
    }

    // MARK: - Data

    private func loadData() async {
        isLoading = true

        do {
            let result = try await APIClient.shared.fetchLeaderboard(
                baseURL: appState.serverURL,
                period: selectedPeriod.rawValue
            )
            entries = result.entries
            season = result.season
        } catch {
            // Silent
        }

        isLoading = false
    }
}

// MARK: - Models

struct LeaderboardEntry: Codable, Identifiable {
    let wallet: String
    let displayName: String?
    let points: Int
    let victories: Int
    let completions: Int
    let streak: Int
    let totalEarnedLCAI: Double

    var id: String { wallet }

    var truncatedWallet: String {
        guard wallet.count >= 10 else { return wallet }
        return "\(wallet.prefix(6))...\(wallet.suffix(4))"
    }
}

struct SeasonInfo: Codable {
    let name: String
    let number: Int
    let startsAt: Double?
    let endsAt_: Double?
    let isActive: Bool

    enum CodingKeys: String, CodingKey {
        case name, number, startsAt, endsAt_ = "endsAt", isActive
    }

    var endsAt: Date? {
        guard let ts = endsAt_, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }
}

struct LeaderboardResponse: Codable {
    let entries: [LeaderboardEntry]
    let season: SeasonInfo?
}

enum LeaderboardPeriod: String, CaseIterable, Identifiable {
    case season, allTime = "all_time", weekly

    var id: String { rawValue }

    var label: String {
        switch self {
        case .season: "Season"
        case .allTime: "All Time"
        case .weekly: "This Week"
        }
    }
}
