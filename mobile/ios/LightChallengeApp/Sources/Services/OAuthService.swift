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
        let urlString = "\(baseURL)/api/auth/strava?subject=\(wallet)&redirect_scheme=lightchallenge"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }

        startOAuthSession(
            url: url,
            provider: "strava",
            baseURL: baseURL,
            wallet: wallet
        )
    }

    // MARK: - Fitbit

    func connectFitbit(baseURL: String, wallet: String) {
        let urlString = "\(baseURL)/api/auth/fitbit?subject=\(wallet)&redirect_scheme=lightchallenge"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }

        startOAuthSession(
            url: url,
            provider: "fitbit",
            baseURL: baseURL,
            wallet: wallet
        )
    }

    // MARK: - Garmin

    /// Garmin Connect integration via Garmin Health API.
    /// Opens Garmin Connect app or web auth for data sync.
    func connectGarmin(baseURL: String, wallet: String) {
        let urlString = "\(baseURL)/api/auth/garmin?subject=\(wallet)&redirect_scheme=lightchallenge"
        guard let url = URL(string: urlString) else {
            error = "Invalid OAuth URL"
            return
        }

        startOAuthSession(
            url: url,
            provider: "garmin",
            baseURL: baseURL,
            wallet: wallet
        )
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

    // MARK: - ASWebAuthenticationSession

    func setPresentationContext(_ context: any ASWebAuthenticationPresentationContextProviding) {
        presentationContext = context
    }

    private func startOAuthSession(url: URL, provider: String, baseURL: String, wallet: String) {
        isAuthenticating = true
        error = nil

        let callbackScheme = "lightchallenge"

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
