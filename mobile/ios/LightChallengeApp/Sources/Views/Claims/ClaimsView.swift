// ClaimsView.swift
// Reward claiming flow for completed challenges.

import SwiftUI

// MARK: - Per-card claim state

private enum CardClaimState: Equatable {
    case idle
    case claiming
    case success(txHash: String)
    case claimed
    case error(String)
}

struct ClaimsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @Environment(\.colorScheme) private var scheme

    @State private var activities: [MyChallenge] = []
    @State private var eligibility: [String: ContractService.ClaimEligibility] = [:]
    @State private var challengeMetas: [String: ChallengeMeta] = [:]
    @State private var isLoading = false
    @State private var cardStates: [String: CardClaimState] = [:]
    @State private var tokenPrice: Double?
    @State private var celebratingId: String?

    private var claimableActivities: [MyChallenge] {
        activities.filter { $0.verdictPass == true }
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
        .navigationTitle("Rewards")
        .task { await loadData() }
        .refreshable { await loadData() }
    }

    // MARK: - Claims List

    private var claimsList: some View {
        ScrollView {
            LazyVStack(spacing: LC.space12) {
                ForEach(claimableActivities) { activity in
                    ClaimCard(
                        activity: activity,
                        meta: challengeMetas[activity.challengeId],
                        eligibility: eligibility[activity.challengeId],
                        cardState: cardStates[activity.challengeId] ?? .idle,
                        tokenPrice: tokenPrice,
                        isCelebrating: celebratingId == activity.challengeId,
                        isConnected: walletManager.isConnected,
                        onClaim: { action in
                            Task { await executeClaim(challengeId: activity.challengeId, action: action) }
                        }
                    )
                    .transition(.asymmetric(
                        insertion: .scale(scale: 0.95).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
            .padding(.horizontal, LC.space16)
            .padding(.top, LC.space8)
            .padding(.bottom, LC.space48)
        }
        .background(LC.pageBg(scheme).ignoresSafeArea())
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
            Text("Loading rewards...").font(.subheadline).foregroundStyle(.secondary)
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

        // Fetch token price in parallel
        async let priceTask: Double? = TokenPriceService.shared.getUSDPrice()

        do {
            activities = try await APIClient.shared.fetchMyActivity(
                baseURL: appState.serverURL,
                subject: appState.walletAddress
            )

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
            // Error handled per-card
        }

        tokenPrice = await priceTask
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

    enum ClaimAction { case winner, loser, refund, treasury }

    private func executeClaim(challengeId: String, action: ClaimAction) async {
        guard let cid = UInt64(challengeId) else { return }

        withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
            cardStates[challengeId] = .claiming
        }

        // Light haptic on tap
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        do {
            // Note: do NOT call finalize() here — the backend handles finalization
            // after submitting proofs. Premature finalize creates a failed snapshot.

            let txHash: String
            let elig = eligibility[challengeId]
            switch action {
            case .winner:
                txHash = try await ContractService.shared.claimWinner(challengeId: cid)
            case .loser:
                txHash = try await ContractService.shared.claimLoser(challengeId: cid)
            case .refund:
                txHash = try await ContractService.shared.claimRefund(challengeId: cid)
            case .treasury:
                txHash = try await ContractService.shared.treasuryClaimETH(challengeId: cid, amount: elig?.allowance ?? "0")
            }

            // Auto-withdraw from treasury after winner/loser claim
            if action == .winner || action == .loser {
                let freshElig = await ContractService.shared.checkClaimEligibility(challengeId: cid, user: appState.walletAddress)
                if freshElig.canClaimTreasury {
                    _ = try? await ContractService.shared.treasuryClaimETH(challengeId: cid, amount: freshElig.allowance)
                }
            }

            // Success haptic
            UINotificationFeedbackGenerator().notificationOccurred(.success)

            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                cardStates[challengeId] = .success(txHash: txHash)
                celebratingId = challengeId
            }

            await recordClaim(challengeId: challengeId, action: action, txHash: txHash)
            await fetchEligibility(challengeId)

            // Transition to claimed after celebration
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation(.spring(response: 0.5, dampingFraction: 0.9)) {
                cardStates[challengeId] = .claimed
                celebratingId = nil
            }
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
                cardStates[challengeId] = .error(error.localizedDescription)
            }

            // Return to idle after showing error
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                cardStates[challengeId] = .idle
            }
        }
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

// MARK: - Claim Card

private struct ClaimCard: View {
    let activity: MyChallenge
    let meta: ChallengeMeta?
    let eligibility: ContractService.ClaimEligibility?
    let cardState: CardClaimState
    let tokenPrice: Double?
    let isCelebrating: Bool
    let isConnected: Bool
    let onClaim: (ClaimsView.ClaimAction) -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var appeared = false

    private var title: String {
        meta?.displayTitle ?? "Challenge #\(activity.challengeId)"
    }

    private var rewardWei: Double {
        guard let elig = eligibility else { return 0 }
        let contribution = Double(elig.contribution) ?? 0
        let allowance = Double(elig.allowance) ?? 0
        return max(contribution, allowance)
    }

    private var rewardLCAI: String {
        let lcai = rewardWei / 1e18
        if lcai >= 1 { return String(format: "%.3f LCAI", lcai) }
        if lcai >= 0.001 { return String(format: "%.3f LCAI", lcai) }
        if lcai > 0 { return String(format: "%.6f LCAI", lcai) }
        return "0 LCAI"
    }

    private var rewardUSD: String? {
        guard let price = tokenPrice, price > 0, rewardWei > 0 else { return nil }
        let usd = (rewardWei / 1e18) * price
        if usd >= 1 { return String(format: "$%.2f", usd) }
        if usd >= 0.01 { return String(format: "$%.2f", usd) }
        return String(format: "$%.4f", usd)
    }

    private var primaryAction: ClaimsView.ClaimAction? {
        guard let elig = eligibility else { return nil }
        if elig.canClaimWinner { return .winner }
        if elig.canClaimRefund { return .refund }
        if elig.canClaimTreasury { return .treasury }
        if elig.canClaimLoser { return .loser }
        return nil
    }

    var body: some View {
        ZStack {
            // Celebration particles (behind card content)
            if isCelebrating {
                ClaimConfetti()
                    .allowsHitTesting(false)
            }

            cardContent
        }
        .clipShape(RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous))
        .opacity(cardState == .claimed ? 0.5 : 1)
        .scaleEffect(appeared ? 1 : 0.97)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                appeared = true
            }
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        switch cardState {
        case .idle, .error:
            idleContent
        case .claiming:
            claimingContent
        case .success:
            successContent
        case .claimed:
            claimedContent
        }
    }

    // MARK: - Idle State

    private var idleContent: some View {
        Button {
            if let action = primaryAction {
                onClaim(action)
            }
        } label: {
            HStack(spacing: LC.space16) {
                // Left: minimal icon
                Circle()
                    .fill(LC.success.opacity(0.1))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "checkmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(LC.success)
                    )

                // Center: title + reward + status
                VStack(alignment: .leading, spacing: LC.space4) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .lineLimit(1)

                    HStack(spacing: LC.space8) {
                        if let usd = rewardUSD {
                            Text(usd)
                                .font(.subheadline.weight(.bold).monospacedDigit())
                                .foregroundStyle(LC.textPrimary(scheme))
                        }
                        Text(rewardLCAI)
                            .font(.caption.weight(.medium).monospacedDigit())
                            .foregroundStyle(LC.textTertiary(scheme))
                    }

                    Text("You won")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.success.opacity(0.8))
                }

                Spacer(minLength: 0)

                // Right: claim action
                if primaryAction != nil, eligibility != nil {
                    HStack(spacing: 4) {
                        Text("Claim")
                            .font(.subheadline.weight(.semibold))
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(LC.accent)
                } else if eligibility == nil {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text("Pending")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.cardBg(scheme))
                    .shadow(color: .black.opacity(scheme == .dark ? 0.25 : 0.04), radius: 8, y: 3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
            )
            .overlay(alignment: .bottom) {
                // Error message overlay
                if case .error(let msg) = cardState {
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(LC.danger)
                        .lineLimit(2)
                        .padding(.horizontal, LC.space16)
                        .padding(.bottom, LC.space4)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(primaryAction == nil || !isConnected)
    }

    // MARK: - Claiming State

    private var claimingContent: some View {
        HStack(spacing: LC.space16) {
            // Pulsing circle
            Circle()
                .fill(LC.accent.opacity(0.1))
                .frame(width: 44, height: 44)
                .overlay(
                    Circle()
                        .fill(LC.accent.opacity(0.3))
                        .frame(width: 20, height: 20)
                        .modifier(PulseModifier())
                )

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .lineLimit(1)

                AnimatedClaimingText()
            }

            Spacer()
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
                .shadow(color: .black.opacity(scheme == .dark ? 0.25 : 0.04), radius: 8, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.accent.opacity(0.2), lineWidth: 0.5)
        )
    }

    // MARK: - Success State

    private var successContent: some View {
        HStack(spacing: LC.space16) {
            Circle()
                .fill(LC.success.opacity(0.12))
                .frame(width: 44, height: 44)
                .overlay(
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(LC.success)
                )

            VStack(alignment: .leading, spacing: LC.space4) {
                Text("Reward claimed")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.success)

                HStack(spacing: LC.space8) {
                    if let usd = rewardUSD {
                        Text(usd)
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .foregroundStyle(LC.textPrimary(scheme))
                    }
                    Text(rewardLCAI)
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(LC.success)
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
                .shadow(color: LC.success.opacity(0.12), radius: 12, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.success.opacity(0.25), lineWidth: 0.5)
        )
    }

    // MARK: - Claimed (Final) State

    private var claimedContent: some View {
        HStack(spacing: LC.space16) {
            Circle()
                .fill(LC.textTertiary(scheme).opacity(0.1))
                .frame(width: 44, height: 44)
                .overlay(
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(LC.textTertiary(scheme))
                )

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textSecondary(scheme))
                    .lineLimit(1)

                Text("Claimed")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LC.textTertiary(scheme))
            }

            Spacer()
        }
        .padding(LC.space16)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
        )
    }
}

