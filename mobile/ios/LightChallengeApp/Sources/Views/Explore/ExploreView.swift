// ExploreView.swift
// Apple Music-style category grid — tap a fitness type to drill into challenges.
// Walking | Running | Cycling | Swimming | Strength | All

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

    /// Optical centering offset for the decorative card icon.
    /// Each SF Symbol has a different visual center-of-mass, so we
    /// nudge per-symbol to achieve perceived balance on the card.
    var iconOpticalOffset: CGSize {
        switch self {
        case .walking:   CGSize(width: 4, height: -4)
        case .running:   CGSize(width: 6, height: -4)
        case .cycling:   CGSize(width: 2, height: 2)
        case .swimming:  CGSize(width: 0, height: 4)
        case .strength:  CGSize(width: 0, height: -2)
        case .hiking:    CGSize(width: 2, height: -2)
        }
    }

    /// Scale factor to normalize visual weight across different symbols.
    var iconScale: CGFloat {
        switch self {
        case .strength:  0.85  // very wide symbol
        case .cycling:   0.90  // wide symbol
        case .swimming:  0.90  // wide symbol
        default:         1.0
        }
    }

    var gradient: [Color] {
        switch self {
        case .walking: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)]
        case .running: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)]
        case .cycling: [Color(hex: 0xF97316), Color(hex: 0xEA580C)]
        case .swimming: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)]
        case .strength: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)]
        case .hiking: [Color(hex: 0x22C55E), Color(hex: 0x15803D)]
        }
    }

    /// Match a challenge to this fitness type by keywords in title, tags, description, modelId.
    func matches(_ challenge: ChallengeMeta) -> Bool {
        let keywords: [String]
        switch self {
        case .walking: keywords = ["walk", "steps", "step", "10k", "10,000"]
        case .running: keywords = ["run", "marathon", "jog", "5k", "10k run", "sprint"]
        case .cycling: keywords = ["cycl", "bike", "ride", "century"]
        case .swimming: keywords = ["swim", "pool", "lap"]
        case .strength: keywords = ["strength", "lift", "weight", "gym", "pushup", "push-up", "pullup"]
        case .hiking: keywords = ["hik", "trail", "climb", "mountain", "summit"]
        }

        let searchable = [
            challenge.displayTitle.lowercased(),
            challenge.displayDescription.lowercased(),
            (challenge.tags ?? []).joined(separator: " ").lowercased(),
            (challenge.modelId ?? "").lowercased()
        ].joined(separator: " ")

        return keywords.contains { searchable.contains($0) }
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
    @State private var showingCreateChallenge = false
    @State private var searchText = ""
    @State private var featuredPage = 0
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass

    private let autoScrollInterval: TimeInterval = 5

    // MARK: - Grid

    private var gridColumns: [GridItem] {
        [GridItem(.flexible(), spacing: LC.space12), GridItem(.flexible(), spacing: LC.space12)]
    }

    // MARK: - Computed

    private var sortedChallenges: [ChallengeMeta] {
        challenges.sorted { a, b in
            if a.isActive != b.isActive { return a.isActive }
            return (a.createdAt ?? 0) > (b.createdAt ?? 0)
        }
    }

    /// Top active fitness challenges sorted by highest stake — used for the featured carousel.
    private var featuredChallenges: [ChallengeMeta] {
        sortedChallenges
            .filter { $0.isActive && $0.resolvedCategory.isFitness }
            .sorted { a, b in
                let sa = Double(a.funds?.stake ?? "0") ?? 0
                let sb = Double(b.funds?.stake ?? "0") ?? 0
                if sa != sb { return sa > sb }
                return (a.createdAt ?? 0) > (b.createdAt ?? 0)
            }
            .prefix(8)
            .map { $0 }
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

    /// Count of active challenges matching each fitness type.
    private func activeCount(for type: FitnessType) -> Int {
        sortedChallenges.filter { $0.isActive && type.matches($0) }.count
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
                    categoryGrid
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
            .navigationDestination(for: FitnessType.self) { type in
                CategoryDetailView(
                    fitnessType: type,
                    challenges: sortedChallenges,
                    myActivities: myActivities,
                    eligibility: eligibility
                )
            }
            .task { await loadChallenges() }
            .refreshable { await loadChallenges() }
            .sheet(isPresented: $showingCreateChallenge) {
                CreateChallengeView()
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

    // MARK: - Category Grid (Apple Music style)

    private var categoryGrid: some View {
        VStack(spacing: LC.space24) {
            // Featured carousel
            if !featuredChallenges.isEmpty {
                featuredCarousel
            }

            // 2-column category grid
            LazyVGrid(columns: gridColumns, spacing: LC.space12) {
                ForEach(FitnessType.allCases) { type in
                    categoryCard(type)
                }
            }
            .padding(.horizontal, LC.space16)
        }
        .padding(.bottom, LC.space32)
    }

    // MARK: - Category Card

    private func categoryCard(_ type: FitnessType) -> some View {
        Button {
            navigationPath.append(type)
        } label: {
            ZStack(alignment: .bottomLeading) {
                // Gradient background
                RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: type.gradient,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Decorative large icon — optically centered in card
                Image(systemName: type.icon)
                    .font(.system(size: 80 * type.iconScale, weight: .thin))
                    .foregroundStyle(.white.opacity(0.2))
                    .offset(type.iconOpticalOffset)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

                // Label + count
                VStack(alignment: .leading, spacing: LC.space4) {
                    Spacer()

                    Text(type.label)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)

                    let count = activeCount(for: type)
                    if count > 0 {
                        Text("\(count) active")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
                .padding(LC.space16)
            }
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Featured Carousel (single-card paging with auto-scroll)

    private var featuredCarousel: some View {
        VStack(alignment: .leading, spacing: LC.space12) {
            HStack(spacing: LC.space6) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LC.accent)
                Text("FEATURED")
                    .font(.caption.weight(.bold))
                    .tracking(0.5)
                    .foregroundStyle(LC.textSecondary(scheme))
            }
            .padding(.horizontal, LC.space16)

            TabView(selection: $featuredPage) {
                ForEach(Array(featuredChallenges.enumerated()), id: \.element.id) { index, challenge in
                    Button {
                        navigationPath.append(challenge.id)
                    } label: {
                        featuredCard(challenge)
                            .padding(.horizontal, LC.space16)
                    }
                    .buttonStyle(.plain)
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .frame(height: 250)
            .onReceive(
                Timer.publish(every: autoScrollInterval, on: .main, in: .common).autoconnect()
            ) { _ in
                guard !featuredChallenges.isEmpty else { return }
                withAnimation(.easeInOut(duration: 0.4)) {
                    featuredPage = (featuredPage + 1) % featuredChallenges.count
                }
            }
        }
        .padding(.top, LC.space8)
    }

    private func featuredCard(_ challenge: ChallengeMeta) -> some View {
        let theme = featuredTheme(for: challenge)
        return HStack(spacing: 0) {
            // Left: gradient panel with activity icon
            ZStack {
                LinearGradient(
                    colors: theme.gradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Image(systemName: theme.icon)
                    .font(.system(size: 56, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.3))
            }
            .frame(width: 110)

            // Right: content
            VStack(alignment: .leading, spacing: LC.space8) {
                Text(challenge.displayTitle)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Pills: stake + time
                HStack(spacing: LC.space6) {
                    if let stake = challenge.stakeDisplay {
                        featuredPill("lock.fill", stake, theme.gradient.first ?? LC.accent)
                    }
                    if let end = challenge.endsDate, end.timeIntervalSinceNow > 0 {
                        let days = max(0, Int(end.timeIntervalSinceNow / 86400))
                        featuredPill("clock", "\(days)d left", LC.textTertiary(scheme))
                    }
                }

                Spacer()

                // CTA
                HStack(spacing: LC.space4) {
                    Text("Join Challenge")
                        .font(.caption.weight(.bold))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, LC.space12)
                .padding(.vertical, LC.space8)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: theme.gradient,
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                )
            }
            .padding(LC.space12)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL, style: .continuous))
    }

    private func featuredPill(_ icon: String, _ text: String, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 8, weight: .bold))
            Text(text)
                .font(.caption2.weight(.semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(color.opacity(0.1))
        .clipShape(Capsule())
    }

    /// Derive gradient + icon for a featured card from challenge metadata.
    /// Priority: modelId pattern > tags > title/description keywords.
    private func featuredTheme(for c: ChallengeMeta) -> (icon: String, gradient: [Color]) {
        let swim    = (icon: "figure.pool.swim",                     gradient: [Color(hex: 0x06B6D4), Color(hex: 0x0891B2)])
        let cycle   = (icon: "figure.outdoor.cycle",                 gradient: [Color(hex: 0xF97316), Color(hex: 0xEA580C)])
        let run     = (icon: "figure.run",                           gradient: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)])
        let str     = (icon: "figure.strengthtraining.traditional",  gradient: [Color(hex: 0xEF4444), Color(hex: 0xDC2626)])
        let hike    = (icon: "figure.hiking",                        gradient: [Color(hex: 0x22C55E), Color(hex: 0x15803D)])
        let walk    = (icon: "figure.walk",                          gradient: [Color(hex: 0x22C55E), Color(hex: 0x16A34A)])

        // 1. Match from modelId (most reliable — set by DB, e.g. "fitness.cycling@1")
        if let mid = c.modelId?.lowercased() {
            if mid.contains("swimming")  { return swim }
            if mid.contains("cycling")   { return cycle }
            if mid.contains("distance")  { return run }
            if mid.contains("strength")  { return str }
            if mid.contains("hiking")    { return hike }
            if mid.contains("steps")     { return walk }
        }

        // 2. Match from tags (e.g. ["cycling", "test"])
        let tags = (c.tags ?? []).joined(separator: " ").lowercased()
        if tags.contains("swimming")  { return swim }
        if tags.contains("cycling")   { return cycle }
        if tags.contains("running")   { return run }
        if tags.contains("strength")  { return str }
        if tags.contains("hiking")    { return hike }
        if tags.contains("walking")   { return walk }

        // 3. Fallback: keyword search in title + description
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
                    if let stake = challenge.stakeDisplay {
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
        VStack(spacing: LC.space16) {
            ShimmerView().frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusXL))
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

            // Update widget with the most urgent active challenge
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
