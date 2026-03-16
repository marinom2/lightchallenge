// ContentView.swift
// Legacy wrapper — redirects to MainTabView.
// Retained for preview support.

import SwiftUI

struct ContentView: View {
    var body: some View {
        MainTabView()
    }
}

// MARK: - Stat Card (shared component)

struct StatCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.bold())
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(.ultraThinMaterial))
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
        .environmentObject(HealthKitService())
        .environmentObject(WalletManager.shared)
        .environmentObject(OAuthService.shared)
        .environmentObject(NotificationService.shared)
}
