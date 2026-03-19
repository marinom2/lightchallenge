// DesignTokens.swift
// LightChallenge iOS design system — clean + powerful.
// Deep electric blue accent, pure white backgrounds, neutral grays.

import SwiftUI

// MARK: - Design Tokens

enum LC {
    // ── Brand Colors (Single accent — deep electric blue) ────────
    static let accent = Color(hex: 0x2563EB)        // Primary blue
    static let accentDeep = Color(hex: 0x1D4ED8)     // Hover/pressed
    static let accentLight = Color(hex: 0xDBEAFE)    // Soft selection bg
    static let gold = Color(hex: 0x2563EB)           // Backward compat alias
    static let goldDeep = Color(hex: 0x1D4ED8)
    static let goldLight = Color(hex: 0xDBEAFE)
    static let violet = Color(hex: 0x64748B)         // Secondary neutral
    static let violetDeep = Color(hex: 0x475569)
    static let navy = Color(hex: 0x0F172A)           // Dark text / dark bg
    static let gradBlue = Color(hex: 0x3B82F6)       // Lighter blue accent
    static let gradLavender = Color(hex: 0x93C5FD)   // Soft blue wash

    // ── Semantic ─────────────────────────────────────────────────
    static let success = Color(hex: 0x22C55E)        // Green
    static let danger = Color(hex: 0xEF4444)          // Red
    static let warning = Color(hex: 0xEAB308)         // Yellow (no orange)
    static let info = Color(hex: 0x3B82F6)            // Blue

    // ── Surfaces (color-scheme adaptive) ─────────────────────────
    static func pageBg(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x0F172A) : .white
    }
    static func cardBg(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x1E293B) : .white
    }
    static func cardBgElevated(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x334155) : Color(hex: 0xF1F5F9)
    }
    static func cardBorder(_ s: ColorScheme) -> Color {
        s == .dark ? Color.white.opacity(0.08) : Color(hex: 0xE2E8F0)
    }
    static func cardBorderStrong(_ s: ColorScheme) -> Color {
        s == .dark ? Color.white.opacity(0.15) : Color(hex: 0xE2E8F0)
    }

    // ── Text Hierarchy ─────────────────────────────────────────────
    static func textPrimary(_ s: ColorScheme) -> Color {
        s == .dark ? Color(.label) : Color(hex: 0x0F172A)
    }
    static func textSecondary(_ s: ColorScheme) -> Color {
        s == .dark ? Color(.secondaryLabel) : Color(hex: 0x64748B)
    }
    static func textTertiary(_ s: ColorScheme) -> Color {
        s == .dark ? Color(.tertiaryLabel) : Color(hex: 0x94A3B8)
    }

    // ── Radii (concentric squircle rule) ────────────────────────
    static let radiusXS: CGFloat = 6
    static let radiusSM: CGFloat = 10
    static let radiusMD: CGFloat = 14
    static let radiusLG: CGFloat = 18
    static let radiusXL: CGFloat = 22
    static let radius2XL: CGFloat = 28
    static let radiusPill: CGFloat = 999

    // ── Spacing (base-4 grid) ────────────────────────────────────
    static let space2: CGFloat = 2
    static let space4: CGFloat = 4
    static let space6: CGFloat = 6
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space20: CGFloat = 20
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    static let space40: CGFloat = 40
    static let space48: CGFloat = 48

    // ── Animation ────────────────────────────────────────────────
    static let springResponse: Double = 0.35
    static let springDamping: Double = 0.86

    // ── Gradients ────────────────────────────────────────────────
    static let goldGradient = LinearGradient(
        colors: [accent, accentDeep],
        startPoint: .leading,
        endPoint: .trailing
    )
    static let fitnessGradient = LinearGradient(
        colors: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let brandGradient = LinearGradient(
        colors: [accent, Color(hex: 0x3B82F6)],
        startPoint: .leading,
        endPoint: .trailing
    )
    static let gamingGradient = LinearGradient(
        colors: [Color(hex: 0x475569), Color(hex: 0x64748B)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let socialGradient = LinearGradient(
        colors: [Color(hex: 0x3B82F6), Color(hex: 0x93C5FD)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // ── CTA Button Colors (adaptive) ──────────────────────────────
    static func ctaBg(_ s: ColorScheme) -> [Color] {
        [accent, accentDeep]
    }
    static func ctaBgDisabled(_ s: ColorScheme) -> [Color] {
        [accent.opacity(0.35), accentDeep.opacity(0.35)]
    }
    static func ctaFg(_ s: ColorScheme) -> Color {
        .white
    }
    static func ctaShadow(_ s: ColorScheme) -> Color {
        accent.opacity(0.20)
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Card Modifier (L1 Surface)

struct LCCard: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.cardBg(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 1)
            )
    }
}

// MARK: - Featured Card (Selected state — blue border)

struct LCFeaturedCard: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(LC.accentLight.opacity(scheme == .dark ? 0.1 : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.accent, lineWidth: 1.5)
            )
    }
}

// MARK: - Glass Modifier (Translucent Surface)

struct LCGlass: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusLG, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
            )
    }
}

