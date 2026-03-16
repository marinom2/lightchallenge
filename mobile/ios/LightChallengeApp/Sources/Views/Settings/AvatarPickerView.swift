// AvatarPickerView.swift
// Avatar picker — thematic presets + Memoji sticker capture.
// Memoji stickers are captured via the emoji keyboard and composited
// onto a user-chosen background color, like iOS Contacts avatars.

import SwiftUI
import UIKit

// MARK: - Avatar Preset

struct AvatarPreset: Identifiable, Equatable {
    let id: String
    let icon: String
    let colors: [Color]
    let label: String

    static func == (lhs: AvatarPreset, rhs: AvatarPreset) -> Bool { lhs.id == rhs.id }
}

enum AvatarPresets {
    static let all: [AvatarPreset] = [
        // Fitness
        AvatarPreset(id: "runner",     icon: "figure.run",              colors: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)], label: "Runner"),
        AvatarPreset(id: "cyclist",    icon: "figure.outdoor.cycle",    colors: [Color(hex: 0x1D4ED8), Color(hex: 0x2563EB)], label: "Cyclist"),
        AvatarPreset(id: "swimmer",    icon: "figure.pool.swim",        colors: [Color(hex: 0x3B82F6), Color(hex: 0x93C5FD)], label: "Swimmer"),
        AvatarPreset(id: "hiker",      icon: "figure.hiking",           colors: [Color(hex: 0x22C55E), Color(hex: 0x2563EB)], label: "Hiker"),

        // Competition
        AvatarPreset(id: "champion",   icon: "trophy.fill",             colors: [Color(hex: 0xF59E0B), Color(hex: 0x2563EB)], label: "Champion"),
        AvatarPreset(id: "flame",      icon: "flame.fill",              colors: [Color(hex: 0xEF4444), Color(hex: 0xF59E0B)], label: "On Fire"),
        AvatarPreset(id: "bolt",       icon: "bolt.fill",               colors: [Color(hex: 0xF59E0B), Color(hex: 0x3B82F6)], label: "Lightning"),
        AvatarPreset(id: "crown",      icon: "crown.fill",              colors: [Color(hex: 0x475569), Color(hex: 0xF59E0B)], label: "Royalty"),

        // Shield / Identity
        AvatarPreset(id: "shield",     icon: "shield.checkered",        colors: [Color(hex: 0x0F172A), Color(hex: 0x2563EB)], label: "Guardian"),
        AvatarPreset(id: "star",       icon: "star.fill",               colors: [Color(hex: 0x3B82F6), Color(hex: 0xDBEAFE)], label: "Star"),
        AvatarPreset(id: "diamond",    icon: "diamond.fill",            colors: [Color(hex: 0x64748B), Color(hex: 0x1D4ED8)], label: "Diamond"),
        AvatarPreset(id: "hexagon",    icon: "hexagon.fill",            colors: [Color(hex: 0x2563EB), Color(hex: 0x0F172A)], label: "Node"),

        // Abstract
        AvatarPreset(id: "atom",       icon: "atom",                    colors: [Color(hex: 0x3B82F6), Color(hex: 0x64748B)], label: "Atom"),
        AvatarPreset(id: "sparkle",    icon: "sparkles",                colors: [Color(hex: 0x93C5FD), Color(hex: 0x2563EB)], label: "Sparkle"),
        AvatarPreset(id: "globe",      icon: "globe.americas.fill",     colors: [Color(hex: 0x1D4ED8), Color(hex: 0x22C55E)], label: "Explorer"),
        AvatarPreset(id: "mountain",   icon: "mountain.2.fill",         colors: [Color(hex: 0x475569), Color(hex: 0x94A3B8)], label: "Summit"),
    ]
}

// MARK: - Memoji Background Options

private let memojiBackgrounds: [(Color, Color)] = [
    (Color(hex: 0x93C5FD), Color(hex: 0xBFDBFE)),  // Sky blue (like iOS default)
    (Color(hex: 0xDBEAFE), Color(hex: 0xEFF6FF)),  // Ice blue
    (Color(hex: 0x86EFAC), Color(hex: 0xBBF7D0)),  // Mint
    (Color(hex: 0xFDE68A), Color(hex: 0xFEF3C7)),  // Amber
    (Color(hex: 0xFCA5A5), Color(hex: 0xFEE2E2)),  // Rose
    (Color(hex: 0xC4B5FD), Color(hex: 0xDDD6FE)),  // Lavender
    (Color(hex: 0x2563EB), Color(hex: 0x3B82F6)),  // Deep blue
    (Color(hex: 0x0F172A), Color(hex: 0x1E293B)),  // Navy dark
]

