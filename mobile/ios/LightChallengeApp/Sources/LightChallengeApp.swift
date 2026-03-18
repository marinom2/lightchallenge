// LightChallengeApp.swift
// LightChallenge iOS — native fitness challenge app.
//
// Deep links:
//   lightchallengeapp://challenge/{id}?subject={wallet}&token={token}&expires={expiry}
//   lightchallengeapp://auth/callback?provider={strava|fitbit}&status=ok
//   https://uat.lightchallenge.app/challenge/{id}?subject={wallet}

import SwiftUI
import BackgroundTasks
import UserNotifications

// MARK: - Notification Delegate (handles notification taps → deep links)

/// Bridges UNUserNotificationCenter delegate callbacks to SwiftUI's onOpenURL.
/// When a user taps a notification with a deepLink in userInfo, this delegate
/// extracts the URL and opens it, triggering the app's standard deep link flow.
class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    /// Show banners even when the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Handle notification tap: extract deepLink from userInfo and open it.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let deepLink = userInfo["deepLink"] as? String,
           let url = URL(string: deepLink) {
            print("[NOTIFICATION] tapped → opening deep link: \(deepLink)")
            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }
        completionHandler()
    }
}

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

    private static let autoProofTaskId = "io.lightchallenge.app.autoproof"
    private let notificationDelegate = NotificationDelegate()

    init() {
        // Set notification delegate so taps trigger deep links
        UNUserNotificationCenter.current().delegate = notificationDelegate

        // Register background task for auto-proof submission.
        // This allows evidence to be submitted even if the user doesn't open the app.
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.autoProofTaskId, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Self.handleAutoProofBackgroundTask(refreshTask)
        }
    }

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

                    if phase == .background && appState.hasWallet {
                        // Schedule background auto-proof check
                        Self.scheduleAutoProofTask()
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

                    // Cold-launch auto-proof check
                    if appState.hasWallet {
                        await checkPendingAutoProofs()
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

    /// Fetch the user's challenges and activities, then run auto-proof checks
    /// and evaluate smart progress alerts.
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

            // Evaluate smart progress alerts for active challenges the user has joined
            await evaluateChallengeAlerts(challenges: challenges, activities: activityMap)
        } catch {
            // Silently fail — auto-proof is best-effort on foreground
            print("[AutoProof] foreground check failed: \(error.localizedDescription)")
        }
    }

    /// Check each active joined challenge and schedule smart local notifications
    /// if the user is falling behind their target.
    private func evaluateChallengeAlerts(
        challenges: [ChallengeMeta],
        activities: [String: MyChallenge]
    ) async {
        let baseURL = appState.serverURL
        let wallet = appState.walletAddress
        let now = Date()

        for challenge in challenges {
            // Only evaluate active challenges the user has joined
            guard activities[challenge.id] != nil else { continue }
            guard let startDate = challenge.startDate,
                  let endDate = challenge.endsDate,
                  startDate < now, endDate > now else { continue }

            // Need a measurable goal (non-competitive)
            guard let rule = challenge.params?.firstRule,
                  rule.goalValue > 0 else { continue }

            // Fetch server-side progress
            do {
                let progress = try await APIClient.shared.fetchMyProgress(
                    baseURL: baseURL,
                    challengeId: challenge.id,
                    subject: wallet
                )

                notificationService.evaluateAndScheduleAlerts(
                    challengeId: challenge.id,
                    title: challenge.displayTitle,
                    startDate: startDate,
                    endDate: endDate,
                    currentValue: progress.currentValue ?? 0,
                    goalValue: progress.goalValue ?? rule.goalValue,
                    metricLabel: progress.metricLabel ?? rule.metricLabel
                )
            } catch {
                // Best-effort — don't block other challenges
                continue
            }
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

    // MARK: - Background Task

    /// Schedule the next background auto-proof check.
    /// iOS will wake the app at an opportune time (typically within 15-30 minutes).
    static func scheduleAutoProofTask() {
        let request = BGAppRefreshTaskRequest(identifier: autoProofTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // earliest: 15 min
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[AutoProof] Failed to schedule background task: \(error.localizedDescription)")
        }
    }

    /// Handle background auto-proof task execution.
    /// Creates temporary service instances (background has no UI state objects).
    @MainActor
    static func handleAutoProofBackgroundTask(_ task: BGAppRefreshTask) {
        // Re-schedule for next run
        scheduleAutoProofTask()

        let bgAppState = AppState()
        let bgHealthService = HealthKitService()

        guard bgAppState.hasWallet else {
            task.setTaskCompleted(success: true)
            return
        }

        let workTask = Task {
            do {
                async let challengesTask = APIClient.shared.fetchChallenges(baseURL: bgAppState.serverURL)
                async let activitiesTask = APIClient.shared.fetchMyActivity(baseURL: bgAppState.serverURL, subject: bgAppState.walletAddress)

                let challenges = try await challengesTask
                let activities = try await activitiesTask

                var activityMap: [String: MyChallenge] = [:]
                for activity in activities {
                    activityMap[activity.challengeId] = activity
                }

                // Restore HealthKit auth
                if bgAppState.healthEnabled {
                    await bgHealthService.requestAuthorization()
                }

                AutoProofService.shared.checkPendingChallenges(
                    challenges: challenges,
                    activities: activityMap,
                    appState: bgAppState,
                    healthService: bgHealthService
                )

                // Give auto-proof submissions a few seconds to complete
                try await Task.sleep(nanoseconds: 5_000_000_000)

                task.setTaskCompleted(success: true)
            } catch {
                print("[AutoProof] Background task failed: \(error.localizedDescription)")
                task.setTaskCompleted(success: false)
            }
        }

        task.expirationHandler = {
            workTask.cancel()
        }
    }
}
