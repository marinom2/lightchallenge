// ExploreView.swift
// Static featured hero + live signals + category grid.
// No carousel, no dots, no rotation, no "+" button.

import SwiftUI

// MARK: - Fitness Type

enum FitnessType: String, CaseIterable, Identifiable, Hashable {
    case walking, running, cycling, swimming, strength, hiking

    var id: String { rawValue }

    var label: String {
        switch self {
        case .walking: "Walking"
        case .running: "Running"
        case .cycling: "Cycling"
        case .swimming: "Swimming"
        case .strength: "Strength"
        case .hiking: "Hiking"
        }
    }

    var icon: String {
        switch self {
        case .walking: "figure.walk"
        case .running: "figure.run"
        case .cycling: "figure.outdoor.cycle"
        case .swimming: "figure.pool.swim"
        case .strength: "figure.strengthtraining.traditional"
        case .hiking: "figure.hiking"
        }
    }

    /// Uniform icon size for all cards — consistent visual weight.
    static let cardIconSize: CGFloat = 74

    /// Richer three-stop gradient for premium depth.
    var premiumGradient: [Color] {
        switch self {
        case .walking:  [Color(hex: 0x22C55E), Color(hex: 0x1AAD52), Color(hex: 0x148F43)]
        case .running:  [Color(hex: 0x3B82F6), Color(hex: 0x2563EB), Color(hex: 0x1D4FD8)]
        case .cycling:  [Color(hex: 0xFB923C), Color(hex: 0xF97316), Color(hex: 0xE05E0A)]
        case .swimming: [Color(hex: 0x22D3EE), Color(hex: 0x06B6D4), Color(hex: 0x0891B2)]
        case .strength: [Color(hex: 0xF87171), Color(hex: 0xEF4444), Color(hex: 0xDC2626)]
        case .hiking:   [Color(hex: 0xA78BFA), Color(hex: 0x8B5CF6), Color(hex: 0x7C3AED)]
        }
    }

    var gradient: [Color] {
        switch self {
        case .walking:  [Color(hex: 0x22C55E), Color(hex: 0x16A34A)]
        case .running:  [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)]
        case .cycling:  [Color(hex: 0xF97316), Color(hex: 0xEA580C)]
        case .swimming: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)]
        case .strength: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)]
        case .hiking:   [Color(hex: 0x8B5CF6), Color(hex: 0x7C3AED)]  // Purple — distinct from Walking green
        }
    }

    /// Subtle glow color for the category card.
    var glowColor: Color {
        gradient.first ?? LC.accent
    }

    /// modelId segments that identify this fitness type in the DB.
    private var modelIdSegments: [String] {
        switch self {
        case .walking:  return ["steps"]
        case .running:  return ["running", "distance"]
        case .cycling:  return ["cycling"]
        case .swimming: return ["swimming"]
        case .strength: return ["strength"]
        case .hiking:   return ["hiking"]
        }
    }

    /// Tag values that identify this fitness type.
    private var tagValues: [String] {
        switch self {
        case .walking:  return ["walking", "steps"]
        case .running:  return ["running"]
        case .cycling:  return ["cycling"]
        case .swimming: return ["swimming"]
        case .strength: return ["strength"]
        case .hiking:   return ["hiking"]
        }
    }

    /// Match a challenge to this fitness type using DB-set fields only.
    func matches(_ challenge: ChallengeMeta) -> Bool {
        if let mid = challenge.modelId?.lowercased() {
            if mid.hasPrefix("fitness.") {
                return modelIdSegments.contains { mid.hasPrefix("fitness.\($0)") }
            }
            let afterDot = mid.components(separatedBy: ".").dropFirst().joined(separator: ".")
            if !afterDot.isEmpty {
                return modelIdSegments.contains { afterDot.hasPrefix($0) }
            }
        }

        if let tags = challenge.tags?.map({ $0.lowercased() }), !tags.isEmpty {
            return tagValues.contains { tags.contains($0) }
        }

        return false
    }
}