// MARK: - Avatar Picker View

struct AvatarPickerView: View {
    @EnvironmentObject private var avatarService: AvatarService
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var selected: AvatarPreset?
    @State private var activeTab = 0
    @State private var memojiSticker: UIImage?
    @State private var selectedBg = 0

    private let columns = [
        GridItem(.flexible()), GridItem(.flexible()),
        GridItem(.flexible()), GridItem(.flexible()),
    ]

    private var hasSelection: Bool {
        selected != nil || memojiSticker != nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LC.space24) {
                    previewSection

                    // Tab picker
                    Picker("", selection: $activeTab) {
                        Text("Presets").tag(0)
                        Text("Memoji").tag(1)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: activeTab) { _, newTab in
                        if newTab == 0 { memojiSticker = nil }
                        else { selected = nil }
                    }

                    if activeTab == 0 {
                        avatarGrid
                    } else {
                        memojiSection
                    }

                    // Remove option
                    if avatarService.hasAvatar && !hasSelection {
                        Button(role: .destructive) {
                            avatarService.clear(
                                wallet: appState.walletAddress,
                                serverURL: appState.serverURL
                            )
                        } label: {
                            Text("Remove Avatar")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(LC.danger)
                        }
                    }
                }
                .padding(.horizontal, LC.space16)
                .padding(.top, LC.space16)
                .padding(.bottom, LC.space32)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Choose Avatar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if hasSelection {
                        Button("Save") {
                            saveAvatar()
                            dismiss()
                        }
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(LC.accent)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Preview

    private var previewSection: some View {
        VStack(spacing: LC.space12) {
            if let preset = selected {
                renderedPreview(preset, size: 120)
            } else if let sticker = memojiSticker {
                memojiPreviewCircle(sticker, size: 120)
            } else {
                AvatarView(size: 120, walletAddress: appState.walletAddress)
            }

            Text(selected?.label ?? (memojiSticker != nil ? "Memoji" : "Current"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LC.textPrimary(scheme))
        }
    }

    private func memojiPreviewCircle(_ sticker: UIImage, size: CGFloat) -> some View {
        let bg = memojiBackgrounds[selectedBg]
        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [bg.0, bg.1],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(uiImage: sticker)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .padding(size * 0.08)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: bg.0.opacity(0.3), radius: 8, y: 4)
    }

    // MARK: - Presets Grid

    private var avatarGrid: some View {
        LazyVGrid(columns: columns, spacing: LC.space12) {
            ForEach(AvatarPresets.all) { preset in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selected = preset
                    }
                } label: {
                    VStack(spacing: LC.space6) {
                        renderedPreview(preset, size: 64)
                            .overlay(
                                Circle()
                                    .stroke(LC.accent, lineWidth: selected == preset ? 3 : 0)
                                    .padding(-2)
                            )

                        Text(preset.label)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(
                                selected == preset ? LC.accent : LC.textSecondary(scheme)
                            )
                            .lineLimit(1)
                    }
                    .padding(.vertical, LC.space8)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Memoji Section

    private var memojiSection: some View {
        VStack(spacing: LC.space20) {
            // Capture card
            VStack(spacing: LC.space12) {
                if memojiSticker == nil {
                    Image(systemName: "face.smiling")
                        .font(.system(size: 36))
                        .foregroundStyle(LC.textTertiary(scheme))
                        .padding(.top, LC.space8)

                    Text("Tap below to open the keyboard, then\nswitch to Emoji and select a Memoji sticker")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                        .multilineTextAlignment(.center)
                } else {
                    Text("Tap below to choose a different sticker")
                        .font(.caption)
                        .foregroundStyle(LC.textSecondary(scheme))
                }

                MemojiCaptureView { image in
                    withAnimation(.spring(response: 0.3)) {
                        memojiSticker = image
                        selected = nil
                    }
                }
                .frame(height: 56)
                .background(
                    RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                        .fill(Color(.tertiarySystemGroupedBackground))
                )
                .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))
            }
            .padding(LC.space16)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 1)
            )

            // Background color picker
            if memojiSticker != nil {
                VStack(spacing: LC.space12) {
                    Text("Background")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LC.textSecondary(scheme))

                    HStack(spacing: LC.space12) {
                        ForEach(Array(memojiBackgrounds.enumerated()), id: \.offset) { index, bg in
                            Button {
                                withAnimation(.spring(response: 0.3)) {
                                    selectedBg = index
                                }
                            } label: {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [bg.0, bg.1],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 36, height: 36)
                                    .overlay(
                                        Circle()
                                            .stroke(selectedBg == index ? LC.accent : .clear, lineWidth: 2.5)
                                            .padding(-3)
                                    )
                                    .shadow(color: bg.0.opacity(0.2), radius: 4, y: 2)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Rendered Preset

    private func renderedPreview(_ preset: AvatarPreset, size: CGFloat) -> some View {
        ZStack {
            LinearGradient(
                colors: preset.colors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Image(systemName: preset.icon)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: preset.colors.first?.opacity(0.3) ?? .clear, radius: 8, y: 4)
    }

    // MARK: - Save

    private func saveAvatar() {
        let image: UIImage
        if let preset = selected {
            image = renderPresetImage(preset, size: 512)
        } else if let sticker = memojiSticker {
            let bg = memojiBackgrounds[selectedBg]
            image = renderMemojiImage(sticker, bg: bg, size: 512)
        } else {
            return
        }

        avatarService.save(
            image,
            wallet: appState.walletAddress,
            serverURL: appState.serverURL
        )
    }

    private func renderPresetImage(_ preset: AvatarPreset, size: CGFloat) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
        return renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: CGSize(width: size, height: size))
            let path = UIBezierPath(ovalIn: rect)
            path.addClip()

            let c1 = UIColor(preset.colors[0])
            let c2 = UIColor(preset.colors.count > 1 ? preset.colors[1] : preset.colors[0])
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [c1.cgColor, c2.cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(
                gradient,
                start: .zero,
                end: CGPoint(x: size, y: size),
                options: []
            )

            let config = UIImage.SymbolConfiguration(
                pointSize: size * 0.38,
                weight: .bold
            )
            if let symbol = UIImage(systemName: preset.icon, withConfiguration: config) {
                let symbolSize = symbol.size
                let origin = CGPoint(
                    x: (size - symbolSize.width) / 2,
                    y: (size - symbolSize.height) / 2
                )
                let tinted = symbol.withTintColor(.white, renderingMode: .alwaysOriginal)
                tinted.draw(at: origin)
            }
        }
    }

    private func renderMemojiImage(_ sticker: UIImage, bg: (Color, Color), size: CGFloat) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
        return renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: CGSize(width: size, height: size))

            // Circular clip
            let path = UIBezierPath(ovalIn: rect)
            path.addClip()

            // Gradient background
            let c1 = UIColor(bg.0)
            let c2 = UIColor(bg.1)
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [c1.cgColor, c2.cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(
                gradient,
                start: .zero,
                end: CGPoint(x: size, y: size),
                options: []
            )

            // Draw Memoji sticker centered with padding
            let padding = size * 0.06
            let stickerRect = CGRect(
                x: padding,
                y: padding,
                width: size - padding * 2,
                height: size - padding * 2
            )
            sticker.draw(in: stickerRect)
        }
    }
}

// MARK: - Memoji Capture View (UIViewRepresentable)
// Captures Memoji sticker images from the emoji keyboard.
// iOS 18+: stickers are NSAdaptiveImageGlyph (not NSTextAttachment).
// Older iOS: stickers are NSTextAttachment.

struct MemojiCaptureView: UIViewRepresentable {
    let onCapture: (UIImage) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = .systemFont(ofSize: 40)
        textView.textAlignment = .center
        textView.backgroundColor = .clear
        textView.allowsEditingTextAttributes = true
        textView.textContainerInset = UIEdgeInsets(top: 6, left: 8, bottom: 6, right: 8)
        textView.isScrollEnabled = false

