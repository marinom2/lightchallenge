// OnboardingView.swift
// Full-screen onboarding — hooks the user, explains the product, drives wallet connection.

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var healthService: HealthKitService
    @State private var currentPage = 0
    @State private var showWalletSheet = false
    @State private var stats: ProtocolStats?
    @State private var logoVisible = false
    @State private var logoGlow = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            ambientBackground

            VStack(spacing: 0) {
                TabView(selection: $currentPage) {
                    welcomePage.tag(0)
                    howItWorksPage.tag(1)
                    proofPage.tag(2)
                    connectPage.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.4, dampingFraction: 0.9), value: currentPage)

                // Bottom area
                VStack(spacing: LC.space20) {
                    HStack(spacing: 8) {
                        ForEach(0..<4) { i in
                            Capsule()
                                .fill(i == currentPage ? LC.gold : LC.textTertiary(scheme))
                                .frame(width: i == currentPage ? 24 : 8, height: 8)
                                .animation(.spring(response: 0.3), value: currentPage)
                        }
                    }

                    if currentPage < 3 {
                        Button {
                            withAnimation { currentPage += 1 }
                        } label: {
                            Text("Continue")
                        }
                        .buttonStyle(LCGoldButton())

                        Button("Skip") {
                            appState.hasCompletedOnboarding = true
                        }
                        .font(.subheadline)
                        .foregroundStyle(LC.textTertiary(scheme))
                    } else {
                        Button {
                            showWalletSheet = true
                        } label: {
                            Label("Connect Wallet", systemImage: "wallet.bifold")
                        }
                        .buttonStyle(LCGoldButton())

                        Button("Explore Without Wallet") {
                            appState.hasCompletedOnboarding = true
                        }
                        .font(.subheadline)
                        .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
                .padding(.horizontal, LC.space24)
                .padding(.bottom, LC.space48)
            }
        }
        .sheet(isPresented: $showWalletSheet) {
            WalletSheet()
                .interactiveDismissDisabled(walletManager.isConnecting)
                .onDisappear {
                    if walletManager.isConnected {
                        appState.hasCompletedOnboarding = true
                    }
                }
        }
        .task {
            // Fetch real protocol stats
            if let fetched = try? await APIClient.shared.fetchProtocolStats(baseURL: appState.serverURL) {
                stats = fetched
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

    // MARK: - Page 1: Welcome

    private var welcomePage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            ZStack {
                // Pulsing glow ring behind logo
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

                Text("Compete in fitness challenges with real stakes on the blockchain. Prove your activity, beat the challenge, win the pool.")
                    .font(.body)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LC.space16)
            }

            // Real stats from API
            HStack(spacing: LC.space24) {
                statBubble(
                    value: stats.map { "\($0.totalChallenges)" } ?? "—",
                    label: "Challenges"
                )
                statBubble(
                    value: stats.map { "\($0.totalParticipants)" } ?? "—",
                    label: "Participants"
                )
                statBubble(
                    value: stats?.formattedStaked ?? "—",
                    label: "Staked"
                )
            }
            .padding(.top, LC.space8)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func statBubble(value: String, label: String) -> some View {
        VStack(spacing: LC.space4) {
            Text(value)
                .font(.headline.weight(.bold))
                .foregroundStyle(LC.gold)
            Text(label)
                .font(.caption2)
                .foregroundStyle(LC.textTertiary(scheme))
        }
    }

    // MARK: - Page 2: How It Works

    private var howItWorksPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            Text("How It Works")
                .font(.title2.weight(.bold))

            VStack(spacing: LC.space16) {
                stepRow(number: 1, icon: "figure.run.circle.fill", gradient: [Color(hex: 0xFF6B6B), Color(hex: 0xFF4757)], title: "Choose a Challenge", subtitle: "Steps, running, cycling, hiking — pick what suits you")
                stepRow(number: 2, icon: "arrow.down.circle.fill", gradient: [Color(hex: 0x4ECDC4), Color(hex: 0x2AABA0)], title: "Stake to Join", subtitle: "Put your money where your motivation is")
                stepRow(number: 3, icon: "checkmark.seal.fill", gradient: [Color(hex: 0xA78BFA), Color(hex: 0x7C3AED)], title: "AI Verifies Your Proof", subtitle: "Apple Health, Strava, Garmin — activity is your proof")
                stepRow(number: 4, icon: "crown.fill", gradient: [Color(hex: 0xFCD34D), Color(hex: 0xF59E0B)], title: "Win the Pool", subtitle: "Pass the challenge, claim your share of the pot")
            }
            .padding(.horizontal, LC.space8)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func stepRow(number: Int, icon: String, gradient: [Color], title: String, subtitle: String) -> some View {
        HStack(spacing: LC.space16) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: gradient.map { $0.opacity(0.12) },
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 52, height: 52)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                LinearGradient(colors: gradient.map { $0.opacity(0.25) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: 1
                            )
                    )

                Image(systemName: icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                    )

                // Step number badge
                Text("\(number)")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle()
                            .fill(
                                LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                            )
                    )
                    .offset(x: 20, y: -20)
            }

            VStack(alignment: .leading, spacing: LC.space4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
        )
    }

    // MARK: - Page 3: Proof Sources

    private var proofPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            Text("Your Activity, Your Proof")
                .font(.title2.weight(.bold))

            Text("Connect your fitness platforms. Each challenge reads only the data it needs — nothing extra.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
                .padding(.horizontal, LC.space16)

            VStack(spacing: LC.space12) {
                proofSourceCard(icon: "heart.fill", name: "Apple Health", detail: "Steps, distance, workouts", color: .pink, primary: true)
                proofSourceCard(icon: "figure.run", name: "Strava", detail: "Running, cycling, swimming", color: .orange, primary: false)
                proofSourceCard(icon: "applewatch", name: "Garmin Connect", detail: "Multi-sport tracking", color: .blue, primary: false)
                proofSourceCard(icon: "waveform.path.ecg", name: "Fitbit", detail: "Steps, active minutes", color: .teal, primary: false)
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func proofSourceCard(icon: String, name: String, detail: String, color: Color, primary: Bool) -> some View {
        HStack(spacing: LC.space12) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 40, height: 40)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))

            VStack(alignment: .leading, spacing: LC.space2) {
                HStack(spacing: LC.space6) {
                    Text(name)
                        .font(.subheadline.weight(.medium))
                    if primary {
                        Text("Built-in")
                            .font(.system(size: 9, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(LC.success.opacity(0.15))
                            .foregroundStyle(LC.success)
                            .clipShape(Capsule())
                    }
                }
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(primary ? LC.success : LC.textTertiary(scheme))
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .stroke(primary ? LC.success.opacity(0.3) : LC.cardBorder(scheme), lineWidth: primary ? 1 : 0.5)
        )
    }

    // MARK: - Page 4: Connect

    private var connectPage: some View {
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

                Text("Link MetaMask, Phantom, Trust, or any EVM wallet to stake and claim rewards on LightChain.")
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

    private func walletLogo(wallet: (id: String, name: String, color: Color)) -> some View {
        VStack(spacing: LC.space6) {
            RemoteWalletIcon(walletId: wallet.id, name: wallet.name, brandColor: wallet.color, size: 48)

            Text(wallet.name)
                .font(.system(size: 10))
                .foregroundStyle(LC.textSecondary(scheme))
        }
    }
}
