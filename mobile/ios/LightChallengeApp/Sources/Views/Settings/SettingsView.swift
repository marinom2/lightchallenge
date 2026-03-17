// SettingsView.swift
// Premium settings — wallet, health, linked accounts, network, about.

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var oauthService: OAuthService
    @EnvironmentObject private var notificationService: NotificationService

    @State private var showingWalletSheet = false
    @State private var showingNetworkPicker = false
    @Environment(\.colorScheme) private var scheme

    // Pending toggle states (keep toggle ON while async ops complete)
    @State private var healthPending = false
    @State private var stravaPending = false
    @State private var fitbitPending = false
    @State private var garminPending = false

    var body: some View {
        ScrollView {
            VStack(spacing: LC.space16) {
                profileCard

                sectionCard("Activity Sources", icon: "heart.fill", iconColor: LC.danger) {
                    appleHealthRow
                    Divider().padding(.leading, 48)
                    fitnessToggleRow(
                        provider: "strava",
                        name: "Strava",
                        brandColor: Color(hex: 0xFC4C02),
                        isLinked: oauthService.stravaLinked,
                        pending: $stravaPending,
                        account: oauthService.linkedAccounts["strava"]
                    )
                    Divider().padding(.leading, 48)
                    fitnessToggleRow(
                        provider: "fitbit",
                        name: "Fitbit",
                        brandColor: Color(hex: 0x00B0B9),
                        isLinked: oauthService.fitbitLinked,
                        pending: $fitbitPending,
                        account: oauthService.linkedAccounts["fitbit"]
                    )
                    Divider().padding(.leading, 48)
                    fitnessToggleRow(
                        provider: "garmin",
                        name: "Garmin Connect",
                        brandColor: Color(hex: 0x007CC3),
                        isLinked: oauthService.garminLinked,
                        pending: $garminPending,
                        account: oauthService.linkedAccounts["garmin"]
                    )
                }

                sectionCard("Notifications", icon: "bell.fill", iconColor: LC.accent) {
                    notificationRow
                }

                aboutCard
            }
            .padding(.horizontal, LC.space16)
            .padding(.top, LC.space8)
            .padding(.bottom, LC.space32)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Settings")
        .sheet(isPresented: $showingWalletSheet) {
            WalletSheet()
        }
        .sheet(isPresented: $showingNetworkPicker) {
            networkPickerSheet
        }
        .onAppear {
            oauthService.detectInstalledApps()
        }
            // Clear pending states when OAuth finishes
            .onChange(of: oauthService.stravaLinked) { _, linked in
                if linked { stravaPending = false }
            }
            .onChange(of: oauthService.fitbitLinked) { _, linked in
                if linked { fitbitPending = false }
            }
            .onChange(of: oauthService.garminLinked) { _, linked in
                if linked { garminPending = false }
            }
            .onChange(of: oauthService.isAuthenticating) { _, authenticating in
                if !authenticating {
                    // OAuth flow ended (user cancelled or completed)
                    if !oauthService.stravaLinked { stravaPending = false }
                    if !oauthService.fitbitLinked { fitbitPending = false }
                    if !oauthService.garminLinked { garminPending = false }
                }
            }
            .onChange(of: healthService.isAuthorized) { _, authorized in
                if authorized { healthPending = false }
            }
    }

    // MARK: - Profile Header Card

    private var profileCard: some View {
        Button {
            showingWalletSheet = true
        } label: {
            HStack(spacing: LC.space16) {
                ZStack {
                    Circle()
                        .fill(
                            walletManager.isConnected
                                ? LinearGradient(colors: [LC.gold, LC.goldDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
                                : LinearGradient(colors: [.gray.opacity(0.3), .gray.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                        .frame(width: 52, height: 52)

                    if walletManager.isConnected {
                        Text(String(walletManager.connectedAddress.dropFirst(2).prefix(2)).uppercased())
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                    } else {
                        Image(systemName: "wallet.bifold")
                            .font(.system(size: 20))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }

                VStack(alignment: .leading, spacing: LC.space4) {
                    if walletManager.isConnected {
                        Text(appState.truncatedWallet)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                        HStack(spacing: LC.space6) {
                            Circle()
                                .fill(LC.success)
                                .frame(width: 6, height: 6)
                            Text(LightChain.chainName)
                                .font(.caption)
                                .foregroundStyle(LC.success)
                        }
                    } else {
                        Text("Connect Wallet")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                        Text("Tap to connect via WalletConnect")
                            .font(.caption)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LC.textTertiary(scheme))
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(walletManager.isConnected ? LC.gold.opacity(0.2) : LC.cardBorder(scheme), lineWidth: walletManager.isConnected ? 1 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Section Card Builder

    private func sectionCard<Content: View>(
        _ title: String,
        icon: String,
        iconColor: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: LC.space8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iconColor)
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LC.textTertiary(scheme))
            }
            .padding(.horizontal, LC.space16)
            .padding(.bottom, LC.space8)

            VStack(spacing: 0) {
                content()
            }
            .padding(.vertical, LC.space4)
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

    // MARK: - Apple Health (toggle with pending state)

    private var appleHealthRow: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "heart.fill")
                .foregroundStyle(LC.danger)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: LC.space2) {
                Text("Apple Health")
                    .font(.subheadline)
                Text("Steps, distance, workouts")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { appState.healthEnabled || healthPending },
                set: { newValue in
                    if newValue {
                        if !healthService.isAuthorized {
                            healthPending = true
                            Task {
                                await healthService.requestAuthorization()
                                healthPending = false
                                appState.healthEnabled = healthService.isAuthorized
                            }
                        } else {
                            appState.healthEnabled = true
                        }
                    } else {
                        appState.healthEnabled = false
                    }
                }
            ))
            .labelsHidden()
            .tint(LC.danger)
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    // MARK: - Fitness Account Toggle Row

    private func fitnessToggleRow(
        provider: String,
        name: String,
        brandColor: Color,
        isLinked: Bool,
        pending: Binding<Bool>,
        account: LinkedAccount?
    ) -> some View {
        HStack(spacing: LC.space12) {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(brandColor)
                .frame(width: 28, height: 28)
                .overlay(
                    Text(String(name.prefix(1)))
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: LC.space2) {
                Text(name)
                    .font(.subheadline)
                if let account {
                    Text(account.displayName)
                        .font(.caption)
                        .foregroundStyle(LC.success)
                } else if !appState.hasWallet {
                    Text("Connect wallet first")
                        .font(.caption)
                        .foregroundStyle(LC.textTertiary(scheme))
                } else if pending.wrappedValue {
                    Text("Connecting...")
                        .font(.caption)
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { isLinked || pending.wrappedValue },
                set: { newValue in
                    print("[TOGGLE] \(provider): newValue=\(newValue) isLinked=\(isLinked) pending=\(pending.wrappedValue) hasWallet=\(appState.hasWallet) isAuth=\(oauthService.isAuthenticating)")
                    guard appState.hasWallet else { print("[TOGGLE] blocked: no wallet"); return }
                    if newValue && !isLinked && !oauthService.isAuthenticating {
                        pending.wrappedValue = true
                        switch provider {
                        case "strava":
                            oauthService.connectStrava(baseURL: appState.serverURL, wallet: appState.walletAddress)
                        case "fitbit":
                            oauthService.connectFitbit(baseURL: appState.serverURL, wallet: appState.walletAddress)
                        case "garmin":
                            oauthService.connectGarmin(baseURL: appState.serverURL, wallet: appState.walletAddress)
                        default: break
                        }
                    } else if !newValue {
                        // Clear pending state and disconnect if linked
                        pending.wrappedValue = false
                        oauthService.isAuthenticating = false
                        if isLinked {
                            Task {
                                await oauthService.disconnect(
                                    provider: provider,
                                    baseURL: appState.serverURL,
                                    wallet: appState.walletAddress
                                )
                            }
                        }
                    }
                }
            ))
            .labelsHidden()
            .tint(brandColor)
            .opacity(appState.hasWallet ? 1 : 0.4)
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    // MARK: - Notifications

    private var notificationRow: some View {
        VStack(spacing: LC.space8) {
            HStack(spacing: LC.space12) {
                Image(systemName: "bell.fill")
                    .foregroundStyle(LC.gold)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Push Notifications")
                        .font(.subheadline)
                    Text("Challenge updates, verdicts, claims")
                        .font(.caption)
                        .foregroundStyle(LC.textTertiary(scheme))
                }

                Spacer()

                if notificationService.isAuthorized {
                    Toggle("", isOn: $appState.notificationsEnabled)
                        .labelsHidden()
                        .tint(LC.gold)
                } else {
                    Button("Enable") {
                        Task {
                            await notificationService.requestPermission()
                            appState.notificationsEnabled = notificationService.isAuthorized
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LC.gold)
                }
            }

            if notificationService.isAuthorized && !appState.notificationsEnabled {
                HStack(spacing: LC.space6) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 11))
                    Text("Notifications paused. Toggle on to receive updates.")
                        .font(.caption2)
                }
                .foregroundStyle(LC.textTertiary(scheme))
                .padding(.leading, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space12)
    }

    // MARK: - About (Version + Network + Cache)

    private var aboutCard: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Version")
                    .font(.subheadline)
                    .foregroundStyle(LC.textSecondary(scheme))
                Spacer()
                Text("1.2.0 (3)")
                    .font(.caption.monospaced())
                    .foregroundStyle(LC.textTertiary(scheme))
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, LC.space12)

            Divider().padding(.leading, LC.space16)

            Button {
                showingNetworkPicker = true
            } label: {
                HStack {
                    Text("Network")
                        .font(.subheadline)
                        .foregroundStyle(LC.textSecondary(scheme))
                    Spacer()
                    HStack(spacing: LC.space6) {
                        Circle()
                            .fill(LC.success)
                            .frame(width: 6, height: 6)
                        Text(currentEnvironmentLabel)
                            .font(.caption)
                            .foregroundStyle(LC.textTertiary(scheme))
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 10))
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)
            }
            .buttonStyle(.plain)
        }
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
        )
    }

    // MARK: - Network Picker Sheet (bottom sheet)

    private var networkPickerSheet: some View {
        NavigationStack {
            List {
                Section {
                    networkOption(
                        label: "UAT (Testnet)",
                        url: ServerConfig.uatBaseURL,
                        detail: "uat.lightchallenge.app"
                    )
                    networkOption(
                        label: "Production",
                        url: ServerConfig.productionBaseURL,
                        detail: "app.lightchallenge.app"
                    )
                } header: {
                    Text("Server Environment")
                }
            }
            .navigationTitle("Network")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { showingNetworkPicker = false }
                        .foregroundStyle(LC.gold)
                }
            }
            .presentationDetents([.height(260)])
            .presentationDragIndicator(.visible)
        }
    }

    private func networkOption(label: String, url: String, detail: String) -> some View {
        Button {
            appState.serverURL = url
            showingNetworkPicker = false
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.subheadline)
                        .foregroundStyle(LC.textPrimary(scheme))
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(LC.textTertiary(scheme))
                }
                Spacer()
                if appState.serverURL == url {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(LC.success)
                }
            }
        }
    }

    // MARK: - Helpers

    private var currentEnvironmentLabel: String {
        if appState.serverURL == ServerConfig.productionBaseURL {
            return "Production"
        }
        return "LightChain Testnet"
    }
}