        // iOS 18+: Enable adaptive image glyph support for Memoji stickers
        if #available(iOS 18.0, *) {
            textView.supportsAdaptiveImageGlyph = true
        }

        // Placeholder
        setPlaceholder(textView)

        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {}

    private func setPlaceholder(_ textView: UITextView) {
        textView.attributedText = NSAttributedString(
            string: "Tap here, then pick a sticker",
            attributes: [
                .font: UIFont.systemFont(ofSize: 15, weight: .medium),
                .foregroundColor: UIColor.tertiaryLabel,
            ]
        )
    }

    class Coordinator: NSObject, UITextViewDelegate {
        let onCapture: (UIImage) -> Void

        init(onCapture: @escaping (UIImage) -> Void) {
            self.onCapture = onCapture
        }

        // Clear placeholder on focus
        func textViewDidBeginEditing(_ textView: UITextView) {
            if textView.textColor == .tertiaryLabel {
                textView.text = ""
                textView.textColor = .label
            }
        }

        func textViewDidChange(_ textView: UITextView) {
            let attrText = textView.attributedText ?? NSAttributedString()
            guard attrText.length > 0 else { return }

            var capturedImage: UIImage?

            // Method 1: NSAdaptiveImageGlyph (iOS 18+ Memoji stickers)
            if #available(iOS 18.0, *) {
                attrText.enumerateAttribute(
                    .adaptiveImageGlyph,
                    in: NSRange(location: 0, length: attrText.length)
                ) { value, _, stop in
                    if let glyph = value as? NSAdaptiveImageGlyph {
                        if let image = UIImage(data: glyph.imageContent) {
                            capturedImage = image
                            stop.pointee = true
                        }
                    }
                }
            }

