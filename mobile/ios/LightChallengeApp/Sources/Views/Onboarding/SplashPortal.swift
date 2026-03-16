// SplashPortal.swift
// Branded entry portal — shows every app launch with animated logo.
// Auto-dismisses after the animation completes, or tap to skip.

import SwiftUI

struct SplashPortal: View {
    let onDismiss: () -> Void

    @State private var logoScale: CGFloat = 0.4
    @State private var logoOpacity: Double = 0
    @State private var glowActive = false
    @State private var titleOpacity: Double = 0
    @State private var dismissed = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            // Clean white/dark background
            Color(.systemBackground).ignoresSafeArea()

            // Subtle accent glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [LC.accent.opacity(glowActive ? 0.08 : 0.02), .clear],
                        center: .center,
                        startRadius: 30,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .scaleEffect(glowActive ? 1.3 : 0.8)
                .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: glowActive)

            VStack(spacing: 24) {
                Spacer()

                // Logo
                Image("AppLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 140, height: 140)
                    .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                    .shadow(color: .black.opacity(0.15), radius: 24, y: 12)
                    .shadow(color: LC.accent.opacity(glowActive ? 0.15 : 0.0), radius: 30, y: 0)
                    .scaleEffect(logoScale)
                    .opacity(logoOpacity)

                // Title
                VStack(spacing: 8) {
                    Text("LightChallenge")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("Stake. Prove. Earn.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(LC.accent)
                }
                .opacity(titleOpacity)

                Spacer()
                Spacer()
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            guard !dismissed else { return }
            dismissed = true
            onDismiss()
        }
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.6)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }

            withAnimation(.easeOut(duration: 0.5).delay(0.4)) {
                titleOpacity = 1.0
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                glowActive = true
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                guard !dismissed else { return }
                dismissed = true
                onDismiss()
            }
        }
    }
}
