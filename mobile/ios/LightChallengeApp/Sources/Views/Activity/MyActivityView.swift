// MyActivityView.swift
// Participation tracking — premium card design.

import SwiftUI

struct MyActivityView: View {
    @EnvironmentObject private var appState: AppState
    @State private var activities: [MyChallenge] = []
    @State private var challengeMetas: [String: ChallengeMeta] = [:]
    @State private var isLoading = false
    @State private var error: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ScrollView {
            if !appState.hasWallet {
                walletRequiredView
            } else if isLoading && activities.isEmpty {
                loadingView
            } else if let error, activities.isEmpty {
                errorView(error)
            } else if activities.isEmpty {
                emptyView
            } else {
                activityList
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("My Challenges")
        .task { await loadActivity() }
        .refreshable { await loadActivity() }
        .navigationDestination(for: String.self) { challengeId in
            ChallengeDetailView(challengeId: challengeId)
        }
    }

    // MARK: - Activity List

    private var activityList: some View {
        LazyVStack(spacing: LC.space12) {
            ForEach(activities) { activity in
                NavigationLink(value: activity.challengeId) {
                    activityCard(activity)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.top, LC.space8)
        .padding(.bottom, LC.space32)
    }

    private func activityCard(_ activity: MyChallenge) -> some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack {
                if let meta = challengeMetas[activity.challengeId] {
                    VStack(alignment: .leading, spacing: LC.space4) {
                        Text(meta.displayTitle)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                            .lineLimit(1)
                        if let desc = meta.description, !desc.isEmpty {
                            Text(desc)
                                .font(.caption)
                                .foregroundStyle(LC.textSecondary(scheme))
                                .lineLimit(1)
                        }
                    }
                } else {
                    Text("Challenge #\(activity.challengeId)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                }

                Spacer()

                LCStatusBadge(text: activity.statusLabel(meta: challengeMetas[activity.challengeId]), color: activityStatusColor(activity))
            }

            Rectangle()
                .fill(LC.cardBorder(scheme))
                .frame(height: 0.5)

            // Progress pipeline
            HStack(spacing: LC.space8) {
                progressStep("Joined", active: true, color: LC.info)
                progressArrow
                progressStep("Evidence", active: activity.hasEvidence == true, color: LC.warning)
                progressArrow
                progressStep(
                    activity.verdictPass == true ? "Passed" : activity.verdictPass == false ? "Failed" : "Verdict",
                    active: activity.verdictPass != nil,
                    color: activity.verdictPass == true ? LC.success : activity.verdictPass == false ? LC.danger : .secondary
                )
            }
        }
        .padding(LC.space16)
        .lcCard()
    }

    private func progressStep(_ label: String, active: Bool, color: Color) -> some View {
        HStack(spacing: LC.space4) {
            Circle()
                .fill(active ? color : color.opacity(0.2))
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(active ? color : LC.textTertiary(scheme))
        }
    }

    private var progressArrow: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(LC.textTertiary(scheme))
    }

    private func activityStatusColor(_ activity: MyChallenge) -> Color {
        let color = activity.statusColor(meta: challengeMetas[activity.challengeId])
        switch color {
        case "green": return LC.success
        case "red": return LC.danger
        case "amber": return LC.warning
        default: return LC.info
        }
    }

    // MARK: - States

    private var walletRequiredView: some View {
        VStack(spacing: LC.space20) {
            Image(systemName: "wallet.bifold")
                .font(.system(size: 48))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("Wallet Not Connected")
                .font(.headline)
            Text("Connect your wallet to see your challenge activity.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
            Button("Go to Library") {
                appState.selectedTab = .profile
            }
            .buttonStyle(LCGoldButton())
            .frame(width: 200)
        }
        .padding(LC.space48)
    }

    private var loadingView: some View {
        LazyVStack(spacing: LC.space12) {
            ForEach(0..<3, id: \.self) { _ in
                ShimmerView().frame(height: 100)
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.top, LC.space16)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 36))
                .foregroundStyle(LC.textTertiary(scheme))
            Text(message)
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await loadActivity() }
            }
            .buttonStyle(LCSecondaryButton())
            .frame(width: 140)
        }
        .padding(LC.space48)
    }

    private var emptyView: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "figure.run")
                .font(.system(size: 48))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("No Activity Yet")
                .font(.headline)
            Text("Join a challenge from the Explore tab to get started.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
        }
        .padding(LC.space48)
    }

    // MARK: - Data Loading

    private func loadActivity() async {
        guard appState.hasWallet else { return }

        isLoading = true
        error = nil

        if activities.isEmpty, let cached = await CacheService.shared.loadCachedActivity(wallet: appState.walletAddress) {
            activities = cached
        }

        do {
            let fresh = try await APIClient.shared.fetchMyActivity(
                baseURL: appState.serverURL,
                subject: appState.walletAddress
            )
            activities = fresh
            await CacheService.shared.cacheMyActivity(fresh, wallet: appState.walletAddress)

            await withTaskGroup(of: (String, ChallengeMeta?).self) { group in
                for activity in activities {
                    let cid = activity.challengeId
                    if challengeMetas[cid] == nil {
                        group.addTask {
                            let meta = try? await APIClient.shared.fetchChallengeMeta(
                                baseURL: appState.serverURL,
                                id: cid
                            )
                            return (cid, meta)
                        }
                    }
                }
                for await (cid, meta) in group {
                    if let meta { challengeMetas[cid] = meta }
                }
            }
        } catch {
            if activities.isEmpty {
                self.error = error.localizedDescription
            }
        }

        isLoading = false
    }
}
