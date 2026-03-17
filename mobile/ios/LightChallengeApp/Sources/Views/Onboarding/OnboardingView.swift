// OnboardingView.swift
// 4-page onboarding: Welcome → Browse Challenges → Apple Health → Connect Wallet.
// Shows every launch. "Skip to app" always visible.

import SwiftUI

struct OnboardingView: View {
    let dismiss: () -> Void
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var healthService: HealthKitService
    @State private var currentPage = 0
    @State private var showWalletSheet = false
    @State private var challenges: [ChallengeMeta] = []
    @State private var logoVisible = false
    @State private var logoGlow = false
    @State private var healthConnected = false
    @State private var todaySteps: Int = 0
    @Environment(\.colorScheme) private var scheme

    private let pageCount = 4

    var body: some View {
        ZStack {
            ambientBackground

            VStack(spacing: 0) {
                // Progress bar (thin, top)
                progressBar
                    .padding(.top, LC.space8)

                TabView(selection: $currentPage) {
                    welcomePage.tag(0)
                    browsePage.tag(1)
                    healthPage.tag(2)
                    walletPage.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.4, dampingFraction: 0.9), value: currentPage)

                // Bottom controls
                bottomControls
                    .padding(.horizontal, LC.space24)
                    .padding(.bottom, LC.space32)
            }
        }
        .sheet(isPresented: $showWalletSheet) {
            WalletSheet()
                .interactiveDismissDisabled(walletManager.isConnecting)
                .onDisappear {
                    if walletManager.isConnected {
                        dismiss()
                    }
                }
        }
        .onChange(of: currentPage) { _, _ in
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        .task {
            // Prefetch challenges for page 2
            if let fetched = try? await APIClient.shared.fetchChallenges(baseURL: appState.serverURL) {
                challenges = fetched
                    .filter { $0.isActive && $0.resolvedCategory.isFitness }
                    .sorted { ($0.createdAt ?? 0) > ($1.createdAt ?? 0) }
            }
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(LC.textTertiary(scheme).opacity(0.2))
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(LC.accent)
                    .frame(width: geo.size.width * (Double(currentPage + 1) / Double(pageCount)))
                    .animation(.easeInOut(duration: 0.3), value: currentPage)
            }
        }
        .frame(height: 3)
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: LC.space12) {
            // Primary action
            switch currentPage {
            case 0, 1:
                Button {
                    withAnimation { currentPage += 1 }
                } label: {
                    Text("Continue")
                }
                .buttonStyle(LCGoldButton())

            case 2:
                if healthConnected {
                    Button {
                        withAnimation { currentPage += 1 }
                    } label: {
                        Label("Continue", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(LCGoldButton())
                } else {
                    Button {
                        Task { await connectHealth() }
                    } label: {
                        Label("Connect Apple Health", systemImage: "heart.fill")
                    }
                    .buttonStyle(LCGoldButton())

                    Button {
                        withAnimation { currentPage += 1 }
                    } label: {
                        Text("Not now")
                    }
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                }

            case 3:
                Button {
                    showWalletSheet = true
                } label: {
                    Label("Connect Wallet", systemImage: "wallet.bifold")
                }
                .buttonStyle(LCGoldButton())

                Button("Explore Without Wallet") {
                    dismiss()
                }
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))

            default:
                EmptyView()
            }

            // Persistent "Skip to app" — bottom-left, always visible
            if currentPage < 3 {
                HStack {
                    Button("Skip to app") {
                        dismiss()
                    }
                    .font(.footnote)
                    .foregroundStyle(LC.textTertiary(scheme))
                    Spacer()
                }
            }
        }
    }

    // MARK: - Ambient Background

    private var ambientBackground: some View {
        ZStack {
            LC.pageBg(scheme).ignoresSafeArea()

            Circle()
                .fill(
                    RadialGradient(
                        colors: [LC.gradBlue.opacity(0.10), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: 100, y: -200)
                .blur(radius: 60)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [LC.gradLavender.opacity(0.08), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: -120, y: 200)
                .blur(radius: 60)
        }
    }

    // MARK: - Page 1: Welcome (minimal)

    private var welcomePage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [LC.gold.opacity(logoGlow ? 0.18 : 0.06), .clear],
                            center: .center,
                            startRadius: 40,
                            endRadius: 90
                        )
                    )
                    .frame(width: 160, height: 160)
                    .scaleEffect(logoGlow ? 1.15 : 0.9)
                    .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: logoGlow)

                Image("AppLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 120, height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .shadow(color: .black.opacity(0.4), radius: 16, y: 8)
                    .scaleEffect(logoVisible ? 1 : 0.5)
                    .opacity(logoVisible ? 1 : 0)
                    .animation(.spring(response: 0.7, dampingFraction: 0.65), value: logoVisible)
            }
            .onAppear {
                logoVisible = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    logoGlow = true
                }
            }

            VStack(spacing: LC.space12) {
                Text("LightChallenge")
                    .font(.system(size: 32, weight: .bold, design: .rounded))

                Text("Stake. Prove. Earn.")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(LC.gold)

                Text("Compete in fitness challenges with real stakes. Prove your activity, win the pool.")
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LC.space16)
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Page 2: Browse Live Challenges (the hook)

    private var browsePage: some View {
        VStack(spacing: LC.space20) {
            Spacer()

            Text("Live Challenges")
                .font(.title2.weight(.bold))

            Text("Real people, real stakes. Pick one that fits your lifestyle.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal, LC.space16)

            if challenges.isEmpty {
                // Shimmer placeholders
                VStack(spacing: LC.space12) {
                    ForEach(0..<3) { _ in
                        ShimmerView()
                            .frame(height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous))
                    }
                }
                .padding(.horizontal, LC.space8)
            } else {
                VStack(spacing: LC.space12) {
                    ForEach(challenges.prefix(3)) { challenge in
                        challengePreviewCard(challenge)
                    }
                }
                .padding(.horizontal, LC.space8)
            }

            if challenges.count > 3 {
                Text("+ \(challenges.count - 3) more active")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
            }

            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func challengePreviewCard(_ c: ChallengeMeta) -> some View {
        let theme = fitnessTheme(for: c)
        return HStack(spacing: LC.space12) {
            // Activity icon
            Image(systemName: theme.icon)
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(theme.color)
                .frame(width: 44, height: 44)
                .background(theme.color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))

            VStack(alignment: .leading, spacing: LC.space2) {
                Text(c.displayTitle)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                HStack(spacing: LC.space6) {
                    if let stake = c.stakeDisplay {
                        Text(stake)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(LC.accent)
                    }
                    if let end = c.endsDate {
                        let days = max(0, Int(end.timeIntervalSinceNow / 86400))
                        Text("\(days)d left")
                            .font(.caption)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(LC.textTertiary(scheme))
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
        )
    }

    /// Quick theme lookup for a ChallengeMeta (lightweight, no ChallengeDetail needed).
    private func fitnessTheme(for c: ChallengeMeta) -> (icon: String, color: Color) {
        let all = [c.displayTitle, c.displayDescription, c.modelId ?? "", (c.tags ?? []).joined(separator: " ")].joined(separator: " ").lowercased()
        if all.contains("swim") || all.contains("pool") { return ("figure.pool.swim", Color(hex: 0x06B6D4)) }
        if all.contains("cycl") || all.contains("bike") { return ("figure.outdoor.cycle", Color(hex: 0xF97316)) }
        if all.contains("run") || all.contains("marathon") || all.contains("jog") { return ("figure.run", Color(hex: 0x2563EB)) }
        if all.contains("strength") || all.contains("lift") || all.contains("weight") { return ("figure.strengthtraining.traditional", Color(hex: 0xEF4444)) }
        if all.contains("hik") || all.contains("trail") { return ("figure.hiking", Color(hex: 0x22C55E)) }
        return ("figure.walk", Color(hex: 0x22C55E))
    }

    // MARK: - Page 3: Connect Apple Health

    private var healthPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(LC.danger.opacity(0.12))
                    .frame(width: 88, height: 88)
                Image(systemName: "heart.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(LC.danger)
            }

            VStack(spacing: LC.space12) {
                Text("Connect Apple Health")
                    .font(.title2.weight(.bold))

                Text("Your activity is your proof. We read steps, distance, and workouts — nothing else.")
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LC.space16)
            }

            // After connection: show today's steps
            if healthConnected {
                VStack(spacing: LC.space8) {
                    HStack(spacing: LC.space8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(LC.success)
                        Text("Connected")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(LC.success)
                    }

                    if todaySteps > 0 {
                        HStack(spacing: LC.space4) {
                            Image(systemName: "figure.walk")
                                .font(.system(size: 14))
                                .foregroundStyle(Color(hex: 0x22C55E))
                            Text("Today: \(todaySteps.formatted()) steps")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(LC.textPrimary(scheme))
                        }
                        .padding(.horizontal, LC.space16)
                        .padding(.vertical, LC.space8)
                        .background(
                            Capsule().fill(Color(hex: 0x22C55E).opacity(0.08))
                        )
                    }
                }
                .transition(.scale.combined(with: .opacity))
            }

            // Privacy note
            HStack(spacing: LC.space8) {
                Image(systemName: "lock.shield.fill")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
                Text("Data stays on your device until you submit proof")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
            }
            .padding(.top, LC.space4)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Page 4: Connect Wallet

    private var walletPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(LC.gradBlue.opacity(0.12))
                    .frame(width: 88, height: 88)
                Image(systemName: "wallet.bifold.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(LC.gradBlue)
            }

            VStack(spacing: LC.space12) {
                Text("Connect Your Wallet")
                    .font(.title2.weight(.bold))

                Text("Stake to join challenges and claim rewards on LightChain.")
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LC.space16)
            }

            // Wallet logos
            VStack(spacing: LC.space8) {
                Text("Supports 300+ wallets")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))

                HStack(spacing: LC.space16) {
                    walletLogo(wallet: KnownWallet.metaMask)
                    walletLogo(wallet: KnownWallet.phantom)
                    walletLogo(wallet: KnownWallet.trust)
                    walletLogo(wallet: KnownWallet.rainbow)
                }
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Helpers

    private func connectHealth() async {
        await healthService.requestAuthorization()
        if healthService.isAuthorized {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                healthConnected = true
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)

            // Fetch today's steps for instant personalization
            let start = Calendar.current.startOfDay(for: Date())
            await healthService.collectEvidence(from: start, to: Date())
            let steps = healthService.stepDays.reduce(0) { $0 + $1.steps }
            withAnimation { todaySteps = steps }
        }
    }

    private func walletLogo(wallet: (id: String, name: String, color: Color)) -> some View {
        VStack(spacing: LC.space6) {
            RemoteWalletIcon(walletId: wallet.id, name: wallet.name, brandColor: wallet.color, size: 48)

            Text(wallet.name)
                .font(.system(size: 10))
                .foregroundStyle(LC.textSecondary(scheme))
        }
    }
}
