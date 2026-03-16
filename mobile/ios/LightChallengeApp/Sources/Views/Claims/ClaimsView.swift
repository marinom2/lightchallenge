// ClaimsView.swift
// Reward claiming flow for completed challenges.

import SwiftUI

struct ClaimsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager

    @State private var activities: [MyChallenge] = []
    @State private var eligibility: [String: ContractService.ClaimEligibility] = [:]
    @State private var challengeMetas: [String: ChallengeMeta] = [:]
    @State private var isLoading = false
    @State private var claimingId: String?
    @State private var claimResult: String?
    @State private var error: String?

    private var claimableActivities: [MyChallenge] {
        activities.filter { activity in
            activity.verdictPass == true
        }
    }

    var body: some View {
        Group {
            if !appState.hasWallet {
                walletRequired
            } else if isLoading && activities.isEmpty {
                loadingView
            } else if claimableActivities.isEmpty {
                emptyView
            } else {
                claimsList
            }
        }
        .navigationTitle("Claims")
        .task { await loadData() }
        .refreshable { await loadData() }
    }

    // MARK: - Claims List

    private var claimsList: some View {
        List {
            if let result = claimResult {
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(LC.success)
                        Text(result)
                            .font(.caption)
                    }
                }
            }

            ForEach(claimableActivities) { activity in
                claimRow(activity)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func claimRow(_ activity: MyChallenge) -> some View {
        let meta = challengeMetas[activity.challengeId]
        let elig = eligibility[activity.challengeId]

        return Section {
            VStack(alignment: .leading, spacing: 12) {
                // Title
                Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                    .font(.subheadline.weight(.semibold))

                // Status
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(LC.success)
                    Text("Passed")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.success)

                    if let elig, elig.contribution != "0" {
                        Spacer()
                        let eth = (Double(elig.contribution) ?? 0) / 1e18
                        Text("Staked: \(String(format: "%.4f", eth)) LCAI")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Claim actions
                if let elig {
                    if elig.canClaimWinner {
                        claimButton(
                            "Claim Winner Reward",
                            icon: "trophy.fill",
                            color: LC.success,
                            challengeId: activity.challengeId,
                            action: .winner
                        )
                    }

                    if elig.canClaimTreasury {
                        let ethAmount = (Double(elig.allowance) ?? 0) / 1e18
                        claimButton(
                            "Withdraw \(String(format: "%.4f", ethAmount)) LCAI",
                            icon: "banknote.fill",
                            color: LC.info,
                            challengeId: activity.challengeId,
                            action: .treasury
                        )
                    }

                    if elig.canClaimLoser {
                        claimButton(
                            "Claim Cashback",
                            icon: "arrow.uturn.backward.circle.fill",
                            color: LC.warning,
                            challengeId: activity.challengeId,
                            action: .loser
                        )
                    }

                    if !elig.canClaimWinner && !elig.canClaimLoser && !elig.canClaimTreasury {
                        HStack(spacing: 6) {
                            Image(systemName: "clock")
                                .foregroundStyle(.secondary)
                            Text("Waiting for challenge to finalize")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    ProgressView()
                        .font(.caption)
                }
            }

            if let error, claimingId == activity.challengeId {
                HStack(spacing: 6) {
                    Image(systemName: "xmark.circle")
                        .foregroundStyle(LC.danger)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(LC.danger)
                }
            }
        }
    }

    private enum ClaimAction { case winner, loser, refund, treasury }

    private func claimButton(_ label: String, icon: String, color: Color, challengeId: String, action: ClaimAction) -> some View {
        Button {
            Task { await executeClaim(challengeId: challengeId, action: action) }
        } label: {
            Label(label, systemImage: icon)
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(color)
        .disabled(claimingId != nil || !walletManager.isConnected)
    }

    // MARK: - States

    private var walletRequired: some View {
        ContentUnavailableView {
            Label("Wallet Not Set", systemImage: "wallet.pass")
        } description: {
            Text("Set your wallet address to view and claim rewards.")
        } actions: {
            Button("Go to Settings") {
                appState.selectedTab = .profile
            }
            .buttonStyle(.bordered)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large)
            Text("Loading claims...").font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        ContentUnavailableView(
            "No Rewards Available",
            systemImage: "trophy",
            description: Text("Complete fitness challenges to earn rewards.")
        )
    }

    // MARK: - Data

    private func loadData() async {
        guard appState.hasWallet else { return }
        isLoading = true

        do {
            activities = try await APIClient.shared.fetchMyActivity(
                baseURL: appState.serverURL,
                subject: appState.walletAddress
            )

            // Fetch metas and eligibility in parallel
            await withTaskGroup(of: Void.self) { group in
                for activity in claimableActivities {
                    let cid = activity.challengeId
                    group.addTask {
                        async let meta: () = fetchMeta(cid)
                        async let elig: () = fetchEligibility(cid)
                        _ = await (meta, elig)
                    }
                }
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func fetchMeta(_ challengeId: String) async {
        if challengeMetas[challengeId] == nil {
            let meta = try? await APIClient.shared.fetchChallengeMeta(
                baseURL: appState.serverURL,
                id: challengeId
            )
            if let meta {
                await MainActor.run { challengeMetas[challengeId] = meta }
            }
        }
    }

    private func fetchEligibility(_ challengeId: String) async {
        guard let cid = UInt64(challengeId) else { return }
        let elig = await ContractService.shared.checkClaimEligibility(
            challengeId: cid,
            user: appState.walletAddress
        )
        await MainActor.run { eligibility[challengeId] = elig }
    }

    // MARK: - Execute Claim

    private func executeClaim(challengeId: String, action: ClaimAction) async {
        guard let cid = UInt64(challengeId) else { return }

        claimingId = challengeId
        error = nil
        claimResult = nil

        do {
            // Try to finalize first (no-op if already finalized)
            _ = try? await ContractService.shared.finalize(challengeId: cid)

            let txHash: String
            switch action {
            case .winner:
                txHash = try await ContractService.shared.claimWinner(challengeId: cid)
            case .loser:
                txHash = try await ContractService.shared.claimLoser(challengeId: cid)
            case .refund:
                txHash = try await ContractService.shared.claimRefund(challengeId: cid)
            case .treasury:
                txHash = try await ContractService.shared.treasuryClaimETH(challengeId: cid)
            }

            // Withdraw from treasury if there's an allowance after claim
            if action == .winner || action == .loser {
                _ = try? await ContractService.shared.treasuryClaimETH(challengeId: cid)
            }

            claimResult = "Claimed! TX: \(txHash.prefix(18))..."

            // Record claim in backend
            await recordClaim(challengeId: challengeId, action: action, txHash: txHash)

            // Refresh eligibility
            await fetchEligibility(challengeId)
        } catch {
            self.error = error.localizedDescription
        }

        claimingId = nil
    }

    private func recordClaim(challengeId: String, action: ClaimAction, txHash: String) async {
        guard let url = URL(string: "\(appState.serverURL)/api/me/claims") else { return }

        let claimType: String
        switch action {
        case .winner: claimType = "principal"
        case .loser: claimType = "cashback"
        case .refund: claimType = "principal"
        case .treasury: claimType = "treasury_eth"
        }

        let body: [String: Any] = [
            "challengeId": challengeId,
            "subject": appState.walletAddress,
            "claimType": claimType,
            "txHash": txHash,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        request.setValue(appState.walletAddress, forHTTPHeaderField: "x-lc-address")
        request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        _ = try? await URLSession.shared.data(for: request)
    }
}
