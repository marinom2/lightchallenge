// OAuthService.swift
// Strava, Fitbit, and Garmin fitness account linking.
// Uses ASWebAuthenticationSession for OAuth flows.
// Detects installed apps and offers direct deep link integration.

import Foundation
import AuthenticationServices
import UIKit

@MainActor
class OAuthService: NSObject, ObservableObject {
    static let shared = OAuthService()

    @Published var stravaLinked = false
    @Published var fitbitLinked = false
    @Published var garminLinked = false
    @Published var isAuthenticating = false
    @Published var error: String?

    /// Linked account info keyed by provider.
    @Published var linkedAccounts: [String: LinkedAccount] = [:]

    /// Detected app availability.
    @Published var stravaInstalled = false
    @Published var fitbitInstalled = false
    @Published var garminInstalled = false

    private var authSession: ASWebAuthenticationSession?
    private weak var presentationContext: (any ASWebAuthenticationPresentationContextProviding)?

    // MARK: - Detect Installed Apps

    func detectInstalledApps() {
        stravaInstalled = canOpenURL("strava://")
        fitbitInstalled = canOpenURL("fitbit://")
        garminInstalled = canOpenURL("garminconnect://")
    }

    private func canOpenURL(_ urlString: String) -> Bool {
        guard let url = URL(string: urlString) else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    // MARK: - Strava

    func connectStrava(baseURL: String, wallet: String) {
        print("[OAUTH] connectStrava: stravaInstalled=\(stravaInstalled) baseURL=\(baseURL) wallet=\(wallet)")
        // If Strava app is installed, use native app OAuth (no web login needed)
        if stravaInstalled, let clientId = stravaClientId(baseURL: baseURL) {
            startNativeAppOAuth(
                appScheme: "strava://oauth/mobile/authorize",
                clientId: clientId,
                scope: "activity:read_all",
                provider: "strava",
                baseURL: baseURL,
                wallet: wallet
            )
            return
        }

        // Fallback: web-based OAuth
        let urlString = "\(baseURL)/api/auth/strava?subject=\(wallet)&redirect_scheme=lightchallengeapp"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }
        startOAuthSession(url: url, provider: "strava", baseURL: baseURL, wallet: wallet)
    }

    // MARK: - Fitbit

