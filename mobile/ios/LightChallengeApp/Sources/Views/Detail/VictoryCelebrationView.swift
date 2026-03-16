// VictoryCelebrationView.swift
// Animated victory screen — confetti, earnings display, share CTA.
// Presented when a challenge verdict comes back as pass.

import SwiftUI

struct VictoryCelebrationView: View {
    let challengeId: String
    let title: String
    let earnings: String?         // e.g. "0.05 LCAI"
    let achievementType: String?  // e.g. "victory"

    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var avatarService: AvatarService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var showBadge = false
    @State private var showText = false
    @State private var showEarnings = false
    @State private var showActions = false
    @State private var confettiPhase = false
    @State private var shareImage: UIImage?

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(hex: 0x0F172A),
                    Color(hex: 0x1E293B),
                    Color(hex: 0x0F172A),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // Confetti particles
            confettiLayer

            VStack(spacing: LC.space32) {
                Spacer()

                // Trophy badge with pulsing glow
                ZStack {
                    // Glow rings
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [LC.accent.opacity(0.2), .clear],
                                center: .center,
                                startRadius: 30,
                                endRadius: 120
                            )
                        )
                        .frame(width: 240, height: 240)
                        .scaleEffect(confettiPhase ? 1.2 : 0.8)
                        .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: confettiPhase)

                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [LC.accent, Color(hex: 0x3B82F6)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 120, height: 120)
                        .shadow(color: LC.accent.opacity(0.5), radius: 24, y: 8)
                        .scaleEffect(showBadge ? 1 : 0.3)
                        .opacity(showBadge ? 1 : 0)

                    Image(systemName: "trophy.fill")
                        .font(.system(size: 56, weight: .bold))
                        .foregroundStyle(.white)
                        .scaleEffect(showBadge ? 1 : 0.3)
                        .opacity(showBadge ? 1 : 0)
                }

                // Victory text
                VStack(spacing: LC.space12) {
                    Text("Victory!")
                        .font(.system(size: 36, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .scaleEffect(showText ? 1 : 0.5)
                        .opacity(showText ? 1 : 0)

                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .opacity(showText ? 1 : 0)
                }

                // Earnings card
                if let earnings, !earnings.isEmpty {
                    VStack(spacing: LC.space8) {
                        Text("You Earned")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.white.opacity(0.6))

                        Text(earnings)
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundStyle(LC.accent)

                        Text("Claimable from Treasury")
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    .padding(LC.space24)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                            .fill(.white.opacity(0.08))
                            .overlay(
                                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                                    .stroke(LC.accent.opacity(0.3), lineWidth: 1)
                            )
                    )
                    .scaleEffect(showEarnings ? 1 : 0.8)
                    .opacity(showEarnings ? 1 : 0)
                }

                // Achievement NFT badge (if minted)
                if let achievementType {
                    HStack(spacing: LC.space8) {
                        Image(systemName: "sparkles")
                            .foregroundStyle(LC.accent)
                        Text("Soulbound NFT: \(achievementType.capitalized)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(.horizontal, LC.space16)
                    .padding(.vertical, LC.space8)
                    .background(Capsule().fill(.white.opacity(0.06)))
                    .opacity(showEarnings ? 1 : 0)
                }

                Spacer()

                // Action buttons
                VStack(spacing: LC.space12) {
                    Button {
                        shareResult()
                    } label: {
                        Label("Share Victory", systemImage: "square.and.arrow.up")
                            .font(.headline.weight(.semibold))
                    }
                    .buttonStyle(LCGoldButton())

                    HStack(spacing: LC.space16) {
                        Button {
                            dismiss()
                        } label: {
                            Text("Claim Reward")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(LC.accent)
                        }

                        Button {
                            dismiss()
                        } label: {
                            Text("Done")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    }
                }
                .padding(.horizontal, LC.space24)
                .padding(.bottom, LC.space48)
                .opacity(showActions ? 1 : 0)
                .offset(y: showActions ? 0 : 30)
            }
            .padding(.horizontal, LC.space16)
        }
        .onAppear { runEntryAnimation() }
    }

    // MARK: - Confetti

    private var confettiLayer: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let time = timeline.date.timeIntervalSinceReferenceDate
                let colors: [Color] = [LC.accent, LC.warning, LC.success, LC.gradBlue, .white]

                for i in 0..<(confettiPhase ? 40 : 0) {
                    let seed = Double(i) * 1.37
                    let x = (sin(seed * 3.7 + time * 0.8) * 0.5 + 0.5) * size.width
                    let speed = 40 + sin(seed * 2.1) * 20
                    let y = ((time * speed + seed * 100).truncatingRemainder(dividingBy: size.height + 40)) - 20
                    let rotation = Angle.degrees(time * (50 + seed * 30))
                    let colorIndex = i % colors.count
                    let particleSize = CGSize(width: 6 + sin(seed) * 3, height: 10 + cos(seed) * 4)

                    var rect = Path(CGRect(origin: .zero, size: particleSize))
                    rect = rect.applying(.init(rotationAngle: rotation.radians))
                    rect = rect.applying(.init(translationX: x, y: y))

                    context.fill(rect, with: .color(colors[colorIndex].opacity(0.7)))
                }
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Animation

    private func runEntryAnimation() {
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.1)) {
            showBadge = true
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.4)) {
            showText = true
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.7)) {
            showEarnings = true
        }
        withAnimation(.easeOut(duration: 0.5).delay(1.0)) {
            showActions = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            confettiPhase = true
        }
    }

    // MARK: - Share

    private func shareResult() {
        let size = CGSize(width: 600, height: 600)
        let renderer = UIGraphicsImageRenderer(size: size)

        let image = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)

            // Dark background
            UIColor(Color(hex: 0x0F172A)).setFill()
            ctx.fill(rect)

            // Blue gradient band
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [UIColor(LC.accent).cgColor, UIColor(Color(hex: 0x3B82F6)).cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: 200), options: [])

            // Trophy area
            let trophyAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let trophyStr = "VICTORY" as NSString
            let trophySize = trophyStr.size(withAttributes: trophyAttrs)
            trophyStr.draw(at: CGPoint(x: (size.width - trophySize.width) / 2, y: 80), withAttributes: trophyAttrs)

            // Title
            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 22, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let titleStr = title as NSString
            let titleSize = titleStr.size(withAttributes: titleAttrs)
            titleStr.draw(at: CGPoint(x: (size.width - titleSize.width) / 2, y: 240), withAttributes: titleAttrs)

            // Earnings
            if let earnings {
                let earnAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedDigitSystemFont(ofSize: 36, weight: .bold),
                    .foregroundColor: UIColor(LC.accent),
                ]
                let earnStr = earnings as NSString
                let earnSize = earnStr.size(withAttributes: earnAttrs)
                earnStr.draw(at: CGPoint(x: (size.width - earnSize.width) / 2, y: 300), withAttributes: earnAttrs)
            }

            // Avatar
            if let avatar = avatarService.avatarImage {
                let avatarRect = CGRect(x: (size.width - 60) / 2, y: 380, width: 60, height: 60)
                ctx.cgContext.saveGState()
                ctx.cgContext.addEllipse(in: avatarRect)
                ctx.cgContext.clip()
                avatar.draw(in: avatarRect)
                ctx.cgContext.restoreGState()
            }

            // Branding
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .bold),
                .foregroundColor: UIColor(white: 1, alpha: 0.4),
            ]
            let brandStr = "LightChallenge • Stake. Prove. Earn." as NSString
            let brandSize = brandStr.size(withAttributes: brandAttrs)
            brandStr.draw(at: CGPoint(x: (size.width - brandSize.width) / 2, y: size.height - 50), withAttributes: brandAttrs)
        }

        let text = "I won \"\(title)\" on LightChallenge!\(earnings.map { " Earned \($0)." } ?? "")"
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
