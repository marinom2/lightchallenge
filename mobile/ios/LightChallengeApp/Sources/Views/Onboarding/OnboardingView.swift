// OnboardingView.swift
// 3-page onboarding: Intro → Value → Connect Activity.
// "Skip for now" always visible. No wallet page, no auto-permission prompts.

import SwiftUI

struct OnboardingView: View {
    let dismiss: () -> Void
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @State private var currentPage = 0
    @State private var selectedProvider: ActivityProvider?
    @State private var logoVisible = false
    @State private var logoGlow = false
    @Environment(\.colorScheme) private var scheme

    private let pageCount = 3

    var body: some View {
        ZStack {
            ambientBackground

            VStack(spacing: 0) {
                // Progress bar
                progressBar
                    .padding(.top, LC.space8)

                TabView(selection: $currentPage) {
                    introPage.tag(0)
                    valuePage.tag(1)
                    connectPage.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.4, dampingFraction: 0.9), value: currentPage)

                // Bottom controls
                bottomControls
                    .padding(.horizontal, LC.space24)
                    .padding(.bottom, LC.space32)
            }
        }
        .onChange(of: currentPage) { _, _ in
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
        VStack(spacing: LC.space16) {
            // Primary CTA
            if currentPage < 2 {
                Button {
                    withAnimation { currentPage += 1 }
                } label: {
                    Text("Continue")
                }
                .buttonStyle(LCGoldButton())
            } else {
                // Page 3: Connect
                Button {
                    Task { await handleConnect() }
                } label: {
                    Text("Continue")
                }
                .buttonStyle(LCGoldButton())
            }

            // "Skip for now" — centered, 44pt tap area
            Button {
                dismiss()
            } label: {
                Text("Skip for now")
                    .font(.subheadline)
                    .foregroundStyle(LC.textTertiary(scheme))
                    .frame(height: 44)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Connect Handler

    private func handleConnect() async {
        if let provider = selectedProvider {
            switch provider {
            case .appleHealth:
                await healthService.requestAuthorization()
            case .strava, .fitbit, .garmin:
                // Third-party providers connect via Settings after onboarding
                break
            }
        }
        dismiss()
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

    // MARK: - Page 1: Intro — "Do the work."

    private var introPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [LC.accent.opacity(logoGlow ? 0.18 : 0.06), .clear],
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
                Text("Do the work.")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(LC.textPrimary(scheme))

                Text("We count the rest.")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Page 2: Value — "Activity is your proof"

    private var valuePage: some View {
        VStack(spacing: LC.space32) {
            Spacer()

            VStack(spacing: LC.space8) {
                Text("Activity is your proof.")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .multilineTextAlignment(.center)

                Text("Only real results count.")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(LC.success)
                    .multilineTextAlignment(.center)
            }

            // Value propositions
            VStack(alignment: .leading, spacing: LC.space24) {
                valueRow(icon: "figure.run", title: "Move your way", subtitle: "Walk, run, cycle — any activity counts")
                valueRow(icon: "checkmark.shield.fill", title: "Verified by data", subtitle: "Your fitness tracker proves completion")
                valueRow(icon: "trophy.fill", title: "Earn rewards", subtitle: "Hit the goal, claim what you've won")
            }
            .padding(.horizontal, LC.space4)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func valueRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: LC.space16) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(LC.accent)
                .frame(width: 48, height: 48)
                .background(LC.accent.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LC.textPrimary(scheme))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(LC.textSecondary(scheme))
            }

            Spacer()
        }
    }

    // MARK: - Page 3: Connect Activity

    private var connectPage: some View {
        VStack(spacing: LC.space24) {
            Spacer()

            VStack(spacing: LC.space12) {
                Text("Connect Your Activity")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(LC.textPrimary(scheme))
                    .multilineTextAlignment(.center)

                Text("Choose how to connect.")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(LC.textSecondary(scheme))
                    .multilineTextAlignment(.center)
            }

            // Provider cards
            VStack(spacing: LC.space12) {
                providerCard(.appleHealth, recommended: true)
                providerCard(.strava, recommended: false)
                providerCard(.fitbit, recommended: false)
                providerCard(.garmin, recommended: false)
            }

            Spacer()
        }
        .padding(.horizontal, LC.space24)
    }

    private func providerCard(_ provider: ActivityProvider, recommended: Bool) -> some View {
        let isSelected = selectedProvider == provider

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedProvider = isSelected ? nil : provider
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(spacing: LC.space12) {
                Image(systemName: provider.icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(provider.color)
                    .frame(width: 44, height: 44)
                    .background(provider.color.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))

                VStack(alignment: .leading, spacing: LC.space2) {
                    HStack(spacing: LC.space6) {
                        Text(provider.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))

                        if recommended {
                            Text("Recommended")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(LC.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(LC.accent.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }

                    Text(provider.subtitle)
                        .font(.caption)
                        .foregroundStyle(LC.textTertiary(scheme))
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isSelected ? LC.accent : LC.textTertiary(scheme).opacity(0.4))
            }
            .padding(LC.space12)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .stroke(isSelected ? LC.accent : LC.cardBorder(scheme), lineWidth: isSelected ? 1.5 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Activity Provider

private enum ActivityProvider: Hashable {
    case appleHealth, strava, fitbit, garmin

    var label: String {
        switch self {
        case .appleHealth: "Apple Health"
        case .strava: "Strava"
        case .fitbit: "Fitbit"
        case .garmin: "Garmin"
        }
    }

    var subtitle: String {
        switch self {
        case .appleHealth: "Steps, workouts, and more"
        case .strava: "Runs, rides, and activities"
        case .fitbit: "Steps and daily activity"
        case .garmin: "Workouts and fitness data"
        }
    }

    var icon: String {
        switch self {
        case .appleHealth: "heart.fill"
        case .strava: "figure.run"
        case .fitbit: "waveform.path.ecg"
        case .garmin: "applewatch"
        }
    }

    var color: Color {
        switch self {
        case .appleHealth: LC.danger
        case .strava: Color(hex: 0xFC4C02)
        case .fitbit: Color(hex: 0x00B0B9)
        case .garmin: Color(hex: 0x007CC3)
        }
    }
}
