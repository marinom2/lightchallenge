// LightChallengeApp.swift
// LightChallenge iOS — native fitness challenge app.
//
// Deep links:
//   lightchallengeapp://challenge/{id}?subject={wallet}&token={token}&expires={expiry}
//   lightchallengeapp://auth/callback?provider={strava|fitbit}&status=ok
//   https://uat.lightchallenge.app/challenge/{id}?subject={wallet}

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
    @State private var showOnboarding = true
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
                // Universal links (HTTPS URLs from uat.lightchallenge.app / lightchallenge.app)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    appState.handleDeepLink(url)
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

                        // Check pending challenges for auto-proof submission
                        Task {
                            await checkPendingAutoProofs()
                        }
                    }
                }
                .onChange(of: walletManager.isConnected) { _, connected in
                    if connected {
                        appState.walletAddress = walletManager.connectedAddress
                        connectPendingOnboardingProvider()
                    }
                }
                .task {
                    // Initialize services
                    walletManager.configure()
                    oauthService.detectInstalledApps()

                    // Restore HealthKit auth state if previously enabled
                    if appState.healthEnabled {
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
        } else if showOnboarding && !appState.hasCompletedOnboarding {
            OnboardingView(dismiss: {
                withAnimation(.easeInOut(duration: 0.4)) {
                    showOnboarding = false
                }
                appState.hasCompletedOnboarding = true
            })
            .transition(.opacity)
        } else {
            MainTabView()
                .transition(.opacity)
        }
    }

    /// Fetch the user's challenges and activities, then run auto-proof checks.
    private func checkPendingAutoProofs() async {
        let baseURL = appState.serverURL
        let wallet = appState.walletAddress

        do {
            async let challengesTask = APIClient.shared.fetchChallenges(baseURL: baseURL)
            async let activitiesTask = APIClient.shared.fetchMyActivity(baseURL: baseURL, subject: wallet)

            let challenges = try await challengesTask
            let activities = try await activitiesTask

            // Update widget with the most urgent active challenge
            appState.updateWidgetChallenge(challenges: challenges)

            // Build lookup keyed by challengeId
            var activityMap: [String: MyChallenge] = [:]
            for activity in activities {
                activityMap[activity.challengeId] = activity
            }

            AutoProofService.shared.checkPendingChallenges(
                challenges: challenges,
                activities: activityMap,
                appState: appState,
                healthService: healthService
            )
        } catch {
            // Silently fail — auto-proof is best-effort on foreground
            print("[AutoProof] foreground check failed: \(error.localizedDescription)")
        }
    }

    /// Auto-connect an activity provider that was selected during onboarding
    /// but required a wallet (Strava, Fitbit, Garmin).
    private func connectPendingOnboardingProvider() {
        let provider = appState.onboardingActivityProvider
        guard !provider.isEmpty, appState.hasWallet else { return }

        switch provider {
        case "strava":
            oauthService.connectStrava(baseURL: appState.serverURL, wallet: appState.walletAddress)
        case "fitbit":
            oauthService.connectFitbit(baseURL: appState.serverURL, wallet: appState.walletAddress)
        case "garmin":
            oauthService.connectGarmin(baseURL: appState.serverURL, wallet: appState.walletAddress)
        default:
            break
        }

        appState.onboardingActivityProvider = ""
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
