// LightChallengeApp.swift
// LightChallenge iOS — native fitness challenge app.
//
// Deep links:
//   lightchallengeapp://challenge/{id}?subject={wallet}&token={token}&expires={expiry}
//   lightchallengeapp://auth/callback?provider={strava|fitbit}&status=ok
//   https://app.lightchallenge.io/proofs/{id}?subject={wallet}

import SwiftUI

@main
struct LightChallengeApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var healthService = HealthKitService()
    @StateObject private var walletManager = WalletManager.shared
    @StateObject private var oauthService = OAuthService.shared
    @StateObject private var notificationService = NotificationService.shared
    @StateObject private var avatarService = AvatarService.shared
    @State private var showSplash = true
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            rootView
                .environmentObject(appState)
                .environmentObject(healthService)
                .environmentObject(walletManager)
                .environmentObject(oauthService)
                .environmentObject(notificationService)
                .environmentObject(avatarService)
                // Light-first (follows system appearance)
                .onOpenURL { url in
                    appState.handleDeepLink(url)
                    walletManager.handleDeepLink(url)
                    propagateToHealthService(url)
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active && appState.hasWallet {
                        // Refresh linked accounts when app comes to foreground
                        // (catches OAuth callbacks even if deep link handling fails)
                        Task {
                            await oauthService.refreshLinkedAccounts(
                                baseURL: appState.serverURL,
                                wallet: appState.walletAddress
                            )
                            oauthService.isAuthenticating = false
                        }
                    }
                }
                .onChange(of: walletManager.isConnected) { _, connected in
                    if connected {
                        appState.walletAddress = walletManager.connectedAddress
                    }
                }
                .task {
                    // Initialize services
                    walletManager.configure()
                    oauthService.detectInstalledApps()

                    // Auto-prompt HealthKit authorization
                    if !healthService.isAuthorized {
                        await healthService.requestAuthorization()
                    }

                    await notificationService.checkPermission()

                    // Restore wallet connection if address is saved
                    if appState.hasWallet && !walletManager.isConnected {
                        walletManager.connectManually(address: appState.walletAddress)
                    }

                    // Refresh linked accounts
                    if appState.hasWallet {
                        await oauthService.refreshLinkedAccounts(
                            baseURL: appState.serverURL,
                            wallet: appState.walletAddress
                        )
                    }

                    // Sync avatar from server
                    if appState.hasWallet {
                        await avatarService.syncFromServer(
                            wallet: appState.walletAddress,
                            serverURL: appState.serverURL
                        )
                    }

                    // Fetch notifications
                    if appState.hasWallet {
                        await notificationService.fetchNotifications(
                            baseURL: appState.serverURL,
                            wallet: appState.walletAddress
                        )
                    }
                }
        }
    }

    @ViewBuilder
    private var rootView: some View {
        if showSplash {
            SplashPortal {
                withAnimation(.easeInOut(duration: 0.5)) {
                    showSplash = false
                }
            }
        } else if appState.hasCompletedOnboarding {
            MainTabView()
                .transition(.opacity)
        } else {
            OnboardingView()
                .transition(.opacity)
        }
    }

    private func propagateToHealthService(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }
        let token = components.queryItems?.first(where: { $0.name == "token" })?.value
        let expires = components.queryItems?.first(where: { $0.name == "expires" })?.value
        if let token, !token.isEmpty {
            healthService.pendingToken = token
            healthService.pendingExpires = expires ?? ""
        }
    }
}