            // Method 2: NSTextAttachment (older iOS / fallback)
            if capturedImage == nil {
                attrText.enumerateAttribute(
                    .attachment,
                    in: NSRange(location: 0, length: attrText.length)
                ) { value, _, stop in
                    guard let attachment = value as? NSTextAttachment else { return }

                    if let img = attachment.image {
                        capturedImage = img
                        stop.pointee = true
                    } else if let data = attachment.contents ?? attachment.fileWrapper?.regularFileContents,
                              let img = UIImage(data: data) {
                        capturedImage = img
                        stop.pointee = true
                    }
                }
            }

            // Method 3: Snapshot fallback — if the text view has rich content
            // we couldn't extract via methods 1-2, render it to an image.
            if capturedImage == nil {
                var hasRichContent = false
                attrText.enumerateAttributes(
                    in: NSRange(location: 0, length: attrText.length)
                ) { attrs, _, stop in
                    if attrs.keys.contains(.attachment) { hasRichContent = true; stop.pointee = true }
                    if #available(iOS 18.0, *) {
                        if attrs.keys.contains(.adaptiveImageGlyph) { hasRichContent = true; stop.pointee = true }
                    }
                }

                if hasRichContent {
                    capturedImage = snapshotTextView(textView)
                }
            }

            // Method 4: Plain emoji character → render to image
            if capturedImage == nil {
                let text = textView.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty, text.count <= 2,
                   text.unicodeScalars.allSatisfy({ $0.properties.isEmojiPresentation || $0.properties.isEmoji }) {
                    capturedImage = renderEmojiToImage(text, size: 512)
                }
            }

            // Deliver capture and clean up
            if let image = capturedImage {
                onCapture(image)
                DispatchQueue.main.async {
                    textView.text = ""
                    textView.attributedText = NSAttributedString(string: "")
                    textView.resignFirstResponder()
                }
            }
        }

        // Restore placeholder on unfocus if empty
        func textViewDidEndEditing(_ textView: UITextView) {
            if textView.text.isEmpty || textView.text == nil {
                textView.attributedText = NSAttributedString(
                    string: "Tap here, then pick a sticker",
                    attributes: [
                        .font: UIFont.systemFont(ofSize: 15, weight: .medium),
                        .foregroundColor: UIColor.tertiaryLabel,
                    ]
                )
            }
        }

        // Snapshot the text view's visible content as a UIImage
        private func snapshotTextView(_ textView: UITextView) -> UIImage? {
            let contentSize = textView.sizeThatFits(
                CGSize(width: textView.bounds.width, height: .greatestFiniteMagnitude)
            )
            guard contentSize.width > 4, contentSize.height > 4 else { return nil }

            // Render at a square size for avatar use
            let side = max(contentSize.width, contentSize.height)
            let renderSize = CGSize(width: side, height: side)
            let renderer = UIGraphicsImageRenderer(size: renderSize)
            return renderer.image { _ in
                let offsetX = (side - contentSize.width) / 2
                let offsetY = (side - contentSize.height) / 2
                let drawRect = CGRect(
                    origin: CGPoint(x: offsetX, y: offsetY),
                    size: contentSize
                )
                textView.drawHierarchy(in: drawRect, afterScreenUpdates: true)
            }
        }

        // Render a text emoji character to a UIImage
        private func renderEmojiToImage(_ emoji: String, size: CGFloat) -> UIImage? {
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
            return renderer.image { _ in
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: size * 0.75),
                ]
                let str = emoji as NSString
                let textSize = str.size(withAttributes: attrs)
                let origin = CGPoint(
                    x: (size - textSize.width) / 2,
                    y: (size - textSize.height) / 2
                )
                str.draw(at: origin, withAttributes: attrs)
            }
        }
    }
}