    func connectFitbit(baseURL: String, wallet: String) {
        let urlString = "\(baseURL)/api/auth/fitbit?subject=\(wallet)&redirect_scheme=lightchallengeapp"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }
        startOAuthSession(url: url, provider: "fitbit", baseURL: baseURL, wallet: wallet)
    }

    // MARK: - Garmin

    func connectGarmin(baseURL: String, wallet: String) {
        let urlString = "\(baseURL)/api/auth/garmin?subject=\(wallet)&redirect_scheme=lightchallengeapp"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }
        startOAuthSession(url: url, provider: "garmin", baseURL: baseURL, wallet: wallet)
    }

    // MARK: - Open Companion App

    /// Open the companion fitness app on the device.
    func openCompanionApp(_ provider: String) {
        let scheme: String
        switch provider {
        case "strava": scheme = "strava://"
        case "fitbit": scheme = "fitbit://"
        case "garmin": scheme = "garminconnect://"
        default: return
        }
        guard let url = URL(string: scheme) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - Check Linked Status

    func refreshLinkedAccounts(baseURL: String, wallet: String) async {
        for provider in ["strava", "fitbit", "garmin"] {
            guard let url = URL(string: "\(baseURL)/api/linked-accounts?wallet=\(wallet)&platform=\(provider)") else {
                continue
            }
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                if let binding = json?["binding"] as? [String: Any],
                   let platformId = binding["platformId"] as? String {
                    let handle = binding["handle"] as? String
                    linkedAccounts[provider] = LinkedAccount(
                        provider: provider,
                        platformId: platformId,
                        handle: handle
                    )
                    switch provider {
                    case "strava": stravaLinked = true
                    case "fitbit": fitbitLinked = true
                    case "garmin": garminLinked = true
                    default: break
                    }
                } else {
                    linkedAccounts.removeValue(forKey: provider)
                    switch provider {
                    case "strava": stravaLinked = false
                    case "fitbit": fitbitLinked = false
                    case "garmin": garminLinked = false
                    default: break
                    }
                }
            } catch {
                // Silently fail — non-critical
            }
        }
    }

    // MARK: - Disconnect

    func disconnect(provider: String, baseURL: String, wallet: String) async {
        guard let url = URL(string: "\(baseURL)/api/linked-accounts?wallet=\(wallet)&platform=\(provider)") else {
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        request.setValue(wallet, forHTTPHeaderField: "x-lc-address")
        request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")

        _ = try? await URLSession.shared.data(for: request)

        linkedAccounts.removeValue(forKey: provider)
        switch provider {
        case "strava": stravaLinked = false
        case "fitbit": fitbitLinked = false
        case "garmin": garminLinked = false
        default: break
        }
    }

    // MARK: - Native App OAuth (opens provider app directly)

    /// Pending native OAuth context so we can finish when the deep link returns.
    private var pendingOAuth: (provider: String, baseURL: String, wallet: String)?

    /// Strava client ID — fetched from server config endpoint or hardcoded for now.
    private func stravaClientId(baseURL: String) -> String? {
        // The client ID is public (embedded in the auth URL).
        // We can read it from the server or hardcode for the registered app.
        return "212300"
    }

    private func startNativeAppOAuth(
        appScheme: String,
        clientId: String,
        scope: String,
        provider: String,
        baseURL: String,
        wallet: String
    ) {
        isAuthenticating = true
        error = nil

        let callbackURL = "\(baseURL)/api/auth/\(provider)/callback"
        let state = "subject:\(wallet),redirect_scheme:lightchallengeapp"

        var params = URLComponents(string: appScheme)!
        params.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: callbackURL),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "approval_prompt", value: "auto"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "state", value: state),
        ]

        guard let url = params.url else {
            isAuthenticating = false
            error = "Could not build OAuth URL"
            return
        }

        pendingOAuth = (provider, baseURL, wallet)
        UIApplication.shared.open(url) { [weak self] success in
            Task { @MainActor in
                if !success {
                    self?.isAuthenticating = false
                    self?.pendingOAuth = nil
                    self?.error = "Could not open \(provider) app"
                }
            }
        }
    }

    /// Called from AppState.handleDeepLink when lightchallengeapp://callback arrives
    /// after a native app OAuth flow.
    func handleOAuthCallback(provider: String?, status: String?) async {
        let pending = pendingOAuth
        pendingOAuth = nil

        if status == "ok", let pending {
            // Refresh BEFORE clearing isAuthenticating so the onChange
            // handler sees stravaLinked=true and doesn't clear pending.
            await refreshLinkedAccounts(baseURL: pending.baseURL, wallet: pending.wallet)
        } else if status != "ok" {
            error = "OAuth authorization failed"
        }

        isAuthenticating = false
    }

    // MARK: - ASWebAuthenticationSession

    func setPresentationContext(_ context: any ASWebAuthenticationPresentationContextProviding) {
        presentationContext = context
    }

    private func startOAuthSession(url: URL, provider: String, baseURL: String, wallet: String) {
        isAuthenticating = true
        error = nil

        let callbackScheme = "lightchallengeapp"

        authSession = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: callbackScheme
        ) { [weak self] callbackURL, authError in
            Task { @MainActor in
                self?.isAuthenticating = false

                if let authError {
                    if (authError as NSError).code != ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        self?.error = "Authentication failed: \(authError.localizedDescription)"
                    }
                    return
                }

                // Check if the callback indicates success
                if let callbackURL,
                   let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) {
                    let status = components.queryItems?.first(where: { $0.name == "status" })?.value
                    if status == "ok" || components.queryItems?.contains(where: { $0.name == provider && $0.value == "ok" }) == true {
                        await self?.refreshLinkedAccounts(baseURL: baseURL, wallet: wallet)
                    }
                }
            }
        }

        authSession?.prefersEphemeralWebBrowserSession = false
        // Use self as presentation context (provides the key window)
        authSession?.presentationContextProvider = self
        let started = authSession?.start() ?? false
        if !started {
            isAuthenticating = false
            error = "Could not open authentication browser"
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension OAuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Return the app's key window for the auth sheet to present from
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
    }
}

// MARK: - Linked Account

struct LinkedAccount {
    let provider: String
    let platformId: String
    let handle: String?

    var displayName: String {
        handle ?? platformId
    }
}
