// ProfileView.swift
// Profile tab — wallet, linked accounts, notifications, settings.
// Apple-style grouped list with compact wallet card at top.

import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @EnvironmentObject private var walletManager: WalletManager
    @EnvironmentObject private var oauthService: OAuthService
    @EnvironmentObject private var notificationService: NotificationService

    @EnvironmentObject private var avatarService: AvatarService

    @State private var showingWalletSheet = false
    @State private var showingNetworkPicker = false
    @State private var showingAvatarPicker = false
    @Environment(\.colorScheme) private var scheme

    @State private var healthPending = false
    @State private var stravaPending = false
    @State private var fitbitPending = false
    @State private var garminPending = false

    var body: some View {
        NavigationStack {
            List {
                // Wallet section
                Section {
                    walletCard
                }

                // Linked accounts
                Section {
                    appleHealthRow

                    fitnessToggleRow(
                        provider: "strava",
                        name: "Strava",
                        brandColor: Color(hex: 0xFC4C02),
                        isLinked: oauthService.stravaLinked,
                        pending: $stravaPending,
                        account: oauthService.linkedAccounts["strava"]
                    )

                    fitnessToggleRow(
                        provider: "fitbit",
                        name: "Fitbit",
                        brandColor: Color(hex: 0x00B0B9),
                        isLinked: oauthService.fitbitLinked,
                        pending: $fitbitPending,
                        account: oauthService.linkedAccounts["fitbit"]
                    )

                    fitnessToggleRow(
                        provider: "garmin",
                        name: "Garmin Connect",
                        brandColor: Color(hex: 0x007CC3),
                        isLinked: oauthService.garminLinked,
                        pending: $garminPending,
                        account: oauthService.linkedAccounts["garmin"]
                    )
                } header: {
                    Label("Activity Sources", systemImage: "heart.fill")
                }

                // Notifications
                Section {
                    notificationRow
                } header: {
                    Label("Notifications", systemImage: "bell.fill")
                }

                // About
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.2.0 (3)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.tertiary)
                    }

                    Button {
                        showingNetworkPicker = true
                    } label: {
                        HStack {
                            Text("Network")
                                .foregroundStyle(LC.textPrimary(scheme))
                            Spacer()
                            HStack(spacing: LC.space6) {
                                Circle().fill(LC.success).frame(width: 6, height: 6)
                                Text(currentEnvironmentLabel)
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }

                    Button {
                        Task { await CacheService.shared.clearAll() }
                    } label: {
                        HStack {
                            Text("Clear Cache")
                                .foregroundStyle(LC.textPrimary(scheme))
                            Spacer()
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 12))
                                .foregroundStyle(.tertiary)
                        }
                    }
                } header: {
                    Text("About")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingWalletSheet) {
                WalletSheet()
            }
            .sheet(isPresented: $showingAvatarPicker) {
                AvatarPickerView()
            }
            .sheet(isPresented: $showingNetworkPicker) {
                networkPickerSheet
            }
            .onAppear {
                oauthService.detectInstalledApps()
            }
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
                    if !oauthService.stravaLinked { stravaPending = false }
                    if !oauthService.fitbitLinked { fitbitPending = false }
                    if !oauthService.garminLinked { garminPending = false }
                }
            }
            .onChange(of: healthService.isAuthorized) { _, authorized in
                if authorized { healthPending = false }
            }
        }
    }

    // MARK: - Wallet Card

    private var walletCard: some View {
        VStack(spacing: LC.space16) {
            // Avatar + wallet info
            HStack(spacing: LC.space16) {
                Button {
                    if walletManager.isConnected {
                        showingAvatarPicker = true
                    }
                } label: {
                    if walletManager.isConnected {
                        EditableAvatarView(size: 64, walletAddress: walletManager.connectedAddress)
                    } else {
                        AvatarView(size: 64)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!walletManager.isConnected)

                VStack(alignment: .leading, spacing: LC.space4) {
                    if walletManager.isConnected {
                        Text(appState.truncatedWallet)
                            .font(.subheadline.weight(.semibold))
                        HStack(spacing: LC.space4) {
                            Circle()
                                .fill(walletManager.isWrongNetwork ? LC.warning : LC.success)
                                .frame(width: 6, height: 6)
                            Text(walletManager.isWrongNetwork ? "Wrong Network" : LightChain.chainName)
                                .font(.caption)
                                .foregroundStyle(walletManager.isWrongNetwork ? LC.warning : LC.success)
                        }
                    } else {
                        Text("Connect Wallet")
                            .font(.subheadline.weight(.semibold))
                        Text("Tap to connect via WalletConnect")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                Button {
                    showingWalletSheet = true
                } label: {
                    Image(systemName: walletManager.isConnected ? "arrow.triangle.2.circlepath" : "wallet.bifold.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(LC.accent)
                }
            }
        }
        .foregroundStyle(LC.textPrimary(scheme))
    }

    // MARK: - Apple Health

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
                    .foregroundStyle(.tertiary)
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
    }

    // MARK: - Fitness Account Toggle

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
                        .foregroundStyle(.tertiary)
                } else if pending.wrappedValue {
                    Text("Connecting...")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { isLinked || pending.wrappedValue },
                set: { newValue in
                    guard appState.hasWallet else { return }
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
    }

    // MARK: - Notifications

    private var notificationRow: some View {
        VStack(spacing: LC.space8) {
            HStack(spacing: LC.space12) {
                Image(systemName: "bell.fill")
                    .foregroundStyle(LC.accent)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: LC.space2) {
                    Text("Push Notifications")
                        .font(.subheadline)
                    Text("Challenge updates, verdicts, claims")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                if notificationService.isAuthorized {
                    Toggle("", isOn: $appState.notificationsEnabled)
                        .labelsHidden()
                        .tint(LC.accent)
                } else {
                    Button("Enable") {
                        Task {
                            await notificationService.requestPermission()
                            appState.notificationsEnabled = notificationService.isAuthorized
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LC.accent)
                }
            }

            if notificationService.isAuthorized && !appState.notificationsEnabled {
                HStack(spacing: LC.space6) {
                    Image(systemName: "info.circle").font(.system(size: 11))
                    Text("Notifications paused. Toggle on to receive updates.")
                        .font(.caption2)
                }
                .foregroundStyle(.tertiary)
                .padding(.leading, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: - Network Picker

    private var networkPickerSheet: some View {
        NavigationStack {
            List {
                Section {
                    networkOption(label: "UAT (Testnet)", url: ServerConfig.uatBaseURL, detail: "uat.lightchallenge.app")
                    networkOption(label: "Production", url: ServerConfig.productionBaseURL, detail: "app.lightchallenge.app")
                } header: {
                    Text("Server Environment")
                }
            }
            .navigationTitle("Network")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { showingNetworkPicker = false }
                        .foregroundStyle(LC.accent)
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
                    Text(label).font(.subheadline).foregroundStyle(LC.textPrimary(scheme))
                    Text(detail).font(.caption2).foregroundStyle(.tertiary)
                }
                Spacer()
                if appState.serverURL == url {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(LC.success)
                }
            }
        }
    }

    private var currentEnvironmentLabel: String {
        appState.serverURL == ServerConfig.productionBaseURL ? "Production" : "LightChain Testnet"
    }
}
