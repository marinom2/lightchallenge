// ActivitySourceNudgeSheet.swift
// Compact half-sheet shown after joining a challenge when no activity source is connected.
// Guides the user to enable Apple Health so progress is tracked automatically.

import SwiftUI

struct ActivitySourceNudgeSheet: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var isConnecting = false

    var body: some View {
        NavigationStack {
            VStack(spacing: LC.space24) {
                Spacer()

                // Icon
                Image(systemName: "heart.text.clipboard.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(LC.accent)
                    .padding(.bottom, LC.space4)

                // Title + subtitle
                VStack(spacing: LC.space8) {
                    Text("Track Your Progress")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("Connect an activity source so your\nprogress is tracked automatically.")
                        .font(.subheadline)
                        .foregroundStyle(LC.textSecondary(scheme))
                        .multilineTextAlignment(.center)
                }

                // Apple Health card
                appleHealthCard

                // Hint about other sources
                Text("More sources available in Profile → Activity Sources")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
                    .multilineTextAlignment(.center)

                Spacer()

                // Actions
                VStack(spacing: LC.space12) {
                    Button {
                        Task { await connectAppleHealth() }
                    } label: {
                        if isConnecting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Connect Apple Health")
                        }
                    }
                    .buttonStyle(LCGoldButton())
                    .disabled(isConnecting)

                    Button {
                        dismiss()
                    } label: {
                        Text("Not now")
                            .font(.subheadline)
                            .foregroundStyle(LC.textTertiary(scheme))
                            .frame(height: 44)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, LC.space24)
            .padding(.bottom, LC.space16)
            .background(LC.pageBg(scheme))
        }
    }

    // MARK: - Apple Health Card

    private var appleHealthCard: some View {
        HStack(spacing: LC.space12) {
            Image(systemName: "heart.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(LC.danger)
                .frame(width: 44, height: 44)
                .background(LC.danger.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))

            VStack(alignment: .leading, spacing: LC.space2) {
                HStack(spacing: LC.space6) {
                    Text("Apple Health")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("Recommended")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(LC.accent)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(LC.accent.opacity(0.1))
                        .clipShape(Capsule())
                }

                Text("Steps, distance, workouts, and more")
                    .font(.caption)
                    .foregroundStyle(LC.textTertiary(scheme))
            }

            Spacer()

            if healthService.isAuthorized || appState.healthEnabled {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(LC.success)
            }
        }
        .padding(LC.space12)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .fill(LC.cardBg(scheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                .stroke(LC.accent.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Connect

    private func connectAppleHealth() async {
        isConnecting = true
        await healthService.requestAuthorization()
        appState.healthEnabled = healthService.isAuthorized
        isConnecting = false

        if healthService.isAuthorized {
            try? await Task.sleep(for: .milliseconds(400))
            dismiss()
        }
    }
}