// MARK: - ExploreView

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
    @State private var searchText = ""
    @State private var tokenPrice: Double?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass

    // MARK: - Grid

    private var gridColumns: [GridItem] {
        let count = sizeClass == .regular ? 3 : 2
        return Array(repeating: GridItem(.flexible(), spacing: LC.space12), count: count)
    }

    // MARK: - Computed

    private var sortedChallenges: [ChallengeMeta] {
        challenges.sorted { a, b in
            if a.isActive != b.isActive { return a.isActive }
            return (a.createdAt ?? 0) > (b.createdAt ?? 0)
        }
    }

    private var activeChallenges: [ChallengeMeta] {
        sortedChallenges.filter { $0.isActive && $0.resolvedCategory.isFitness }
    }

    /// Single featured challenge: highest combined score (participants + pool).
    private var featuredChallenge: ChallengeMeta? {
        activeChallenges
            .max { a, b in
                let scoreA = featuredScore(a)
                let scoreB = featuredScore(b)
                return scoreA < scoreB
            }
    }

    /// Score = stake + (participantCount * 0.01) so participants break ties.
    private func featuredScore(_ c: ChallengeMeta) -> Double {
        let stake = Double(c.funds?.stake ?? "0") ?? 0
        let participants = Double(c.participantCount ?? 0)
        return stake + participants * 0.01
    }

    /// Total value in play across active challenges (formatted as USD or LCAI).
    private var totalInPlay: String {
        let totalWei = activeChallenges.reduce(0.0) { sum, c in
            let wei = Double(c.funds?.stake ?? "0") ?? 0
            return sum + wei
        }
        return LCFormatter.formatUSD(wei: totalWei, tokenPrice: tokenPrice)
    }

    private func activeCount(for type: FitnessType) -> Int {
        sortedChallenges.filter { $0.isActive && type.matches($0) }.count
    }

    /// Max stake for a fitness type, formatted as USD or LCAI.
    private func maxStakeDisplay(for type: FitnessType) -> String? {
        let maxWei = sortedChallenges
            .filter { $0.isActive && type.matches($0) }
            .compactMap { Double($0.funds?.stake ?? "0") }
            .max() ?? 0
        guard maxWei > 0 else { return nil }
        return LCFormatter.formatUSD(wei: maxWei, tokenPrice: tokenPrice)
    }

    private var isSearching: Bool { !searchText.isEmpty }

    private var searchResults: [ChallengeMeta] {
        let q = searchText.lowercased()
        return sortedChallenges.filter { c in
            c.displayTitle.lowercased().contains(q)
            || c.displayDescription.lowercased().contains(q)
            || (c.tags ?? []).contains(where: { $0.lowercased().contains(q) })
        }
    }

    // MARK: - Body

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
                    mainContent
                }
            }
            .background(LC.pageBg(scheme))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Find a challenge")
            .navigationDestination(for: String.self) { challengeId in
                ChallengeDetailView(challengeId: challengeId)
            }
            .navigationDestination(for: FitnessType.self) { type in
                CategoryDetailView(
                    fitnessType: type,
                    challenges: sortedChallenges,
                    myActivities: myActivities,
                    eligibility: eligibility
                )
            }
            .task {
                async let priceTask: () = loadTokenPrice()
                async let challengesTask: () = loadChallenges()
                _ = await (priceTask, challengesTask)
            }
            .refreshable {
                async let priceTask: () = loadTokenPrice()
                async let challengesTask: () = loadChallenges()
                _ = await (priceTask, challengesTask)
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

    // MARK: - Main Content

    private var mainContent: some View {
        VStack(spacing: LC.space24) {
            // Featured hero (single static card)
            if let featured = featuredChallenge {
                featuredHero(featured)
            }

            // Live signals
            if !activeChallenges.isEmpty {
                liveSignals
            }

            // Category grid
            LazyVGrid(columns: gridColumns, spacing: LC.space12) {
                ForEach(FitnessType.allCases) { type in
                    categoryCard(type)
                }
            }
            .padding(.horizontal, LC.space16)
        }
        .padding(.bottom, LC.space32)
    }

    // MARK: - Featured Hero (single static card, entire card tappable)

    // MARK: - Editorial Palettes

    /// Curated editorial palettes — each featured challenge gets its own bold identity.
    private struct HeroPalette {
        let colors: [Color]
        let direction: (UnitPoint, UnitPoint)
    }

    private let heroPalettes: [HeroPalette] = [
        // Warm amber/gold — like Pluribus
        HeroPalette(colors: [Color(hex: 0xF59E0B), Color(hex: 0xD97706), Color(hex: 0xB45309)],
                    direction: (.topLeading, .bottomTrailing)),
        // Deep ocean teal
        HeroPalette(colors: [Color(hex: 0x0D9488), Color(hex: 0x0F766E), Color(hex: 0x115E59)],
                    direction: (.top, .bottom)),
        // Rich coral
        HeroPalette(colors: [Color(hex: 0xFB7185), Color(hex: 0xF43F5E), Color(hex: 0xE11D48)],
                    direction: (.topLeading, .bottomTrailing)),
        // Bold indigo
        HeroPalette(colors: [Color(hex: 0x818CF8), Color(hex: 0x6366F1), Color(hex: 0x4F46E5)],
                    direction: (.topTrailing, .bottomLeading)),
        // Forest emerald
        HeroPalette(colors: [Color(hex: 0x34D399), Color(hex: 0x10B981), Color(hex: 0x059669)],
                    direction: (.top, .bottomTrailing)),
        // Warm rose
        HeroPalette(colors: [Color(hex: 0xF472B6), Color(hex: 0xEC4899), Color(hex: 0xDB2777)],
                    direction: (.topLeading, .bottom)),
        // Midnight navy
        HeroPalette(colors: [Color(hex: 0x60A5FA), Color(hex: 0x3B82F6), Color(hex: 0x1D4ED8)],
                    direction: (.topTrailing, .bottomLeading)),
        // Burnt sienna
        HeroPalette(colors: [Color(hex: 0xFB923C), Color(hex: 0xF97316), Color(hex: 0xC2410C)],
                    direction: (.top, .bottom)),
    ]

    /// Deterministic palette selection based on challenge ID.
    private func heroPalette(for challenge: ChallengeMeta) -> HeroPalette {
        let hash = challenge.id.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return heroPalettes[abs(hash) % heroPalettes.count]
    }

    private func featuredHero(_ challenge: ChallengeMeta) -> some View {
        let theme = featuredTheme(for: challenge)
        let palette = heroPalette(for: challenge)

        return Button {
            navigationPath.append(challenge.id)
        } label: {
            ZStack {
                // Editorial gradient — unique per challenge
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: palette.colors,
                            startPoint: palette.direction.0,
                            endPoint: palette.direction.1
                        )
                    )

                // Top-left light wash for depth
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.16), .clear, .black.opacity(0.06)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Hero icon — large, bold, owns the right half
                Image(systemName: theme.icon)
                    .font(.system(size: 160, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.16))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .padding(.trailing, 16)
                    .offset(y: -4)

                // Bottom vignette for text legibility
                VStack {
                    Spacer()
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.18)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 80)
                }
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))

                // Content — editorial layout
                VStack(alignment: .leading, spacing: 0) {
                    // FEATURED label
                    Text("FEATURED")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.6))

                    Spacer()

                    // Title — large, editorial
                    Text(challenge.displayTitle)
                        .font(.title.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    // Stats bar
                    HStack {
                        if let count = challenge.participantCount, count > 0 {
                            Text("\(count) joined")
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(.white.opacity(0.75))
                        }
                        Spacer()
                        if let wei = challenge.funds?.stake, let amount = Double(wei), amount > 0 {
                            Text(LCFormatter.formatUSD(wei: amount, tokenPrice: tokenPrice))
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.9))
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(LC.space20)
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, LC.space16)
        .padding(.top, LC.space8)
    }

    // MARK: - Live Signals

    private var liveSignals: some View {
        HStack {
            Text("\(activeChallenges.count) challenges")
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))

            Spacer()

            Text("\(totalInPlay) in play")
                .font(.caption.weight(.medium))
                .foregroundStyle(LC.textSecondary(scheme))
        }
        .padding(.horizontal, LC.space16)
    }

    // MARK: - Category Card

    private func categoryCard(_ type: FitnessType) -> some View {
        let count = activeCount(for: type)
        let stake = maxStakeDisplay(for: type)

        return Button {
            navigationPath.append(type)
        } label: {
            ZStack {
                // Premium three-stop gradient background
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: type.premiumGradient,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Subtle inner highlight — top-left light source
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.10), .clear, .black.opacity(0.05)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Watermark icon — right side, vertically centered, same position for all
                Image(systemName: type.icon)
                    .font(.system(size: FitnessType.cardIconSize, weight: .thin))
                    .foregroundStyle(.white.opacity(0.13))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .offset(x: 36, y: 6)

                // Content — title pinned top-left, metrics pinned bottom-left
                VStack(alignment: .leading, spacing: 0) {
                    // Title — firmly top-left
                    Text(type.label)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)

                    Spacer()

                    // Bottom metrics
                    if count > 0 || stake != nil {
                        HStack(spacing: 6) {
                            if count > 0 {
                                Text("\(count) active")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                            if let stake {
                                Text(stake)
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Featured Theme

    private func featuredTheme(for c: ChallengeMeta) -> (icon: String, gradient: [Color]) {
        let swim    = (icon: "figure.pool.swim",                     gradient: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)])
        let cycle   = (icon: "figure.outdoor.cycle",                 gradient: [Color(hex: 0xF97316), Color(hex: 0xEA580C)])
        let run     = (icon: "figure.run",                           gradient: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)])
        let str     = (icon: "figure.strengthtraining.traditional",  gradient: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)])
        let hike    = (icon: "figure.hiking",                        gradient: [Color(hex: 0x8B5CF6), Color(hex: 0x7C3AED)])
        let walk    = (icon: "figure.walk",                          gradient: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)])

        if let mid = c.modelId?.lowercased() {
            if mid.contains("swimming")  { return swim }
            if mid.contains("cycling")   { return cycle }
            if mid.contains("distance")  { return run }
            if mid.contains("strength")  { return str }
            if mid.contains("hiking")    { return hike }
            if mid.contains("steps")     { return walk }
        }

        let tags = (c.tags ?? []).joined(separator: " ").lowercased()
        if tags.contains("swimming")  { return swim }
        if tags.contains("cycling")   { return cycle }
        if tags.contains("running")   { return run }
        if tags.contains("strength")  { return str }
        if tags.contains("hiking")    { return hike }
        if tags.contains("walking")   { return walk }

        let text = [c.displayTitle, c.displayDescription].joined(separator: " ").lowercased()
        if text.contains("swim") || text.contains("pool") || text.contains("lap")     { return swim }
        if text.contains("cycl") || text.contains("bike") || text.contains("ride")    { return cycle }
        if text.contains("run")  || text.contains("marathon") || text.contains("jog") { return run }
        if text.contains("strength") || text.contains("lift") || text.contains("weight") || text.contains("gym") { return str }
        if text.contains("hik")  || text.contains("trail") || text.contains("climb")  { return hike }

        return walk
    }

    // MARK: - Search Results

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
                        NavigationLink(value: challenge.id) {
                            searchResultCard(challenge)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, LC.space16)
            }
        }
        .padding(.bottom, LC.space32)
    }

    private func searchResultCard(_ challenge: ChallengeMeta) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: challenge.resolvedCategory.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(LC.fitnessGradient)
                )

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(challenge.displayTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)
                HStack(spacing: LC.space8) {
                    Text(challenge.resolvedCategory.label)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.textSecondary(scheme))
                    if let stake = challenge.stakeDisplayUSD(tokenPrice: tokenPrice) {
                        Text(stake)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
            }

            Spacer()

            if challenge.isActive {
                LCStatusBadge(text: "Active", color: LC.success)
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

    // MARK: - Loading / Empty / Error

    private var loadingView: some View {
        VStack(spacing: LC.space24) {
            ShimmerView().frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
                .padding(.horizontal, LC.space16)

            // Placeholder for live signals
            ShimmerView().frame(height: 16)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(.horizontal, LC.space16)

            LazyVGrid(columns: gridColumns, spacing: LC.space12) {
                ForEach(0..<6, id: \.self) { _ in
                    ShimmerView().frame(height: 160)
                        .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
                }
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

    // MARK: - Data Loading

    private func loadTokenPrice() async {
        tokenPrice = await TokenPriceService.shared.getUSDPrice()
    }

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

            appState.updateWidgetChallenge(challenges: fresh)
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

            for a in activities where a.verdictPass != nil {
                if let cid = UInt64(a.challengeId) {
                    let challenge = challenges.first { $0.id == a.challengeId }
                    if challenge?.isActive == false || challenge == nil {
                        let elig = await ContractService.shared.checkClaimEligibility(
                            challengeId: cid,
                            user: appState.walletAddress
                        )
                        eligibility[a.challengeId] = elig
                    }
                }
            }

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