// MARK: - Primary CTA Button Style

struct LCGoldButton: ButtonStyle {
    let isDisabled: Bool
    @Environment(\.colorScheme) private var scheme

    init(isDisabled: Bool = false) {
        self.isDisabled = isDisabled
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isDisabled ? .white.opacity(0.5) : .white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: isDisabled
                                ? [LC.accent.opacity(0.35)]
                                : [LC.accent, LC.gradBlue],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: LC.accent.opacity(configuration.isPressed ? 0 : 0.15), radius: 10, y: 5)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}

// MARK: - Secondary Button Style

struct LCSecondaryButton: ButtonStyle {
    @Environment(\.colorScheme) private var scheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(LC.textPrimary(scheme))
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(LC.cardBgElevated(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}

// MARK: - Status Badge

struct LCStatusBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Pill Tag

struct LCPill: View {
    let icon: String
    let text: String
    let color: Color
    var small: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: small ? 9 : 11))
            Text(text)
                .font(small ? .system(size: 10, weight: .medium) : .caption2.weight(.medium))
        }
        .foregroundStyle(color)
        .padding(.horizontal, small ? 6 : 8)
        .padding(.vertical, small ? 3 : 4)
        .background(color.opacity(0.08))
        .clipShape(Capsule())
    }
}

// MARK: - View Extensions

extension View {
    func lcCard() -> some View {
        modifier(LCCard())
    }

    func lcFeaturedCard() -> some View {
        modifier(LCFeaturedCard())
    }

    func lcGlass() -> some View {
        modifier(LCGlass())
    }

    /// Clean page background
    func lcPageBackground() -> some View {
        modifier(LCPageBackground())
    }
}

struct LCPageBackground: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(LC.pageBg(scheme).ignoresSafeArea())
    }
}

// MARK: - Ambient Glow Background (subtle)

struct LCAmbientGlow: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [LC.accent.opacity(scheme == .dark ? 0.04 : 0.02), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: 120, y: -60)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Shimmer Loading Effect

struct ShimmerView: View {
    @State private var phase: CGFloat = 0
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        scheme == .dark ? Color(hex: 0x1E293B) : Color(hex: 0xF1F5F9),
                        scheme == .dark ? Color(hex: 0x334155) : Color(hex: 0xE2E8F0),
                        scheme == .dark ? Color(hex: 0x1E293B) : Color(hex: 0xF1F5F9),
                    ],
                    startPoint: .init(x: phase - 1, y: 0.5),
                    endPoint: .init(x: phase, y: 0.5)
                )
            )
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = 2
                }
            }
    }
}

// MARK: - Remote Wallet Icon (loads from web3modal API with auth headers)

struct RemoteWalletIcon: View {
    let walletId: String
    let name: String
    let brandColor: Color
    let size: CGFloat

    @State private var image: UIImage?
    @State private var loaded = false
    @Environment(\.colorScheme) private var scheme

    init(walletId: String, name: String, brandColor: Color, size: CGFloat = 44) {
        self.walletId = walletId
        self.name = name
        self.brandColor = brandColor
        self.size = size
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                    .fill(brandColor.opacity(0.12))
                    .overlay(
                        Text(String(name.prefix(1)))
                            .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                            .foregroundStyle(brandColor)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                            .stroke(brandColor.opacity(0.15), lineWidth: 0.5)
                    )
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        .task {
            guard !loaded else { return }
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let url = URL(string: "https://api.web3modal.com/getWalletImage/\(walletId)") else { return }
        var request = URLRequest(url: url)
        request.setValue(LightChain.walletConnectProjectId, forHTTPHeaderField: "x-project-id")
        request.setValue("swift-v1.0.0", forHTTPHeaderField: "x-sdk-version")
        request.setValue("appKit", forHTTPHeaderField: "x-sdk-type")
        request.timeoutInterval = 8

        if let (data, response) = try? await URLSession.shared.data(for: request),
           let httpResponse = response as? HTTPURLResponse,
           httpResponse.statusCode == 200,
           let uiImage = UIImage(data: data) {
            await MainActor.run { image = uiImage }
        }
        loaded = true
    }
}

// MARK: - Known Wallet Definitions

enum KnownWallet {
    static let metaMask = (id: "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", name: "MetaMask", color: Color(hex: 0xF6851B))
    static let phantom = (id: "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", name: "Phantom", color: Color(hex: 0xAB9FF2))
    static let trust = (id: "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", name: "Trust", color: Color(hex: 0x3375BB))
    static let rainbow = (id: "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", name: "Rainbow", color: Color(hex: 0x174299))
}
