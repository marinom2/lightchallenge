// GamingHandoffView.swift
// Desktop handoff UX for gaming challenges and join flows.

import SwiftUI

struct GamingHandoffView: View {
    let challengeId: String
    let title: String
    let game: String?

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    private var desktopURL: String {
        "\(appState.serverURL)/challenge/\(challengeId)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Icon
                ZStack {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 120, height: 120)

                    Image(systemName: game != nil ? "gamecontroller.fill" : "desktopcomputer")
                        .font(.system(size: 44))
                        .foregroundStyle(LC.violet)
                }

                // Title
                VStack(spacing: 8) {
                    Text("Continue on Desktop")
                        .font(.title2.weight(.bold))

                    if let game {
                        Text("\(game) challenges require your gaming account to be linked on desktop.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    } else {
                        Text("This action requires the full desktop experience.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)

                // Steps
                VStack(alignment: .leading, spacing: 16) {
                    stepRow(number: 1, text: "Open the link below on your computer")
                    stepRow(number: 2, text: game != nil ? "Connect your \(game!) account" : "Connect your wallet")
                    stepRow(number: 3, text: game != nil ? "Join and submit your match history" : "Complete the action on desktop")
                }
                .padding(.horizontal, 32)

                Spacer()

                // Actions
                VStack(spacing: 12) {
                    // Copy link
                    Button {
                        UIPasteboard.general.string = desktopURL
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                    } label: {
                        Label(
                            copied ? "Copied!" : "Copy Link",
                            systemImage: copied ? "checkmark" : "doc.on.doc"
                        )
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(LC.violet)

                    // Share
                    ShareLink(item: desktopURL) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)

                    // URL display
                    Text(desktopURL)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func stepRow(number: Int, text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(LC.violet)
                .clipShape(Circle())

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
