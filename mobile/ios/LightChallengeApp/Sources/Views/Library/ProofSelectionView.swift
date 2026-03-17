// ProofSelectionView.swift
// Lists the user's challenges that need proof submission.

import SwiftUI

struct ProofSelectionView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService

    @State private var activities: [MyChallenge] = []
    @State private var challengeMetas: [String: ChallengeMeta] = [:]
    @State private var isLoading = false
    @State private var selectedChallenge: ProofTarget?
    @Environment(\.colorScheme) private var scheme

    private var needsProof: [MyChallenge] {
        activities.filter { $0.hasEvidence != true }
    }

    var body: some View {
        Group {
            if !appState.hasWallet {
                ContentUnavailableView {
                    Label("Wallet Not Set", systemImage: "wallet.pass")
                } description: {
                    Text("Connect your wallet to see challenges needing proof.")
                }
            } else if isLoading && activities.isEmpty {
                ProgressView("Loading challenges...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if needsProof.isEmpty {
                ContentUnavailableView(
                    "All Caught Up",
                    systemImage: "checkmark.circle",
                    description: Text("No challenges need proof right now.")
                )
            } else {
                List(needsProof) { activity in
                    let meta = challengeMetas[activity.challengeId]
                    Button {
                        selectedChallenge = ProofTarget(
                            challengeId: activity.challengeId,
                            modelHash: meta?.proof?.modelHash ?? meta?.modelHash ?? ServerConfig.defaultFitnessModelHash
                        )
                    } label: {
                        HStack(spacing: LC.space12) {
                            Image(systemName: meta?.resolvedCategory.icon ?? "figure.run")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(
                                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                        .fill(LC.fitnessGradient)
                                )

                            VStack(alignment: .leading, spacing: LC.space2) {
                                Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(LC.textPrimary(scheme))
                                    .lineLimit(1)
                                if let end = meta?.endsDate {
                                    Text("Ends \(end.relativeShort)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            Spacer()

                            Text("Submit")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(LC.accent)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Submit Proof")
        .task { await loadData() }
        .refreshable { await loadData() }
        .sheet(item: $selectedChallenge) { target in
            NavigationStack {
                FitnessProofView(
                    challengeId: target.challengeId,
                    modelHash: target.modelHash,
                    deepLinkToken: appState.deepLinkToken,
                    deepLinkExpires: appState.deepLinkExpires
                )
            }
        }
    }

    private func loadData() async {
        guard appState.hasWallet else { return }
        isLoading = true

        do {
            let fresh = try await APIClient.shared.fetchMyActivity(
                baseURL: appState.serverURL,
                subject: appState.walletAddress
            )
            activities = fresh

            await withTaskGroup(of: (String, ChallengeMeta?).self) { group in
                for activity in activities where challengeMetas[activity.challengeId] == nil {
                    let cid = activity.challengeId
                    group.addTask {
                        let meta = try? await APIClient.shared.fetchChallengeMeta(
                            baseURL: appState.serverURL,
                            id: cid
                        )
                        return (cid, meta)
                    }
                }
                for await (cid, meta) in group {
                    if let meta { challengeMetas[cid] = meta }
                }
            }
        } catch {
            // Silent — list stays empty
        }

        isLoading = false
    }
}

// MARK: - Proof Target

struct ProofTarget: Identifiable {
    let challengeId: String
    let modelHash: String
    var id: String { challengeId }
}
