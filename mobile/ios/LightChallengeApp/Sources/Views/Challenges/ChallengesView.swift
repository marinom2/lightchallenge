// ChallengesView.swift
// Apple Music-style 4-card action hub.
// Create | Evidence | My Challenges | Claim
// Each card drills into a sub-view with the relevant challenge list.

import SwiftUI

// MARK: - Hub Destination

enum ChallengeHub: String, Hashable {
    case evidence
    case myChallenges
    case claim
}

// MARK: - ChallengesView

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
    @Environment(\.colorScheme) private var scheme

    // MARK: - Computed

    /// Activities deduplicated by challengeId (keeps first occurrence).
    private var deduplicatedActivities: [MyChallenge] {
        var seen = Set<String>()
        return activities.filter { seen.insert($0.challengeId).inserted }
    }

    private var evidenceCount: Int {
        deduplicatedActivities.filter { a in a.hasEvidence != true && a.verdictPass == nil }.count
    }

    private var claimableCount: Int {
        deduplicatedActivities.filter { a in
            a.isOnChain && a.verdictPass != nil && (eligibility[a.challengeId]?.hasAnyClaim == true)
        }.count
    }

    private var passedCount: Int {
        deduplicatedActivities.filter { $0.verdictPass == true }.count
    }

    /// Recent challenges sorted by creation date (newest first), then by stake amount.
    private var recentSorted: [MyChallenge] {
        deduplicatedActivities.sorted { a, b in
            let aCreated = challengeMetas[a.challengeId]?.createdDate ?? .distantPast
            let bCreated = challengeMetas[b.challengeId]?.createdDate ?? .distantPast
            if abs(aCreated.timeIntervalSince(bCreated)) > 60 { return aCreated > bCreated }
            let aStake = Double(challengeMetas[a.challengeId]?.funds?.stake ?? "0") ?? 0
            let bStake = Double(challengeMetas[b.challengeId]?.funds?.stake ?? "0") ?? 0
            return aStake > bStake
        }
    }

    private var gridColumns: [GridItem] {
        [GridItem(.flexible(), spacing: LC.space12), GridItem(.flexible(), spacing: LC.space12)]
    }

    // MARK: - Body

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if !appState.hasWallet {
                    connectPrompt
                } else if isLoading && activities.isEmpty {
                    loadingView
                } else if let error, activities.isEmpty {
                    errorView(error)
                } else {
                    hubView
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
            .navigationDestination(for: ChallengeHub.self) { hub in
                switch hub {
                case .evidence:
                    EvidenceHubView(
                        activities: deduplicatedActivities,
                        challengeMetas: challengeMetas,
                        selectedProof: $selectedProof
                    )
                case .myChallenges:
                    MyChallengesListView(
                        activities: deduplicatedActivities,
                        challengeMetas: challengeMetas,
                        eligibility: eligibility,
                        selectedProof: $selectedProof,
                        claimingId: $claimingId,
                        onClaim: executeClaim
                    )
                case .claim:
                    ClaimHubView(
                        activities: deduplicatedActivities.filter { $0.isOnChain && $0.verdictPass != nil && eligibility[$0.challengeId]?.hasAnyClaim == true },
                        challengeMetas: challengeMetas,
                        eligibility: eligibility,
                        claimingId: $claimingId,
                        onClaim: executeClaim
                    )
                }
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

    // MARK: - Hub View (4-card grid)

    private var hubView: some View {
        ScrollView {
            VStack(spacing: LC.space24) {
                // Summary stats
                summaryHeader

                // 4 action cards
                LazyVGrid(columns: gridColumns, spacing: LC.space12) {
                    // Create
                    actionCard(
                        title: "Create",
                        subtitle: "Start a challenge",
                        icon: "plus.circle.fill",
                        gradient: [Color(hex: 0x2563EB), Color(hex: 0x1D4ED8)],
                        badge: nil
                    ) {
                        showingCreateChallenge = true
                    }

                    // Evidence
                    actionCard(
                        title: "Evidence",
                        subtitle: evidenceCount > 0 ? "\(evidenceCount) pending" : "All submitted",
                        icon: "doc.text.magnifyingglass",
                        gradient: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)],
                        badge: evidenceCount > 0 ? "\(evidenceCount)" : nil
                    ) {
                        navigationPath.append(ChallengeHub.evidence)
                    }

                    // My Challenges
                    actionCard(
                        title: "My Challenges",
                        subtitle: "\(deduplicatedActivities.count) total",
                        icon: "flame.fill",
                        gradient: [Color(hex: 0xF97316), Color(hex: 0xEA580C)],
                        badge: nil
                    ) {
                        navigationPath.append(ChallengeHub.myChallenges)
                    }

                    // Claim
                    actionCard(
                        title: "Claim",
                        subtitle: claimableCount > 0 ? "\(claimableCount) rewards" : "No rewards yet",
                        icon: "trophy.fill",
                        gradient: [Color(hex: 0xEAB308), Color(hex: 0xCA8A04)],
                        badge: claimableCount > 0 ? "\(claimableCount)" : nil
                    ) {
                        navigationPath.append(ChallengeHub.claim)
                    }
                }
                .padding(.horizontal, LC.space16)

                // Recent activity preview
                if !deduplicatedActivities.isEmpty {
                    recentSection
                }
            }
            .padding(.bottom, LC.space32)
        }
    }

    // MARK: - Action Card

    private func actionCard(
        title: String,
        subtitle: String,
        icon: String,
        gradient: [Color],
        badge: String?,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            ZStack(alignment: .bottomLeading) {
                // Gradient background
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: gradient,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Decorative icon (vertically centered, right side)
                Image(systemName: icon)
                    .font(.system(size: 70, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.15))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .offset(x: 40)

                // Content
                VStack(alignment: .leading, spacing: LC.space4) {
                    // Badge (top-right)
                    if let badge {
                        HStack {
                            Spacer()
                            Text(badge)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(.white.opacity(0.25))
                                .clipShape(Capsule())
                        }
                    }

                    Spacer()

                    Text(title)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)

                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white.opacity(0.8))
                }
                .padding(LC.space16)
            }
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!walletManager.isConnected && title != "Create")
        .opacity(walletManager.isConnected || title == "Create" ? 1 : 0.5)
    }

    // MARK: - Summary Header

    private var summaryHeader: some View {
        HStack(spacing: LC.space16) {
            summaryStatPill(value: "\(deduplicatedActivities.count)", label: "Total", icon: "flame.fill", color: LC.accent)
            summaryStatPill(value: "\(evidenceCount)", label: "Proof Due", icon: "exclamationmark.circle.fill", color: LC.warning)
            summaryStatPill(value: "\(passedCount)", label: "Passed", icon: "checkmark.circle.fill", color: LC.success)
            summaryStatPill(value: "\(claimableCount)", label: "Claimable", icon: "trophy.fill", color: LC.accent)
        }
        .padding(.horizontal, LC.space16)
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

    // MARK: - Recent Activity Preview

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack {
                Text("Recent")
                    .font(.title3.weight(.bold))
                Spacer()
                Button {
                    navigationPath.append(ChallengeHub.myChallenges)
                } label: {
                    Text("See All")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.accent)
                }
            }
            .padding(.horizontal, LC.space16)

            ForEach(recentSorted.prefix(3)) { activity in
                Button {
                    navigationPath.append(activity.challengeId)
                } label: {
                    recentRow(activity)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func recentRow(_ activity: MyChallenge) -> some View {
        let meta = challengeMetas[activity.challengeId]

        return HStack(spacing: LC.space12) {
            Image(systemName: meta?.resolvedCategory.icon ?? "flame.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(statusGradient(activity))
                )

            VStack(alignment: .leading, spacing: LC.space2) {
                Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)

                Text(activity.statusLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(statusColor(activity))
            }

            Spacer()

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
        .padding(.horizontal, LC.space16)
    }

    private func statusGradient(_ activity: MyChallenge) -> LinearGradient {
        if activity.verdictPass == true { return LinearGradient(colors: [LC.success, Color(hex: 0x16A34A)], startPoint: .topLeading, endPoint: .bottomTrailing) }
        if activity.verdictPass == false { return LinearGradient(colors: [LC.danger, Color(hex: 0xDC2626)], startPoint: .topLeading, endPoint: .bottomTrailing) }
        if activity.hasEvidence == true { return LinearGradient(colors: [LC.warning, Color(hex: 0xCA8A04)], startPoint: .topLeading, endPoint: .bottomTrailing) }
        return LC.fitnessGradient
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
            VStack(spacing: LC.space16) {
                HStack(spacing: LC.space16) {
                    ForEach(0..<4, id: \.self) { _ in
                        ShimmerView().frame(height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: LC.radiusMD))
                    }
                }
                .padding(.horizontal, LC.space16)

                LazyVGrid(columns: gridColumns, spacing: LC.space12) {
                    ForEach(0..<4, id: \.self) { _ in
                        ShimmerView().frame(height: 160)
                            .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
                    }
                }
                .padding(.horizontal, LC.space16)
            }
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

            await withTaskGroup(of: Void.self) { group in
                for activity in activities {
                    let cid = activity.challengeId
                    group.addTask { await fetchMeta(cid) }
                    if activity.verdictPass != nil {
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
                _ = try? await ContractService.shared.treasuryClaimETH(challengeId: cid, amount: elig.allowance)
            }

            claimResult = "Claimed!"
            await fetchEligibility(activity.challengeId)
        } catch {
            self.error = error.localizedDescription
        }

        claimingId = nil
    }
}

// MARK: - Evidence Hub View

struct EvidenceHubView: View {
    let activities: [MyChallenge]
    let challengeMetas: [String: ChallengeMeta]
    @Binding var selectedProof: ProofTarget?
    @Environment(\.colorScheme) private var scheme

    private var pending: [MyChallenge] {
        activities.filter { $0.hasEvidence != true && $0.verdictPass == nil }
    }

    private var submitted: [MyChallenge] {
        activities.filter { $0.hasEvidence == true }
    }

    var body: some View {
        ScrollView {
            if activities.isEmpty {
                emptyState
            } else {
                LazyVStack(spacing: LC.space12) {
                    if !pending.isEmpty {
                        sectionHeader("Pending", icon: "exclamationmark.circle.fill", color: LC.warning, count: pending.count)
                        ForEach(pending) { activity in
                            evidenceRow(activity, isSubmitted: false)
                        }
                    }

                    if !submitted.isEmpty {
                        sectionHeader("Submitted", icon: "checkmark.circle.fill", color: LC.success, count: submitted.count)
                            .padding(.top, pending.isEmpty ? 0 : LC.space8)
                        ForEach(submitted) { activity in
                            evidenceRow(activity, isSubmitted: true)
                        }
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.bottom, LC.space32)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Evidence")
        .navigationBarTitleDisplayMode(.large)
    }

    private func sectionHeader(_ title: String, icon: String, color: Color, count: Int) -> some View {
        HStack(spacing: LC.space6) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(LC.textPrimary(scheme))
            Spacer()
            Text("\(count)")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(color))
        }
        .padding(.top, LC.space8)
    }

    private func evidenceRow(_ activity: MyChallenge, isSubmitted: Bool) -> some View {
        let meta = challengeMetas[activity.challengeId]

        return VStack(alignment: .leading, spacing: LC.space12) {
            HStack(spacing: LC.space12) {
                Image(systemName: meta?.resolvedCategory.icon ?? "doc.text.magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                            .fill(isSubmitted ? LinearGradient(colors: [LC.success, Color(hex: 0x16A34A)], startPoint: .topLeading, endPoint: .bottomTrailing) : LC.fitnessGradient)
                    )

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .lineLimit(1)

                    if isSubmitted {
                        Text("Evidence already submitted")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(LC.success)
                    } else if let end = meta?.endsDate {
                        let remaining = end.timeIntervalSinceNow
                        Text(remaining <= 0 ? "Challenge ended" : "Ends \(end.relativeShort)")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(remaining <= 0 ? LC.textSecondary(scheme) : LC.warning)
                    }
                }

                Spacer()

                NavigationLink(value: activity.challengeId) {
                    Text("View")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(LC.accent)
                }
            }

            if !isSubmitted {
                // Submit button — only for pending
                Button {
                    selectedProof = ProofTarget(
                        challengeId: activity.challengeId,
                        modelHash: meta?.proof?.modelHash ?? meta?.modelHash ?? ServerConfig.defaultFitnessModelHash
                    )
                } label: {
                    HStack(spacing: LC.space8) {
                        Image(systemName: "heart.text.square.fill")
                            .font(.system(size: 14))
                        Text("Submit Evidence")
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
        }
        .padding(LC.space16)
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
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(LC.success.opacity(0.5))
            Text("No Challenges Yet")
                .font(.headline)
            Text("Join a challenge to start submitting evidence.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - My Challenges List View (Apple Fitness-style)

struct MyChallengesListView: View {
    let activities: [MyChallenge]
    let challengeMetas: [String: ChallengeMeta]
    let eligibility: [String: ContractService.ClaimEligibility]
    @Binding var selectedProof: ProofTarget?
    @Binding var claimingId: String?
    var onClaim: (MyChallenge, ContractService.ClaimEligibility) async -> Void
    @State private var selectedFilter: FitnessType? = nil
    @State private var expandedSections: Set<String> = ["needsAction", "active"]
    @Environment(\.colorScheme) private var scheme

    // MARK: - Filtering

    private var availableFilters: [FitnessType] {
        FitnessType.allCases.filter { type in
            activities.contains { a in
                guard let meta = challengeMetas[a.challengeId] else { return false }
                return type.matches(meta)
            }
        }
    }

    private var filtered: [MyChallenge] {
        guard let type = selectedFilter else { return activities }
        return activities.filter { a in
            guard let meta = challengeMetas[a.challengeId] else { return false }
            return type.matches(meta)
        }
    }

    // MARK: - Status Groups (sorted)

    private var needsActionIds: Set<String> {
        Set(needsActionUnsorted.map(\.id))
    }

    /// Needs Action: no evidence submitted yet, OR has a claimable reward.
    /// Sorted by due date (earliest deadline first).
    private var needsActionUnsorted: [MyChallenge] {
        filtered.filter { a in
            if a.hasEvidence != true && a.verdictPass == nil { return true }
            if a.verdictPass != nil && eligibility[a.challengeId]?.hasAnyClaim == true { return true }
            return false
        }
    }

    private var needsAction: [MyChallenge] {
        needsActionUnsorted.sorted { a, b in
            let aEnd = challengeMetas[a.challengeId]?.endsDate ?? .distantFuture
            let bEnd = challengeMetas[b.challengeId]?.endsDate ?? .distantFuture
            return aEnd < bEnd
        }
    }

    /// Active: evidence submitted, awaiting verdict.
    /// Sorted by most recent start date, then by stake amount descending.
    private var active: [MyChallenge] {
        filtered.filter { a in
            a.verdictPass == nil && a.hasEvidence == true && !needsActionIds.contains(a.id)
        }.sorted { a, b in
            let aStart = challengeMetas[a.challengeId]?.startDate ?? .distantPast
            let bStart = challengeMetas[b.challengeId]?.startDate ?? .distantPast
            if aStart != bStart { return aStart > bStart }
            let aStake = Double(challengeMetas[a.challengeId]?.funds?.stake ?? "0") ?? 0
            let bStake = Double(challengeMetas[b.challengeId]?.funds?.stake ?? "0") ?? 0
            return aStake > bStake
        }
    }

    /// Passed: verdict is pass, no pending claim.
    private var passed: [MyChallenge] {
        filtered.filter { a in
            a.verdictPass == true && !needsActionIds.contains(a.id)
        }
    }

    /// Failed: verdict is fail, no pending claim.
    private var failed: [MyChallenge] {
        filtered.filter { a in
            a.verdictPass == false && !needsActionIds.contains(a.id)
        }
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Activity type filters
                if !availableFilters.isEmpty {
                    filterChips
                        .padding(.bottom, LC.space12)
                }

                // Collapsible sections (Apple Fitness style)
                if !needsAction.isEmpty {
                    collapsibleSection("needsAction", title: "Needs Action", icon: "exclamationmark.circle.fill", color: LC.warning, items: needsAction)
                }
                if !active.isEmpty {
                    collapsibleSection("active", title: "Active", icon: "figure.run", color: LC.accent, items: active)
                }
                if !passed.isEmpty {
                    collapsibleSection("passed", title: "Passed", icon: "checkmark.circle.fill", color: LC.success, items: passed)
                }
                if !failed.isEmpty {
                    collapsibleSection("failed", title: "Failed", icon: "xmark.circle.fill", color: LC.danger, items: failed)
                }

                if filtered.isEmpty {
                    emptyState
                        .padding(.top, LC.space48)
                }
            }
            .padding(.bottom, LC.space32)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("My Challenges")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Collapsible Section

    private func collapsibleSection(_ key: String, title: String, icon: String, color: Color, items: [MyChallenge]) -> some View {
        let isExpanded = expandedSections.contains(key)

        return VStack(spacing: 0) {
            // Tappable header with chevron
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if isExpanded {
                        expandedSections.remove(key)
                    } else {
                        expandedSections.insert(key)
                    }
                }
            } label: {
                HStack(spacing: LC.space8) {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(color)

                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("\(items.count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(color))

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LC.textTertiary(scheme))
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Expandable content
            if isExpanded {
                LazyVStack(spacing: LC.space8) {
                    ForEach(items) { activity in
                        NavigationLink(value: activity.challengeId) {
                            challengeRow(activity, sectionColor: color)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.bottom, LC.space12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LC.space8) {
                filterPill("All", icon: "square.grid.2x2", type: nil)
                ForEach(availableFilters) { type in
                    filterPill(type.label, icon: type.icon, type: type)
                }
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, LC.space4)
        }
    }

    private func filterPill(_ title: String, icon: String, type: FitnessType?) -> some View {
        let selected = selectedFilter == type
        return Button {
            withAnimation(.spring(response: 0.3)) {
                selectedFilter = selected ? nil : type
            }
        } label: {
            HStack(spacing: LC.space4) {
                Image(systemName: icon).font(.system(size: 11, weight: .semibold))
                Text(title).font(.caption.weight(.semibold))
            }
            .foregroundStyle(selected ? .white : LC.textPrimary(scheme))
            .padding(.horizontal, LC.space12)
            .padding(.vertical, LC.space8)
            .background(Capsule().fill(selected ? LC.accent : Color(.secondarySystemGroupedBackground)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Challenge Row (Apple Fitness style)

    private func challengeRow(_ activity: MyChallenge, sectionColor: Color) -> some View {
        let meta = challengeMetas[activity.challengeId]
        let fitnessIcon = activityIcon(for: meta)

        return HStack(spacing: LC.space12) {
            Image(systemName: fitnessIcon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(sectionColor)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: LC.space2) {
                Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                    .font(.body.weight(.medium))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)

                HStack(spacing: LC.space4) {
                    Text(activity.statusLabel)
                        .font(.caption)
                        .foregroundStyle(statusColor(activity))

                    if let end = meta?.endsDate {
                        Text("·")
                            .font(.caption)
                            .foregroundStyle(LC.textTertiary(scheme))
                        Text(end.timeIntervalSinceNow > 0 ? "Ends \(end.relativeShort)" : "Ended")
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
            }

            Spacer()

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

    // MARK: - Helpers

    private func activityIcon(for meta: ChallengeMeta?) -> String {
        guard let meta else { return "figure.run" }
        for type in FitnessType.allCases {
            if type.matches(meta) { return type.icon }
        }
        return meta.resolvedCategory.icon
    }

    private func statusColor(_ activity: MyChallenge) -> Color {
        if let pass = activity.verdictPass { return pass ? LC.success : LC.danger }
        if activity.hasEvidence == true { return LC.warning }
        return .secondary
    }

    private var emptyState: some View {
        VStack(spacing: LC.space12) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)
            Text("No challenges")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(LC.space32)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Claim Hub View

struct ClaimHubView: View {
    let activities: [MyChallenge]
    let challengeMetas: [String: ChallengeMeta]
    let eligibility: [String: ContractService.ClaimEligibility]
    @Binding var claimingId: String?
    var onClaim: (MyChallenge, ContractService.ClaimEligibility) async -> Void
    @State private var expandedSections: Set<String> = ["winner", "cashback"]
    @Environment(\.colorScheme) private var scheme

    private var winners: [MyChallenge] {
        activities.filter { $0.verdictPass == true }
    }

    private var cashback: [MyChallenge] {
        activities.filter { $0.verdictPass != true }
    }

    var body: some View {
        ScrollView {
            if activities.isEmpty {
                emptyState
            } else {
                VStack(spacing: 0) {
                    if !winners.isEmpty {
                        claimSection("winner", title: "Winner Rewards", icon: "trophy.fill", color: LC.success, items: winners)
                    }
                    if !cashback.isEmpty {
                        claimSection("cashback", title: "Cashback", icon: "arrow.uturn.backward.circle.fill", color: LC.warning, items: cashback)
                    }
                }
                .padding(.bottom, LC.space32)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Claim Rewards")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Collapsible Section

    private func claimSection(_ key: String, title: String, icon: String, color: Color, items: [MyChallenge]) -> some View {
        let isExpanded = expandedSections.contains(key)

        return VStack(spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if isExpanded {
                        expandedSections.remove(key)
                    } else {
                        expandedSections.insert(key)
                    }
                }
            } label: {
                HStack(spacing: LC.space8) {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(color)

                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("\(items.count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(color))

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LC.textTertiary(scheme))
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                LazyVStack(spacing: LC.space8) {
                    ForEach(items) { activity in
                        claimRow(activity)
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.bottom, LC.space12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func claimRow(_ activity: MyChallenge) -> some View {
        let meta = challengeMetas[activity.challengeId]
        let elig = eligibility[activity.challengeId]

        return VStack(alignment: .leading, spacing: LC.space12) {
            NavigationLink(value: activity.challengeId) {
                HStack(spacing: LC.space12) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(
                            RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: 0xEAB308), Color(hex: 0xCA8A04)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )

                    VStack(alignment: .leading, spacing: LC.space2) {
                        Text(meta?.displayTitle ?? "Challenge #\(activity.challengeId)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                            .lineLimit(1)

                        if activity.verdictPass == true {
                            LCStatusBadge(text: "Winner", color: LC.success)
                        } else {
                            LCStatusBadge(text: "Cashback", color: LC.warning)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
            .buttonStyle(.plain)

            if let elig {
                Button {
                    Task { await onClaim(activity, elig) }
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
                    .frame(height: 40)
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
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "trophy")
                .font(.system(size: 48))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("No Rewards Yet")
                .font(.headline)
            Text("Complete challenges to earn claimable rewards.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