// MARK: - Animated "Processing reward..." text

private struct AnimatedClaimingText: View {
    @State private var dotCount = 0
    @Environment(\.colorScheme) private var scheme

    private var dots: String {
        String(repeating: ".", count: (dotCount % 3) + 1)
    }

    var body: some View {
        Text("Processing reward\(dots)")
            .font(.caption.weight(.medium))
            .foregroundStyle(LC.textTertiary(scheme))
            .onReceive(Timer.publish(every: 0.6, on: .main, in: .common).autoconnect()) { _ in
                dotCount += 1
            }
    }
}

// MARK: - Pulse Modifier (opacity breathing)

private struct PulseModifier: ViewModifier {
    @State private var pulse = false

    func body(content: Content) -> some View {
        content
            .opacity(pulse ? 1.0 : 0.3)
            .scaleEffect(pulse ? 1.2 : 0.8)
            .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)
            .onAppear { pulse = true }
    }
}

// MARK: - Subtle Confetti Effect

private struct ClaimConfetti: View {
    @State private var active = false

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                guard active else { return }
                let time = timeline.date.timeIntervalSinceReferenceDate
                let colors: [Color] = [
                    LC.success.opacity(0.6),
                    Color.white.opacity(0.5),
                    LC.success.opacity(0.4),
                    Color.white.opacity(0.3),
                ]

                for i in 0..<20 {
                    let seed = Double(i) * 1.73
                    let x = (sin(seed * 4.1 + time * 0.6) * 0.5 + 0.5) * size.width
                    let speed = 30 + sin(seed * 1.8) * 15
                    let rawY = (time * speed + seed * 80).truncatingRemainder(dividingBy: size.height + 20)
                    let y = rawY - 10
                    let particleSize = CGSize(width: 3 + sin(seed) * 1.5, height: 5 + cos(seed) * 2)
                    let rotation = Angle.degrees(time * (40 + seed * 20))

                    var rect = Path(CGRect(origin: .zero, size: particleSize))
                    rect = rect.applying(.init(rotationAngle: rotation.radians))
                    rect = rect.applying(.init(translationX: x, y: y))

                    let fade = max(0, 1 - (time.truncatingRemainder(dividingBy: 3) / 2.5))
                    context.fill(rect, with: .color(colors[i % colors.count].opacity(fade)))
                }
            }
        }
        .onAppear {
            active = true
            // Auto-stop after 800ms
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.3)) {
                    active = false
                }
            }
        }
    }
}
