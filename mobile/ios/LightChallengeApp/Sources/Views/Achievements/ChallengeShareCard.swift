// ChallengeShareCard.swift
// Shareable result card for challenge wins/losses — social proof.
// Shows challenge title, result, earnings, avatar, and branding.

import SwiftUI
import UIKit

struct ChallengeShareSheet: View {
    let challengeId: String
    let title: String
    let passed: Bool
    let earnings: String?
    let reputation: Reputation

    @EnvironmentObject private var avatarService: AvatarService
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var shareImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: LC.space24) {
                resultPreview

                if shareImage != nil {
                    Button {
                        shareToSocial()
                    } label: {
                        Label("Share Result", systemImage: "square.and.arrow.up")
                            .font(.headline.weight(.semibold))
                    }
                    .buttonStyle(LCGoldButton())
                    .frame(maxWidth: .infinity)
                } else {
                    ProgressView("Generating card...")
                }

                Text("Share your result to social media, messages, or save to photos.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(LC.space24)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Share Result")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(LC.accent)
                }
            }
            .task { generateCard() }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Preview

    private var resultPreview: some View {
        VStack(spacing: LC.space16) {
            // Result badge
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: passed
                                ? [LC.accent, Color(hex: 0x3B82F6)]
                                : [LC.danger, LC.danger.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 80, height: 80)
                    .shadow(color: (passed ? LC.accent : LC.danger).opacity(0.4), radius: 12, y: 6)

                Image(systemName: passed ? "trophy.fill" : "xmark.circle.fill")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: LC.space4) {
                Text(passed ? "Challenge Won!" : "Challenge Complete")
                    .font(.title3.weight(.bold))

                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            // Avatar + stats
            HStack(spacing: LC.space16) {
                AvatarView(size: 44, walletAddress: appState.walletAddress)

                if passed, let earnings {
                    VStack {
                        Text(earnings)
                            .font(.headline.weight(.bold).monospacedDigit())
                            .foregroundStyle(LC.success)
                        Text("Earned")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Rectangle()
                    .fill(.separator)
                    .frame(width: 1, height: 30)

                VStack {
                    Text("Lvl \(reputation.level)")
                        .font(.headline.weight(.bold).monospacedDigit())
                        .foregroundStyle(LC.accent)
                    Text(reputation.levelName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Branding
            HStack(spacing: LC.space4) {
                Image(systemName: "bolt.shield.fill")
                    .font(.system(size: 10))
                Text("Verified on LightChallenge")
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(.tertiary)
        }
        .padding(LC.space24)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    // MARK: - Image Generation

    private func generateCard() {
        let size = CGSize(width: 600, height: 600)
        let renderer = UIGraphicsImageRenderer(size: size)

        shareImage = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)

            // Background
            UIColor.systemBackground.setFill()
            ctx.fill(rect)

            // Gradient band
            let colors = passed
                ? [UIColor(LC.accent).cgColor, UIColor(Color(hex: 0x3B82F6)).cgColor]
                : [UIColor(LC.danger).cgColor, UIColor(LC.danger.opacity(0.7)).cgColor]
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: colors as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: 180), options: [])

            // Result text
            let resultAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let resultStr = (passed ? "VICTORY" : "COMPLETE") as NSString
            let resultSize = resultStr.size(withAttributes: resultAttrs)
            resultStr.draw(at: CGPoint(x: (size.width - resultSize.width) / 2, y: 80), withAttributes: resultAttrs)

            // Title
            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 20, weight: .semibold),
                .foregroundColor: UIColor.label,
            ]
            let titleStr = title as NSString
            let titleSize = titleStr.size(withAttributes: titleAttrs)
            titleStr.draw(at: CGPoint(x: (size.width - titleSize.width) / 2, y: 240), withAttributes: titleAttrs)

            // Earnings
            if passed, let earnings {
                let earnAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedDigitSystemFont(ofSize: 32, weight: .bold),
                    .foregroundColor: UIColor(LC.success),
                ]
                let earnStr = earnings as NSString
                let earnSize = earnStr.size(withAttributes: earnAttrs)
                earnStr.draw(at: CGPoint(x: (size.width - earnSize.width) / 2, y: 290), withAttributes: earnAttrs)
            }

            // Avatar
            if let avatar = avatarService.avatarImage {
                let avatarRect = CGRect(x: (size.width - 60) / 2, y: 370, width: 60, height: 60)
                ctx.cgContext.saveGState()
                ctx.cgContext.addEllipse(in: avatarRect)
                ctx.cgContext.clip()
                avatar.draw(in: avatarRect)
                ctx.cgContext.restoreGState()
            }

            // Branding
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .bold),
                .foregroundColor: UIColor.tertiaryLabel,
            ]
            let brandStr = "LightChallenge • Stake. Prove. Earn." as NSString
            let brandSize = brandStr.size(withAttributes: brandAttrs)
            brandStr.draw(at: CGPoint(x: (size.width - brandSize.width) / 2, y: size.height - 50), withAttributes: brandAttrs)
        }
    }

    // MARK: - Share

    private func shareToSocial() {
        guard let image = shareImage else { return }

        let verb = passed ? "won" : "completed"
        let earningsText = (passed && earnings != nil) ? " Earned \(earnings!)." : ""
        let text = "I \(verb) \"\(title)\" on LightChallenge!\(earningsText) #LightChallenge"
        let items: [Any] = [text, image]

        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)

        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = windowScene.windows.first?.rootViewController {
            controller.popoverPresentationController?.sourceView = root.view
            controller.popoverPresentationController?.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
            root.present(controller, animated: true)
        }
    }
}
