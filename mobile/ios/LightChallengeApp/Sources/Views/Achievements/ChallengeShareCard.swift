// ChallengeShareCard.swift
// Shareable result card for challenge wins/losses — social proof.
// Shows challenge title, result, key stats, activity, timeline, and branding.

import SwiftUI
import UIKit

struct ChallengeShareSheet: View {
    let challengeId: String
    let title: String
    let passed: Bool
    let earnings: String?
    let reputation: Reputation
    let detail: ChallengeDetail?
    let participantStatus: ParticipantStatus?
    let progress: ChallengeProgress?
    let tokenPrice: Double?

    @EnvironmentObject private var avatarService: AvatarService
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var healthService: HealthKitService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var shareImage: UIImage?
    @State private var currentValue: Double = 0
    @State private var goalValue: Double = 0

    private var theme: ActivityTheme? {
        guard let d = detail else { return nil }
        return ActivityTheme.from(detail: d)
    }

    private var progressFraction: Double {
        guard goalValue > 0 else { return passed ? 1.0 : 0.6 }
        return min(1.0, currentValue / goalValue)
    }

    private var accentColors: [Color] {
        passed
            ? [LC.accent.opacity(0.75), Color(hex: 0x3B82F6).opacity(0.72)]
            : [Color(hex: 0x6B7280).opacity(0.75), Color(hex: 0x9CA3AF).opacity(0.72)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LC.space20) {
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
                .padding(LC.space20)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Challenge Result")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(LC.accent)
                }
            }
            .task {
                await loadProgress()
                generateCard()
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Preview

    private var resultPreview: some View {
        VStack(spacing: 0) {
            // Header gradient banner
            ZStack {
                LinearGradient(
                    colors: accentColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                VStack(spacing: LC.space8) {
                    if let t = theme {
                        ChallengeProgressRing(
                            state: passed ? .completed : .failed(progressFraction),
                            symbol: t.icon,
                            color: passed ? LC.accent : .secondary,
                            diameter: 64,
                            lineWidth: 5
                        )
                    } else {
                        Image(systemName: passed ? "trophy.fill" : "flag.checkered")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                    }

                    Text(passed ? "Challenge completed" : "Challenge failed")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)

                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .padding(.horizontal, LC.space16)
                }
                .padding(.vertical, LC.space20)
            }
            .frame(maxWidth: .infinity)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: LC.radiusLG, topTrailingRadius: LC.radiusLG))

            // Body content
            VStack(spacing: LC.space16) {
                // Activity type + duration row
                if let t = theme {
                    HStack(spacing: LC.space8) {
                        Image(systemName: t.icon)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(t.figureTint)
                        Text(t.label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(t.figureTint)

                        if let duration = challengeDuration {
                            Text("·")
                                .foregroundStyle(.tertiary)
                            Text(duration)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, LC.space12)
                    .padding(.vertical, LC.space6)
                    .background(
                        Capsule().fill(t.figureTint.opacity(0.1))
                    )
                }

                // Key stats grid
                statsGrid

                // Avatar + level row
                HStack(spacing: LC.space12) {
                    AvatarView(size: 36, walletAddress: appState.walletAddress)

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Lvl \(reputation.level) · \(reputation.levelName)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(LC.textPrimary(scheme))
                        Text(appState.walletAddress.prefix(6) + "..." + appState.walletAddress.suffix(4))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()
                }

                // Branding
                HStack(spacing: LC.space4) {
                    Image(systemName: "bolt.shield.fill")
                        .font(.system(size: 9))
                    Text("Verified on LightChallenge")
                        .font(.caption2.weight(.semibold))
                }
                .foregroundStyle(.tertiary)
            }
            .padding(LC.space16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: LC.radiusLG, bottomTrailingRadius: LC.radiusLG))
        }
        .shadow(color: .black.opacity(0.08), radius: 16, y: 8)
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        let items = buildStatItems()
        return LazyVGrid(columns: [
            GridItem(.flexible(), spacing: LC.space8),
            GridItem(.flexible(), spacing: LC.space8),
            GridItem(.flexible(), spacing: LC.space8)
        ], spacing: LC.space8) {
            ForEach(items, id: \.label) { item in
                VStack(spacing: LC.space4) {
                    Image(systemName: item.icon)
                        .font(.system(size: 14))
                        .foregroundStyle(item.color)
                    Text(item.value)
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(LC.textPrimary(scheme))
                    Text(item.label)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, LC.space8)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(item.color.opacity(0.06))
                )
            }
        }
    }

    private struct StatItem {
        let icon: String
        let value: String
        let label: String
        let color: Color
    }

    private func buildStatItems() -> [StatItem] {
        var items: [StatItem] = []

        // Prize pool or earnings
        if passed, let e = earnings {
            items.append(StatItem(icon: "trophy.fill", value: e, label: "Earned", color: LC.success))
        } else if let pool = detail?.poolDisplayUSD(tokenPrice: tokenPrice) {
            items.append(StatItem(icon: "banknote.fill", value: pool, label: "Prize Pool", color: LC.accent))
        } else if let pool = detail?.poolDisplay {
            items.append(StatItem(icon: "banknote.fill", value: pool, label: "Prize Pool", color: LC.accent))
        }

        // Participants
        if let count = progress?.participantCount ?? detail?.participantsCount, count > 0 {
            items.append(StatItem(icon: "person.2.fill", value: "\(count)", label: "Participants", color: Color(hex: 0x8B5CF6)))
        }

        // Pass rate
        if let total = progress?.participantCount, total > 0, let passCount = progress?.passCount {
            let rate = Int(Double(passCount) / Double(total) * 100)
            items.append(StatItem(icon: "chart.bar.fill", value: "\(rate)%", label: "Pass Rate", color: Color(hex: 0x06B6D4)))
        }

        // Progress: current / target
        if let rules = detail?.rules, rules.goalValue > 0 {
            let fmtCurrent = currentValue >= 1000
                ? String(format: "%.0f", currentValue)
                : String(format: "%.1f", currentValue)
            let fmtGoal = rules.goalValue >= 1000
                ? String(format: "%.0f", rules.goalValue)
                : String(format: "%.1f", rules.goalValue)
            let pct = Int((currentValue / rules.goalValue) * 100)
            items.append(StatItem(icon: "target", value: "\(fmtCurrent) / \(fmtGoal) \(rules.metricLabel)", label: "\(pct)%", color: theme?.figureTint ?? LC.accent))
        }

        // Ensure we have at least 3 items for a nice grid
        if items.count < 3 {
            items.append(StatItem(
                icon: passed ? "checkmark.seal.fill" : "xmark.circle.fill",
                value: passed ? "Passed" : "Failed",
                label: "Result",
                color: passed ? LC.success : LC.danger
            ))
        }

        return Array(items.prefix(3))
    }

    // MARK: - Duration

    private var challengeDuration: String? {
        guard let start = detail?.startDate, let end = detail?.endsDate else { return nil }
        let days = Int(end.timeIntervalSince(start) / 86400)
        if days >= 7 { return "\(days / 7) week\(days / 7 > 1 ? "s" : "")" }
        if days > 0 { return "\(days) day\(days > 1 ? "s" : "")" }
        let hours = Int(end.timeIntervalSince(start) / 3600)
        if hours > 0 { return "\(hours) hour\(hours > 1 ? "s" : "")" }
        return nil
    }

    // MARK: - Progress

    private func loadProgress() async {
        guard let d = detail, let rules = d.rules, rules.goalValue > 0 else { return }
        goalValue = rules.goalValue

        // HealthKit value
        let start = d.startDate ?? Date.distantPast
        let challengeEnd = d.endsDate ?? Date()
        let end = challengeEnd < Date() ? challengeEnd : Date()
        await healthService.ensureAuthorization()
        let hkValue = await healthService.queryMetricTotal(rules.metric ?? "steps", from: start, to: end)

        // Server value
        var serverValue: Double = 0
        if appState.hasWallet {
            if let sp = try? await APIClient.shared.fetchMyProgress(
                baseURL: appState.serverURL,
                challengeId: challengeId,
                subject: appState.walletAddress
            ) {
                serverValue = sp.currentValue ?? 0
                if let sg = sp.goalValue, sg > 0 { goalValue = sg }
            }
        }

        currentValue = max(hkValue, serverValue)
    }

    // MARK: - Image Generation

    private func generateCard() {
        let size = CGSize(width: 600, height: 700)
        let renderer = UIGraphicsImageRenderer(size: size)

        shareImage = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)

            // Background
            UIColor.systemBackground.setFill()
            ctx.fill(rect)

            // Gradient banner (top 220px) — softened ~15%
            let gradColors = passed
                ? [UIColor(LC.accent).withAlphaComponent(0.75).cgColor, UIColor(Color(hex: 0x3B82F6)).withAlphaComponent(0.72).cgColor]
                : [UIColor(Color(hex: 0x6B7280)).withAlphaComponent(0.75).cgColor, UIColor(Color(hex: 0x9CA3AF)).withAlphaComponent(0.72).cgColor]
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: gradColors as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: 220), options: [])

            // Result icon (trophy or flag)
            let iconStr = (passed ? "\u{1F3C6}" : "\u{1F3C1}") as NSString
            let iconAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 48),
            ]
            let iconSize = iconStr.size(withAttributes: iconAttrs)
            iconStr.draw(at: CGPoint(x: (size.width - iconSize.width) / 2, y: 40), withAttributes: iconAttrs)

            // Result text
            let resultAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let resultStr = (passed ? "Challenge completed" : "Challenge failed") as NSString
            let resultSize = resultStr.size(withAttributes: resultAttrs)
            resultStr.draw(at: CGPoint(x: (size.width - resultSize.width) / 2, y: 105), withAttributes: resultAttrs)

            // Title
            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 18, weight: .semibold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.9),
            ]
            let titleStr = title as NSString
            let titleSize = titleStr.size(withAttributes: titleAttrs)
            titleStr.draw(at: CGPoint(x: (size.width - titleSize.width) / 2, y: 145), withAttributes: titleAttrs)

            // Activity type pill
            if let t = theme {
                let pillStr = t.label as NSString
                let pillAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 14, weight: .semibold),
                    .foregroundColor: UIColor.secondaryLabel,
                ]
                let pillSize = pillStr.size(withAttributes: pillAttrs)
                pillStr.draw(at: CGPoint(x: (size.width - pillSize.width) / 2, y: 240), withAttributes: pillAttrs)
            }

            // Stats section (y: 280)
            let stats = buildStatItems()
            let statWidth: CGFloat = 170
            let statSpacing: CGFloat = (size.width - statWidth * CGFloat(stats.count)) / CGFloat(stats.count + 1)
            for (i, stat) in stats.enumerated() {
                let x = statSpacing + CGFloat(i) * (statWidth + statSpacing)
                let y: CGFloat = 290

                // Stat box background
                let boxRect = CGRect(x: x, y: y, width: statWidth, height: 80)
                let boxPath = UIBezierPath(roundedRect: boxRect, cornerRadius: 10)
                UIColor.secondarySystemGroupedBackground.setFill()
                boxPath.fill()

                // Value
                let valueAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedDigitSystemFont(ofSize: 20, weight: .bold),
                    .foregroundColor: UIColor.label,
                ]
                let valueStr = stat.value as NSString
                let valueSize = valueStr.size(withAttributes: valueAttrs)
                valueStr.draw(at: CGPoint(x: x + (statWidth - valueSize.width) / 2, y: y + 14), withAttributes: valueAttrs)

                // Label
                let labelAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 12, weight: .medium),
                    .foregroundColor: UIColor.secondaryLabel,
                ]
                let labelStr = stat.label as NSString
                let labelSize = labelStr.size(withAttributes: labelAttrs)
                labelStr.draw(at: CGPoint(x: x + (statWidth - labelSize.width) / 2, y: y + 48), withAttributes: labelAttrs)
            }

            // Earnings highlight (for winners)
            if passed, let earnings {
                let earnAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedDigitSystemFont(ofSize: 28, weight: .bold),
                    .foregroundColor: UIColor(LC.success),
                ]
                let earnStr = earnings as NSString
                let earnSize = earnStr.size(withAttributes: earnAttrs)
                earnStr.draw(at: CGPoint(x: (size.width - earnSize.width) / 2, y: 410), withAttributes: earnAttrs)

                let earnLabel = "Total Earned" as NSString
                let earnLabelAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 13, weight: .medium),
                    .foregroundColor: UIColor.secondaryLabel,
                ]
                let earnLabelSize = earnLabel.size(withAttributes: earnLabelAttrs)
                earnLabel.draw(at: CGPoint(x: (size.width - earnLabelSize.width) / 2, y: 445), withAttributes: earnLabelAttrs)
            }

            // Avatar
            let avatarY: CGFloat = passed && earnings != nil ? 500 : 420
            if let avatar = avatarService.avatarImage {
                let avatarRect = CGRect(x: (size.width - 56) / 2, y: avatarY, width: 56, height: 56)
                ctx.cgContext.saveGState()
                ctx.cgContext.addEllipse(in: avatarRect)
                ctx.cgContext.clip()
                avatar.draw(in: avatarRect)
                ctx.cgContext.restoreGState()
            }

            // Level
            let levelStr = "Lvl \(reputation.level) · \(reputation.levelName)" as NSString
            let levelAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 13, weight: .semibold),
                .foregroundColor: UIColor(LC.accent),
            ]
            let levelSize = levelStr.size(withAttributes: levelAttrs)
            levelStr.draw(at: CGPoint(x: (size.width - levelSize.width) / 2, y: avatarY + 64), withAttributes: levelAttrs)

            // Branding
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 13, weight: .bold),
                .foregroundColor: UIColor.tertiaryLabel,
            ]
            let brandStr = "LightChallenge · Stake. Prove. Earn." as NSString
            let brandSize = brandStr.size(withAttributes: brandAttrs)
            brandStr.draw(at: CGPoint(x: (size.width - brandSize.width) / 2, y: size.height - 40), withAttributes: brandAttrs)
        }
    }

    // MARK: - Share

    private func shareToSocial() {
        guard let image = shareImage else { return }

        let verb = passed ? "completed" : "finished"
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
