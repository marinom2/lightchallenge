// AchievementShareCard.swift
// Generates a branded achievement image for social sharing.
// Rendered with UIGraphicsImageRenderer, shared via UIActivityViewController.

import SwiftUI
import UIKit

// MARK: - Share Sheet (SwiftUI wrapper)

struct AchievementShareSheet: View {
    let achievement: Achievement
    let reputation: Reputation

    @EnvironmentObject private var avatarService: AvatarService
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var shareImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: LC.space24) {
                // Preview card
                achievementPreview

                if shareImage != nil {
                    Button {
                        shareToSocial()
                    } label: {
                        Label("Share Achievement", systemImage: "square.and.arrow.up")
                            .font(.headline.weight(.semibold))
                    }
                    .buttonStyle(LCGoldButton())
                    .frame(maxWidth: .infinity)
                } else {
                    ProgressView("Generating card...")
                }

                Text("Share your achievement to social media, messages, or save to photos.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(LC.space24)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Share")
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

    private var achievementPreview: some View {
        let type = achievement.type
        let colors = type.color

        return VStack(spacing: LC.space16) {
            // Badge
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [colors.0, colors.1],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 80, height: 80)
                    .shadow(color: colors.0.opacity(0.4), radius: 12, y: 6)

                Image(systemName: type.icon)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: LC.space4) {
                Text(type.label)
                    .font(.title3.weight(.bold))

                if let cid = achievement.challengeId {
                    Text("Challenge #\(cid)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Avatar + stats row
            HStack(spacing: LC.space16) {
                AvatarView(size: 44, walletAddress: appState.walletAddress)

                VStack {
                    Text("+\(type.points)")
                        .font(.headline.weight(.bold).monospacedDigit())
                        .foregroundStyle(colors.0)
                    Text("Points")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
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

            if let date = achievement.mintDate {
                Text(date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            // Branding
            HStack(spacing: LC.space4) {
                Image(systemName: "bolt.shield.fill")
                    .font(.system(size: 10))
                Text("LightChallenge")
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
        let type = achievement.type
        let size = CGSize(width: 600, height: 600)
        let renderer = UIGraphicsImageRenderer(size: size)

        shareImage = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)

            // Background
            UIColor.systemBackground.setFill()
            ctx.fill(rect)

            // Gradient top band
            let gradientColors = type.color
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [UIColor(gradientColors.0).cgColor, UIColor(gradientColors.1).cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(
                gradient,
                start: CGPoint(x: 0, y: 0),
                end: CGPoint(x: size.width, y: 180),
                options: []
            )

            // Badge icon area (white circle)
            let badgeCenter = CGPoint(x: size.width / 2, y: 160)
            ctx.cgContext.setFillColor(UIColor.white.cgColor)
            ctx.cgContext.fillEllipse(in: CGRect(x: badgeCenter.x - 50, y: badgeCenter.y - 50, width: 100, height: 100))

            // Achievement type text
            let typeAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28, weight: .bold),
                .foregroundColor: UIColor.label,
            ]
            let typeStr = type.label as NSString
            let typeSize = typeStr.size(withAttributes: typeAttrs)
            typeStr.draw(
                at: CGPoint(x: (size.width - typeSize.width) / 2, y: 240),
                withAttributes: typeAttrs
            )

            // Points
            let ptsAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 20, weight: .bold),
                .foregroundColor: UIColor(gradientColors.0),
            ]
            let ptsStr = "+\(type.points) pts" as NSString
            let ptsSize = ptsStr.size(withAttributes: ptsAttrs)
            ptsStr.draw(
                at: CGPoint(x: (size.width - ptsSize.width) / 2, y: 280),
                withAttributes: ptsAttrs
            )

            // Challenge ID
            if let cid = achievement.challengeId {
                let cidAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 14, weight: .medium),
                    .foregroundColor: UIColor.secondaryLabel,
                ]
                let cidStr = "Challenge #\(cid)" as NSString
                let cidSize = cidStr.size(withAttributes: cidAttrs)
                cidStr.draw(
                    at: CGPoint(x: (size.width - cidSize.width) / 2, y: 320),
                    withAttributes: cidAttrs
                )
            }

            // Avatar circle (if available)
            if let avatar = avatarService.avatarImage {
                let avatarSize: CGFloat = 60
                let avatarRect = CGRect(
                    x: (size.width - avatarSize) / 2,
                    y: 350,
                    width: avatarSize,
                    height: avatarSize
                )
                // Clip to circle
                ctx.cgContext.saveGState()
                ctx.cgContext.addEllipse(in: avatarRect)
                ctx.cgContext.clip()
                avatar.draw(in: avatarRect)
                ctx.cgContext.restoreGState()

                // Border
                ctx.cgContext.setStrokeColor(UIColor(LC.accent).withAlphaComponent(0.3).cgColor)
                ctx.cgContext.setLineWidth(2)
                ctx.cgContext.strokeEllipse(in: avatarRect)
            }

            // Level info
            let lvlAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16, weight: .semibold),
                .foregroundColor: UIColor.secondaryLabel,
            ]
            let lvlStr = "Level \(reputation.level) \(reputation.levelName) • \(reputation.points) pts" as NSString
            let lvlSize = lvlStr.size(withAttributes: lvlAttrs)
            let lvlY: CGFloat = avatarService.avatarImage != nil ? 425 : 380
            lvlStr.draw(
                at: CGPoint(x: (size.width - lvlSize.width) / 2, y: lvlY),
                withAttributes: lvlAttrs
            )

            // Date
            if let date = achievement.mintDate {
                let dateAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 12, weight: .regular),
                    .foregroundColor: UIColor.tertiaryLabel,
                ]
                let dateStr = date.formatted(date: .abbreviated, time: .omitted) as NSString
                let dateSize = dateStr.size(withAttributes: dateAttrs)
                dateStr.draw(
                    at: CGPoint(x: (size.width - dateSize.width) / 2, y: 420),
                    withAttributes: dateAttrs
                )
            }

            // Branding
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .bold),
                .foregroundColor: UIColor.tertiaryLabel,
            ]
            let brandStr = "LightChallenge • Stake. Prove. Earn." as NSString
            let brandSize = brandStr.size(withAttributes: brandAttrs)
            brandStr.draw(
                at: CGPoint(x: (size.width - brandSize.width) / 2, y: size.height - 60),
                withAttributes: brandAttrs
            )

            // URL
            let urlAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 11, weight: .regular),
                .foregroundColor: UIColor.quaternaryLabel,
            ]
            let urlStr = "lightchallenge.app" as NSString
            let urlSize = urlStr.size(withAttributes: urlAttrs)
            urlStr.draw(
                at: CGPoint(x: (size.width - urlSize.width) / 2, y: size.height - 35),
                withAttributes: urlAttrs
            )
        }
    }

    // MARK: - Share

    private func shareToSocial() {
        guard let image = shareImage else { return }

        let text = "I earned a \(achievement.type.label) badge on LightChallenge! (+\(achievement.type.points) pts)"
        let items: [Any] = [text, image]

        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)

        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = windowScene.windows.first?.rootViewController {
            // iPad support
            controller.popoverPresentationController?.sourceView = root.view
            controller.popoverPresentationController?.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
            root.present(controller, animated: true)
        }
    }
}
