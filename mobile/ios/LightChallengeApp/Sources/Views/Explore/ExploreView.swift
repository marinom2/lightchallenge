// ExploreView.swift
// Challenge discovery — Apple-style sectioned layout.
// Featured → Fitness → Trending → Gaming (desktop-only).
// Fitness = full participation on iOS. Gaming = discovery only.

import SwiftUI

struct ExploreView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @EnvironmentObject private var walletManager: WalletManager
    @ObservedObject private var autoProofService = AutoProofService.shared
    @State private var challenges: [ChallengeMeta] = []
    @State private var myActivities: [String: MyChallenge] = [:]
    @State private var eligibility: [String: ContractService.ClaimEligibility] = [:]
    @State private var isLoading = false
    @State private var error: String?
    @State private var navigationPath = NavigationPath()
    @State private var showingCreateChallenge = false
    @State private var searchText = ""
    @State private var showingDesktopOnly = false
    @State private var desktopOnlyChallenge: ChallengeMeta?
    @Environment(\.colorScheme) private var scheme

    // MARK: - Computed Sections

    /// All challenges sorted: active first, then by newest.
    private var sortedChallenges: [ChallengeMeta] {
        challenges.sorted { a, b in
            if a.isActive != b.isActive { return a.isActive }
            return (a.createdAt ?? 0) > (b.createdAt ?? 0)
        }
    }

    /// Featured: newest active fitness challenge with a stake.
    private var featuredChallenge: ChallengeMeta? {
        sortedChallenges.first { $0.isActive && $0.resolvedCategory.isFitness && $0.stakeDisplay != nil }
        ?? sortedChallenges.first { $0.isActive && $0.resolvedCategory.isFitness }
    }

    /// Active fitness challenges (excluding featured).
    private var fitnessChallenges: [ChallengeMeta] {
        sortedChallenges.filter {
            $0.resolvedCategory.isFitness && $0.id != featuredChallenge?.id
        }
    }

    /// Trending: all active non-gaming challenges, excluding featured and fitness-only section.
    private var trendingChallenges: [ChallengeMeta] {
        sortedChallenges.filter {
            $0.isActive && !$0.resolvedCategory.isGaming && $0.id != featuredChallenge?.id
        }
    }

    /// Gaming challenges — shown for discovery, desktop-only.
    private var gamingChallenges: [ChallengeMeta] {
        sortedChallenges.filter { $0.resolvedCategory.isGaming }
    }

    /// Flat filtered list for search mode.
    private var searchResults: [ChallengeMeta] {
        let q = searchText.lowercased()
        return sortedChallenges.filter { c in
            c.displayTitle.lowercased().contains(q)
            || c.displayDescription.lowercased().contains(q)
            || (c.tags ?? []).contains(where: { $0.lowercased().contains(q) })
        }
    }

    private var isSearching: Bool { !searchText.isEmpty }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                if isLoading && challenges.isEmpty {
                    loadingView
                } else if let error, challenges.isEmpty {
                    errorCard(error)
                } else if isSearching {
                    searchResultsList
                } else {
                    discoveryFeed
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $searchText, prompt: "Search challenges")
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
            .task { await loadChallenges() }
            .refreshable { await loadChallenges() }
            .sheet(isPresented: $showingCreateChallenge) {
                CreateChallengeView()
            }
            .sheet(isPresented: $showingDesktopOnly) {
                desktopOnlyModal
            }
            .onChange(of: appState.deepLinkChallengeId) { _, newId in
                if let newId {
                    navigationPath.append(newId)
                    appState.deepLinkChallengeId = nil
                }
            }
            .onAppear {
                if let deepId = appState.deepLinkChallengeId {
                    navigationPath.append(deepId)
                    appState.deepLinkChallengeId = nil
                }
            }
        }
    }

    // MARK: - Discovery Feed (sectioned layout)

    private var discoveryFeed: some View {
        VStack(spacing: LC.space24) {
            // Featured Challenge
            if let featured = featuredChallenge {
                featuredSection(featured)
            }

            // Fitness Challenges
            if !fitnessChallenges.isEmpty {
                sectionHeader("Fitness Challenges", icon: "figure.run", subtitle: "Join & prove on iPhone")
                fitnessCarousel
            }

            // Trending
            if !trendingChallenges.isEmpty {
                sectionHeader("Trending", icon: "flame.fill", subtitle: "\(trendingChallenges.count) active")
                trendingList
            }

            // Gaming Battles (Desktop)
            if !gamingChallenges.isEmpty {
                sectionHeader("Gaming Battles", icon: "gamecontroller.fill", subtitle: "Desktop only", desktopBadge: true)
                gamingCarousel
            }
        }
        .padding(.bottom, LC.space32)
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String, icon: String, subtitle: String, desktopBadge: Bool = false) -> some View {
        HStack(spacing: LC.space8) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(desktopBadge ? LC.violet : LC.accent)
            Text(title)
                .font(.title3.weight(.bold))
            Spacer()
            if desktopBadge {
                HStack(spacing: LC.space4) {
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Desktop")
                        .font(.caption2.weight(.bold))
                }
                .foregroundStyle(LC.violet)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(LC.violet.opacity(0.1))
                .clipShape(Capsule())
            } else {
                Text(subtitle)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
            }
        }
        .padding(.horizontal, LC.space16)
    }

    // MARK: - Featured Challenge

    private func featuredSection(_ challenge: ChallengeMeta) -> some View {
        Button {
            navigationPath.append(challenge.id)
        } label: {
            VStack(alignment: .leading, spacing: LC.space12) {
                // "Featured" label
                HStack(spacing: LC.space6) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("FEATURED")
                        .font(.caption2.weight(.bold))
                        .tracking(0.5)
                }
                .foregroundStyle(.white.opacity(0.9))

                Spacer()

                // Title + description
                VStack(alignment: .leading, spacing: LC.space4) {
                    Text(challenge.displayTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)

                    if !challenge.displayDescription.isEmpty {
                        Text(challenge.displayDescription)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(2)
                    }
                }

                // Pills
                HStack(spacing: LC.space8) {
                    if let stake = challenge.stakeDisplay {
                        featuredPill("lock.fill", stake)
                    }
                    if let end = challenge.endsDate {
                        let remaining = end.timeIntervalSinceNow
                        if remaining > 0 {
                            featuredPill("clock", end.relativeShort)
                        }
                    }
                    featuredPill("figure.run", "Fitness")
                    Spacer()
                }

                // CTA
                let action = actionFor(challenge)
                if case .none = action {} else {
                    let (label, icon, _) = actionLabel(action)
                    HStack(spacing: LC.space6) {
                        Image(systemName: icon)
                            .font(.system(size: 12, weight: .semibold))
                        Text(label)
                            .font(.subheadline.weight(.bold))
                    }
                    .foregroundStyle(LC.accent)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                            .fill(.white)
                    )
                }
            }
            .padding(LC.space20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 220)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [LC.accent, LC.accentDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, LC.space16)
        .padding(.top, LC.space8)
    }

    private func featuredPill(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(text)
                .font(.caption2.weight(.semibold))
        }
        .foregroundStyle(.white.opacity(0.9))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.white.opacity(0.15))
        .clipShape(Capsule())
    }

    // MARK: - Fitness Carousel

    private var fitnessCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LC.space12) {
                ForEach(fitnessChallenges) { challenge in
                    Button {
                        navigationPath.append(challenge.id)
                    } label: {
                        compactCard(challenge)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, LC.space16)
        }
    }

    // MARK: - Trending List

    private var trendingList: some View {
        LazyVStack(spacing: LC.space12) {
            ForEach(trendingChallenges.prefix(6)) { challenge in
                Button {
                    navigationPath.append(challenge.id)
                } label: {
                    challengeCard(challenge)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, LC.space16)
    }

    // MARK: - Gaming Carousel (Desktop Only)

    private var gamingCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LC.space12) {
                ForEach(gamingChallenges) { challenge in
                    Button {
                        desktopOnlyChallenge = challenge
                        showingDesktopOnly = true
                    } label: {
                        gamingCard(challenge)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, LC.space16)
        }
    }

    // MARK: - Compact Card (horizontal scroll)

    private func compactCard(_ challenge: ChallengeMeta) -> some View {
        VStack(alignment: .leading, spacing: LC.space8) {
            HStack {
                LCStatusBadge(
                    text: challenge.isActive ? "Active" : (challenge.status ?? "Ended"),
                    color: challenge.isActive ? LC.success : LC.textTertiary(scheme)
                )
                Spacer()
            }

            Text(challenge.displayTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LC.textPrimary(scheme))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)

            HStack(spacing: LC.space6) {
                if let stake = challenge.stakeDisplay {
                    LCPill(icon: "lock.fill", text: stake, color: LC.accent, small: true)
                }
                if let end = challenge.endsDate, end.timeIntervalSinceNow > 0 {
                    LCPill(icon: "clock", text: end.relativeShort, color: LC.textSecondary(scheme), small: true)
                }
            }
        }
        .padding(LC.space12)
        .frame(width: 200, height: 140)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - Gaming Card (Desktop-Only Badge)

    private func gamingCard(_ challenge: ChallengeMeta) -> some View {
        VStack(alignment: .leading, spacing: LC.space8) {
            HStack {
                HStack(spacing: LC.space4) {
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 9, weight: .bold))
                    Text("Desktop Only")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(LC.violet)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(LC.violet.opacity(0.1))
                .clipShape(Capsule())

                Spacer()

                if challenge.isActive {
                    Circle()
                        .fill(LC.success)
                        .frame(width: 6, height: 6)
                }
            }

            Text(challenge.displayTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LC.textPrimary(scheme))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 0)

            HStack(spacing: LC.space4) {
                Image(systemName: "gamecontroller.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(LC.violet)
                if let game = challenge.game {
                    Text(game)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.textSecondary(scheme))
                } else {
                    Text("Gaming")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.textSecondary(scheme))
                }
            }
        }
        .padding(LC.space12)
        .frame(width: 200, height: 140)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.violet.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Desktop-Only Modal

    private var desktopOnlyModal: some View {
        VStack(spacing: LC.space24) {
            // Icon
            ZStack {
                Circle()
                    .fill(LC.violet.opacity(0.1))
                    .frame(width: 80, height: 80)
                Image(systemName: "desktopcomputer")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(LC.violet)
            }

            VStack(spacing: LC.space8) {
                Text("Desktop Experience")
                    .font(.title3.weight(.bold))

                if let challenge = desktopOnlyChallenge {
                    Text(challenge.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.accent)
                        .multilineTextAlignment(.center)
                }
            }

            VStack(alignment: .leading, spacing: LC.space12) {
                desktopFeatureRow(icon: "gamecontroller.fill", text: "Gaming challenges require desktop tools for proof submission")
                desktopFeatureRow(icon: "display", text: "Visit lightchallenge.io on your computer to participate")
                desktopFeatureRow(icon: "eye.fill", text: "You can still view challenge details and results here on mobile")
            }
            .padding(.horizontal, LC.space8)

            // View Details button (navigates to detail, read-only)
            if let challenge = desktopOnlyChallenge {
                Button {
                    showingDesktopOnly = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        navigationPath.append(challenge.id)
                    }
                } label: {
                    Label("View Details", systemImage: "arrow.right.circle.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(LCSecondaryButton())
            }

            Button {
                showingDesktopOnly = false
            } label: {
                Text("Got It")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(LCGoldButton())
        }
        .padding(LC.space24)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private func desktopFeatureRow(icon: String, text: String) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(LC.violet)
                .frame(width: 24)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
        }
    }

    // MARK: - Search Results (flat list)

    private var searchResultsList: some View {
        VStack(spacing: LC.space12) {
            HStack {
                Text("\(searchResults.count) result\(searchResults.count == 1 ? "" : "s")")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
                Spacer()
            }
            .padding(.horizontal, LC.space16)

            if searchResults.isEmpty {
                emptyState
            } else {
                LazyVStack(spacing: LC.space12) {
                    ForEach(searchResults) { challenge in
                        Button {
                            if challenge.resolvedCategory.isGaming {
                                desktopOnlyChallenge = challenge
                                showingDesktopOnly = true
                            } else {
                                navigationPath.append(challenge.id)
                            }
                        } label: {
                            challengeCard(challenge)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, LC.space16)
            }
        }
        .padding(.bottom, LC.space32)
    }

    // MARK: - Challenge Card (full-width, reused in trending + search)

    private func challengeCard(_ challenge: ChallengeMeta) -> some View {
        let isGaming = challenge.resolvedCategory.isGaming
        let action = isGaming ? .none : actionFor(challenge)

        return VStack(alignment: .leading, spacing: LC.space12) {
            // Top row: category + status
            HStack {
                HStack(spacing: LC.space6) {
                    Image(systemName: challenge.resolvedCategory.icon)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(isGaming ? LC.violet : LC.accent)
                    Text(challenge.resolvedCategory.label)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textSecondary(scheme))
                }

                if isGaming {
                    HStack(spacing: LC.space4) {
                        Image(systemName: "desktopcomputer")
                            .font(.system(size: 9, weight: .bold))
                        Text("Desktop Only")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(LC.violet)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(LC.violet.opacity(0.1))
                    .clipShape(Capsule())
                }

                Spacer()

                if challenge.isActive {
                    LCStatusBadge(text: "Active", color: LC.success)
                } else {
                    LCStatusBadge(text: challenge.status ?? "Ended", color: LC.textTertiary(scheme))
                }
            }

            // Title
            Text(challenge.displayTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LC.textPrimary(scheme))
                .lineLimit(2)

            // Info pills
            HStack(spacing: LC.space8) {
                if let stake = challenge.stakeDisplay {
                    LCPill(icon: "lock.fill", text: stake, color: LC.accent, small: true)
                }
                if let end = challenge.endsDate {
                    let remaining = end.timeIntervalSinceNow
                    if remaining > 0 {
                        LCPill(
                            icon: "clock",
                            text: end.relativeShort,
                            color: remaining < 86400 ? LC.danger : LC.textSecondary(scheme),
                            small: true
                        )
                    }
                }
                Spacer()
            }

            // Participation status pill (auto-proof, evaluating, passed/failed)
            if let (statusText, statusIcon, statusColor) = participationStatus(challenge), case .none = action {
                HStack(spacing: LC.space6) {
                    Image(systemName: statusIcon)
                        .font(.system(size: 10, weight: .semibold))
                    Text(statusText)
                        .font(.caption2.weight(.bold))
                }
                .foregroundStyle(statusColor)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(statusColor.opacity(0.1))
                .clipShape(Capsule())
            }

            // Action CTA (fitness only — no actions for gaming on mobile)
            switch action {
            case .join, .claim:
                let (label, icon, color) = actionLabel(action)
                Button {
                    handleAction(action, challenge: challenge)
                } label: {
                    HStack(spacing: LC.space6) {
                        Image(systemName: icon)
                            .font(.system(size: 11, weight: .semibold))
                        Text(label)
                            .font(.caption.weight(.bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 34)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                            .fill(color)
                    )
                }
                .buttonStyle(.plain)
            case .none:
                EmptyView()
            }
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(isGaming ? LC.violet.opacity(0.2) : LC.cardBorder(scheme), lineWidth: 1)
        )
    }

    // MARK: - Loading / Empty / Error

    private var loadingView: some View {
        VStack(spacing: LC.space16) {
            // Featured shimmer
            ShimmerView().frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
                .padding(.horizontal, LC.space16)

            // Carousel shimmer
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: LC.space12) {
                    ForEach(0..<3, id: \.self) { _ in
                        ShimmerView().frame(width: 200, height: 140)
                            .clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
                    }
                }
                .padding(.horizontal, LC.space16)
            }

            // List shimmer
            ForEach(0..<3, id: \.self) { _ in
                ShimmerView().frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: LC.radiusLG))
            }
            .padding(.horizontal, LC.space16)
        }
        .padding(.top, LC.space8)
    }

    private func errorCard(_ message: String) -> some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(LC.textTertiary(scheme))
            Text("Unable to Load")
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
            Button("Try Again") {
                Task { await loadChallenges() }
            }
            .buttonStyle(LCSecondaryButton())
            .frame(width: 160)
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40))
                .foregroundStyle(LC.textTertiary(scheme))
            Text(isSearching ? "No Results" : "No Challenges Yet")
                .font(.subheadline.weight(.semibold))
            Text(isSearching
                ? "Try a different search term."
                : "Pull to refresh or create the first challenge.")
                .font(.caption)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
        }
        .padding(LC.space48)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Contextual Action

    private enum ChallengeAction {
        case join
        case claim
        case none
    }

    private func actionFor(_ challenge: ChallengeMeta) -> ChallengeAction {
        // No mobile actions for gaming challenges
        guard !challenge.resolvedCategory.isGaming else { return .none }
        guard appState.hasWallet else { return .none }

        let now = Date()
        let activity = myActivities[challenge.id]

        // 1. Claim: challenge finalized/ended + verdict received + on-chain claim eligible
        if !challenge.isActive, activity != nil, eligibility[challenge.id]?.hasAnyClaim == true {
            return .claim
        }

        // 2. Join: challenge active + join window open + not yet joined
        if challenge.isActive, activity == nil {
            let joinOpen = challenge.endsDate.map { $0 > now } ?? true
            if joinOpen { return .join }
        }

        // No manual "Submit Proof" — auto-proof handles it after joining
        return .none
    }

    /// Status text for challenges where user is participating (shown as pill, not a button).
    private func participationStatus(_ challenge: ChallengeMeta) -> (String, String, Color)? {
        guard let activity = myActivities[challenge.id] else { return nil }

        if let pass = activity.verdictPass {
            return pass
                ? ("Passed", "checkmark.seal.fill", LC.success)
                : ("Failed", "xmark.seal.fill", LC.danger)
        }
        if activity.hasEvidence == true {
            return ("Evaluating", "hourglass", LC.warning)
        }

        // Joined but no evidence — show phase-appropriate status
        let now = Date()
        if let endDate = challenge.endsDate, endDate > now {
            // Challenge period still running
            return ("In Progress", "figure.run", LC.accent)
        }

        // Check auto-proof status
        if let proofStatus = autoProofService.status[challenge.id] {
            return (proofStatus.label, proofStatus.icon, proofStatus.color)
        }

        if let deadline = challenge.proofDeadlineDate, deadline <= now {
            return ("Deadline Passed", "clock.badge.xmark", LC.danger)
        }

        // In proof window, auto-proof should handle this
        return ("Proof Pending", "arrow.triangle.2.circlepath", LC.accent)
    }

    private func actionLabel(_ action: ChallengeAction) -> (String, String, Color) {
        switch action {
        case .join: return ("Join", "person.badge.plus", LC.accent)
        case .claim: return ("Claim", "trophy.fill", LC.success)
        case .none: return ("", "", .clear)
        }
    }

    private func handleAction(_ action: ChallengeAction, challenge: ChallengeMeta) {
        switch action {
        case .join:
            navigationPath.append(challenge.id)
        case .claim:
            navigationPath.append(challenge.id)
        case .none:
            break
        }
    }

    // MARK: - Data

    private func loadChallenges() async {
        isLoading = true
        error = nil

        if challenges.isEmpty, let cached = await CacheService.shared.loadCachedChallenges() {
            challenges = cached
        }

        do {
            var fresh = try await APIClient.shared.fetchChallenges(baseURL: appState.serverURL)
            fresh.sort { a, b in
                if a.isActive != b.isActive { return a.isActive }
                return (a.createdAt ?? 0) > (b.createdAt ?? 0)
            }
            challenges = fresh
            await CacheService.shared.cacheChallenges(fresh)
        } catch {
            if challenges.isEmpty {
                self.error = error.localizedDescription
            }
        }

        if appState.hasWallet {
            await loadMyActivities()
        }

        isLoading = false
    }

    private func loadMyActivities() async {
        do {
            let activities = try await APIClient.shared.fetchMyActivity(
                baseURL: appState.serverURL,
                subject: appState.walletAddress
            )
            var lookup: [String: MyChallenge] = [:]
            for a in activities { lookup[a.challengeId] = a }
            myActivities = lookup

            // Check claim eligibility for all finalized challenges the user participated in
            // (winners, losers, and refunds on canceled challenges)
            for a in activities where a.verdictPass != nil {
                if let cid = UInt64(a.challengeId) {
                    let challenge = challenges.first { $0.id == a.challengeId }
                    // Only check on-chain if challenge is no longer active
                    if challenge?.isActive == false || challenge == nil {
                        let elig = await ContractService.shared.checkClaimEligibility(
                            challengeId: cid,
                            user: appState.walletAddress
                        )
                        eligibility[a.challengeId] = elig
                    }
                }
            }

            // Auto-proof: check for joined challenges that need proof submission
            autoProofService.checkPendingChallenges(
                challenges: challenges,
                activities: lookup,
                appState: appState,
                healthService: healthService
            )
        } catch {
            // Non-critical
        }
    }
}
