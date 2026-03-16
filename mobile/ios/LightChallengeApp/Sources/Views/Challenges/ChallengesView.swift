// ChallengesView.swift
// "My Challenges" tab — the daily driver.
// Category filters, create CTA, proof submission, claims, deadline urgency.
// Inspired by Apple Fitness Summary + Strava Activity Feed.

import SwiftUI

struct ChallengesView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var healthService: HealthKitService

    @State private var activities: [MyChallenge] = []
    @State private var challengeMetas: [String: ChallengeMeta] = [:]
    @State private var eligibility: [String: ContractService.ClaimEligibility] = [:]
    @State private var isLoading = false
    @State private var error: String?
    @State private var navigationPath = NavigationPath()
    @State private var selectedProof: ProofTarget?
    @State private var claimingId: String?
    @State private var claimResult: String?
    @State private var showingCreateChallenge = false
    @State private var selectedCategory: ChallengeCategory? = nil
    @Environment(\.colorScheme) private var scheme

    // MARK: - Computed sections

    /// Filtered activities based on selected category
    private var filteredActivities: [MyChallenge] {
        guard let cat = selectedCategory else { return activities }
        return activities.filter { a in
            let meta = challengeMetas[a.challengeId]
            return meta?.resolvedCategory == cat
        }
    }

    private var needsAction: [MyChallenge] {
        filteredActivities.filter { a in
            a.hasEvidence != true || (a.verdictPass == true && eligibility[a.challengeId]?.hasAnyClaim == true)
        }
    }

    private var active: [MyChallenge] {
        filteredActivities.filter { a in a.verdictPass == nil }
    }

    private var completed: [MyChallenge] {
        filteredActivities.filter { a in a.verdictPass != nil }
    }

    private var claimableCount: Int {
        activities.filter { a in
            a.verdictPass == true && (eligibility[a.challengeId]?.hasAnyClaim == true)
        }.count
    }

    /// Category counts from all activities (unfiltered)
    private func categoryCount(_ cat: ChallengeCategory) -> Int {
        activities.filter { a in challengeMetas[a.challengeId]?.resolvedCategory == cat }.count
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if !appState.hasWallet {
                    connectPrompt
                } else if isLoading && activities.isEmpty {
                    loadingView
                } else if let error, activities.isEmpty {
                    errorView(error)
                } else if activities.isEmpty {
                    emptyView
                } else {
                    challengeList
                }
            }
            .background {
                Color(.systemGroupedBackground).ignoresSafeArea()
                LCAmbientGlow().ignoresSafeArea()
            }
            .navigationTitle("Challenges")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCreateChallenge = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundStyle(LC.accent)
                    }
                    .disabled(!walletManager.isConnected)
                    .opacity(walletManager.isConnected ? 1 : 0.4)
                }
            }
            .navigationDestination(for: String.self) { challengeId in
                ChallengeDetailView(challengeId: challengeId)
            }
            .sheet(isPresented: $showingCreateChallenge) {
                CreateChallengeView()
            }
            .sheet(item: $selectedProof) { target in
                NavigationStack {
                    FitnessProofView(
                        challengeId: target.challengeId,
                        modelHash: target.modelHash,
                        deepLinkToken: appState.deepLinkToken,
                        deepLinkExpires: appState.deepLinkExpires
                    )
                }
            }
            .task { await loadData() }
            .refreshable { await loadData() }
            .onChange(of: appState.deepLinkChallengeId) { _, newId in
                if let newId {
                    navigationPath.append(newId)
                    appState.deepLinkChallengeId = nil
                }
            }
        }
    }

    // MARK: - Challenge List

    private var challengeList: some View {
        ScrollView {
            VStack(spacing: LC.space20) {
                // Summary header
                summaryHeader

                // Category filter pills
                categoryFilterPills

                // Claims banner
                if claimableCount > 0 {
                    claimsBanner
                }

                // Wrong network warning
                if walletManager.isWrongNetwork {
                    networkWarning
                }

                // Create challenge CTA card
                createChallengeCTA

                // Needs action
                if !needsAction.isEmpty {
                    challengeSection("Needs Action", icon: "exclamationmark.circle.fill", color: LC.warning, challenges: needsAction, showProofCTA: true)
                }

                // Active
                if !active.isEmpty {
                    let needsActionIds = Set(needsAction.map(\.id))
                    let remaining = active.filter { !needsActionIds.contains($0.id) }
                    if !remaining.isEmpty {
                        challengeSection("In Progress", icon: "flame.fill", color: LC.accent, challenges: remaining, showProofCTA: false)
                    }
                }

                // Completed
                if !completed.isEmpty {
                    challengeSection("Completed", icon: "checkmark.circle.fill", color: LC.success, challenges: completed, showProofCTA: false)
                }

                // Empty state for filtered results
                if filteredActivities.isEmpty && selectedCategory != nil {
                    VStack(spacing: LC.space12) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 32))
                            .foregroundStyle(.tertiary)
                        Text("No \(selectedCategory?.label ?? "") challenges")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Clear Filter") {
                            withAnimation { selectedCategory = nil }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.accent)
                    }
                    .padding(LC.space32)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, LC.space16)
            .padding(.bottom, LC.space32)
        }
    }

    // MARK: - Summary Header

    private var summaryHeader: some View {
        HStack(spacing: LC.space16) {
            summaryStatPill(
                value: "\(activities.count)",
                label: "Total",
                icon: "flame.fill",
                color: LC.accent
            )
            summaryStatPill(
                value: "\(activities.filter { $0.verdictPass == nil && $0.hasEvidence != true }.count)",
                label: "Proof Due",
                icon: "exclamationmark.circle.fill",
                color: LC.warning
            )
            summaryStatPill(
                value: "\(activities.filter { $0.verdictPass == true }.count)",
                label: "Passed",
                icon: "checkmark.circle.fill",
                color: LC.success
            )
            summaryStatPill(
                value: "\(claimableCount)",
                label: "Claimable",
                icon: "trophy.fill",
                color: LC.accent
            )
        }
    }

    private func summaryStatPill(value: String, label: String, icon: String, color: Color) -> some View {
        VStack(spacing: LC.space4) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(color)
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Category Filter Pills

    private var categoryFilterPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LC.space8) {
                categoryPill("All", icon: "square.grid.2x2", category: nil, count: activities.count)
                categoryPill("Fitness", icon: "figure.run", category: .fitness, count: categoryCount(.fitness))
                categoryPill("Gaming", icon: "gamecontroller.fill", category: .gaming, count: categoryCount(.gaming))
                categoryPill("Social", icon: "person.2.fill", category: .social, count: categoryCount(.social))
            }
        }
    }

    private func categoryPill(_ title: String, icon: String, category: ChallengeCategory?, count: Int) -> some View {
        let isSelected = selectedCategory == category
        return Button {
            withAnimation(.spring(response: 0.3)) {
                selectedCategory = isSelected ? nil : category
            }
        } label: {
            HStack(spacing: LC.space4) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                Text(title)
                    .font(.caption.weight(.semibold))
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(isSelected ? .white.opacity(0.8) : .secondary)
                }
            }
            .foregroundStyle(isSelected ? .white : LC.textPrimary(scheme))
            .padding(.horizontal, LC.space12)
            .padding(.vertical, LC.space8)
            .background(
                Capsule()
                    .fill(isSelected ? LC.accent : Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.clear : LC.cardBorder(scheme), lineWidth: isSelected ? 0 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Create Challenge CTA

    private var createChallengeCTA: some View {
        Button {
            showingCreateChallenge = true
        } label: {
            HStack(spacing: LC.space12) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(LC.accent)

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Create")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                    Text("Start a new challenge")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LC.textTertiary(scheme))
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.accent.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(!walletManager.isConnected)
        .opacity(walletManager.isConnected ? 1 : 0.5)
    }

    // MARK: - Claims Banner

    private var claimsBanner: some View {
        Button {
            // Scroll to first claimable or navigate
            if let first = activities.first(where: { $0.verdictPass == true && eligibility[$0.challengeId]?.hasAnyClaim == true }) {
                navigationPath.append(first.challengeId)
            }
        } label: {
            HStack(spacing: LC.space12) {
                Image(systemName: "trophy.fill")
                    .font(.title3)
                    .foregroundStyle(.white)

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("\(claimableCount) reward\(claimableCount == 1 ? "" : "s") ready")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                    Text("Tap to claim your winnings")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.8))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [LC.accent, LC.violet],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: LC.accent.opacity(0.2), radius: 12, y: 4)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Network Warning

    private var networkWarning: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(LC.warning)
            VStack(alignment: .leading, spacing: LC.space2) {
                Text("Wrong Network")
                    .font(.subheadline.weight(.semibold))
                Text("Switch to LightChain Testnet in your wallet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Switch") {
                walletManager.openWalletToSwitchNetwork()
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(LC.warning)
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(LC.warning.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                        .stroke(LC.warning.opacity(0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Challenge Section

    private func challengeSection(_ title: String, icon: String, color: Color, challenges: [MyChallenge], showProofCTA: Bool) -> some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack(spacing: LC.space8) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(color)
                Text(title)
                    .font(.headline)
                Text("\(challenges.count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(color))
            }

            ForEach(challenges) { activity in
                challengeCard(activity, showProofCTA: showProofCTA)
            }
        }
    }

    private func challengeCard(_ activity: MyChallenge, showProofCTA: Bool) -> some View {
        let meta = challengeMetas[activity.challengeId]

        return Button {
            navigationPath.append(activity.challengeId)
        } label: {
            VStack(alignment: .leading, spacing: LC.space12) {
                // Header row
                HStack {
                    // Category icon
                    Image(systemName: meta?.resolvedCategory.icon ?? "flame.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                .fill(categoryGradient(meta?.resolvedCategory ?? .fitness))
                        )

                    VStack(alignment: .leading, spacing: LC.space2) {
                        Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                            .lineLimit(1)

                        if let end = meta?.endsDate {
                            deadlinePill(end)
                        }
                    }

                    Spacer()

                    LCStatusBadge(text: activity.statusLabel, color: statusColor(activity))
                }

                // Progress pipeline
                HStack(spacing: LC.space8) {
                    pipelineStep("Joined", active: true, color: LC.info)
                    pipelineArrow
                    pipelineStep("Evidence", active: activity.hasEvidence == true, color: LC.warning)
                    pipelineArrow
                    pipelineStep(
                        activity.verdictPass == true ? "Passed" : activity.verdictPass == false ? "Failed" : "Verdict",
                        active: activity.verdictPass != nil,
                        color: activity.verdictPass == true ? LC.success : activity.verdictPass == false ? LC.danger : .secondary
                    )
                }

                // Inline proof CTA
                if showProofCTA && activity.hasEvidence != true {
                    Button {
                        selectedProof = ProofTarget(
                            challengeId: activity.challengeId,
                            modelHash: meta?.proof?.modelHash ?? meta?.modelHash ?? ServerConfig.appleStepsModelHash
                        )
                    } label: {
                        HStack(spacing: LC.space8) {
                            Image(systemName: "heart.text.square.fill")
                                .font(.system(size: 14))
                            Text("Submit Proof")
                                .font(.caption.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                .fill(LC.accent)
                        )
                    }
                    .buttonStyle(.plain)
                }

                // Inline claim CTA
                if activity.verdictPass == true, let elig = eligibility[activity.challengeId], elig.hasAnyClaim {
                    Button {
                        Task { await executeClaim(activity: activity, elig: elig) }
                    } label: {
                        HStack(spacing: LC.space8) {
                            if claimingId == activity.challengeId {
                                ProgressView().tint(.white).controlSize(.small)
                            } else {
                                Image(systemName: "trophy.fill")
                                    .font(.system(size: 14))
                            }
                            Text(claimingId == activity.challengeId ? "Claiming..." : "Claim Reward")
                                .font(.caption.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                .fill(LC.success)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(claimingId != nil)
                }
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Pipeline Components

    private func pipelineStep(_ label: String, active: Bool, color: Color) -> some View {
        HStack(spacing: LC.space4) {
            Circle()
                .fill(active ? color : color.opacity(0.2))
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(active ? color : LC.textTertiary(scheme))
        }
    }

    private var pipelineArrow: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(LC.textTertiary(scheme))
    }

    private func deadlinePill(_ date: Date) -> some View {
        let remaining = date.timeIntervalSinceNow
        let urgent = remaining > 0 && remaining < 86400
        let color: Color = remaining <= 0 ? .secondary : urgent ? LC.danger : LC.warning

        return HStack(spacing: LC.space4) {
            Image(systemName: "clock")
                .font(.system(size: 9))
            Text(remaining <= 0 ? "Ended" : "Ends \(date.relativeShort)")
                .font(.caption2.weight(.medium))
        }
        .foregroundStyle(color)
    }

    private func categoryGradient(_ category: ChallengeCategory) -> LinearGradient {
        switch category {
        case .fitness: return LC.fitnessGradient
        case .gaming: return LC.gamingGradient
        case .social: return LC.socialGradient
        default: return LC.brandGradient
        }
    }

    private func statusColor(_ activity: MyChallenge) -> Color {
        if let pass = activity.verdictPass { return pass ? LC.success : LC.danger }
        if activity.hasEvidence == true { return LC.warning }
        return LC.info
    }

    // MARK: - Empty States

    private var connectPrompt: some View {
        VStack(spacing: LC.space24) {
            Image(systemName: "flame.fill")
                .font(.system(size: 56))
                .foregroundStyle(LC.accent.opacity(0.3))

            Text("Your Challenges")
                .font(.title3.weight(.bold))

            Text("Connect your wallet to track challenges, submit proof, and claim rewards.")
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
            LazyVStack(spacing: LC.space12) {
                ForEach(0..<4, id: \.self) { _ in
                    ShimmerView().frame(height: 120).clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
                }
            }
            .padding(.horizontal, LC.space16)
            .padding(.top, LC.space16)
        }
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundStyle(.tertiary)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await loadData() }
            }
            .buttonStyle(LCSecondaryButton())
            .frame(width: 140)
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: LC.space20) {
            Image(systemName: "figure.run")
                .font(.system(size: 56))
                .foregroundStyle(LC.accent.opacity(0.3))

            Text("No Challenges Yet")
                .font(.title3.weight(.bold))

            Text("Browse the Explore tab to find your first challenge.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                appState.selectedTab = .explore
            } label: {
                Label("Explore Challenges", systemImage: "magnifyingglass")
            }
            .buttonStyle(LCGoldButton())
            .frame(width: 220)
        }
        .padding(LC.space32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Data Loading

    private func loadData() async {
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

            // Fetch metas and eligibility in parallel
            await withTaskGroup(of: Void.self) { group in
                for activity in activities {
                    let cid = activity.challengeId
                    group.addTask { await fetchMeta(cid) }
                    if activity.verdictPass == true {
                        group.addTask { await fetchEligibility(cid) }
                    }
                }
            }
        } catch {
            if activities.isEmpty { self.error = error.localizedDescription }
        }

        isLoading = false
    }

    private func fetchMeta(_ challengeId: String) async {
        guard challengeMetas[challengeId] == nil else { return }
        let meta = try? await APIClient.shared.fetchChallengeMeta(
            baseURL: appState.serverURL,
            id: challengeId
        )
        if let meta {
            await MainActor.run { challengeMetas[challengeId] = meta }
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

    // MARK: - Claim Execution

    private func executeClaim(activity: MyChallenge, elig: ContractService.ClaimEligibility) async {
        guard let cid = UInt64(activity.challengeId) else { return }
        claimingId = activity.challengeId

        do {
            _ = try? await ContractService.shared.finalize(challengeId: cid)

            if elig.canClaimWinner {
                _ = try await ContractService.shared.claimWinner(challengeId: cid)
            } else if elig.canClaimLoser {
                _ = try await ContractService.shared.claimLoser(challengeId: cid)
            }

            if elig.canClaimTreasury {
                _ = try? await ContractService.shared.treasuryClaimETH(challengeId: cid)
            }

            claimResult = "Claimed!"
            await fetchEligibility(activity.challengeId)
        } catch {
            self.error = error.localizedDescription
        }

        claimingId = nil
    }
}
