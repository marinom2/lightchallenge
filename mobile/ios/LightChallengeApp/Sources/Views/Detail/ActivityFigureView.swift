// ActivityFigureView.swift
// Unified progress ring — single continuous lifecycle: tracking → verifying → completed.

import SwiftUI

// MARK: - Ring State

enum RingState: Equatable {
    case empty                   // Not started — empty track only
    case tracking(Double)        // Active — partial fill 0…1
    case verifying(Double)       // Goal reached / proof submitted — soft pulse on arc
    case completed               // Verification passed — full ring + center checkmark
    case failed(Double)          // Verification failed — dimmed ring at final progress

    // Backward compat aliases
    static func progress(_ p: Double) -> RingState { .tracking(p) }
    static var complete: RingState { .completed }
}

// MARK: - ChallengeProgressRing

struct ChallengeProgressRing: View {
    let state: RingState
    let symbol: String
    let color: Color
    var diameter: CGFloat = 180
    var lineWidth: CGFloat = 20

    @State private var animatedProgress: Double = 0
    @State private var appeared = false

    // Verifying animation
    @State private var verifyPulse = false

    // Completed animation sequence
    @State private var completionGlow = false
    @State private var showCheckmark = false
    @State private var glowStabilized = false

    private var iconSize: CGFloat { diameter * 0.42 }
    private var trackColor: Color { color.opacity(0.10) }

    private var targetProgress: Double {
        switch state {
        case .empty: return 0
        case .tracking(let p): return min(1.0, max(0, p))
        case .verifying(let p): return min(1.0, max(0, p))
        case .completed: return 1.0
        case .failed(let p): return min(1.0, max(0, p))
        }
    }

    private var isVerifying: Bool {
        if case .verifying = state { return true }
        return false
    }

    private var isCompleted: Bool {
        if case .completed = state { return true }
        return false
    }

    private var isFailed: Bool {
        if case .failed = state { return true }
        return false
    }

    private var effectiveColor: Color {
        if isFailed { return .secondary.opacity(0.65) }
        return color
    }

    var body: some View {
        ZStack {
            // Track (background ring) — always visible
            Circle()
                .stroke(
                    trackColor,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )

            // Progress arc
            if animatedProgress > 0.005 {
                Circle()
                    .trim(from: 0, to: animatedProgress)
                    .stroke(
                        effectiveColor,
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: effectiveColor.opacity(0.15), radius: 3, y: 1)
                    // Verifying: gentle opacity breathing
                    .opacity(isVerifying ? (verifyPulse ? 1.0 : 0.82) : 1.0)
            }

            // Verifying glow — very soft outer halo
            if isVerifying, appeared {
                Circle()
                    .stroke(
                        effectiveColor.opacity(verifyPulse ? 0.1 : 0.03),
                        style: StrokeStyle(lineWidth: lineWidth + 4, lineCap: .round)
                    )
                    .blur(radius: 2)
            }

            // Completed glow — brief soft flash then fade
            if isCompleted, appeared {
                Circle()
                    .stroke(
                        effectiveColor.opacity(completionGlow && !glowStabilized ? 0.15 : 0.05),
                        style: StrokeStyle(lineWidth: lineWidth + 4, lineCap: .round)
                    )
                    .blur(radius: 3)
            }

            // Center content
            ZStack {
                // SF Symbol — shows during tracking/verifying, fades for completed
                if !showCheckmark {
                    Image(systemName: symbol)
                        .font(.system(size: iconSize, weight: .medium))
                        .foregroundStyle(effectiveColor.opacity(animatedProgress > 0 || isCompleted ? 1.0 : 0.65))
                        .symbolRenderingMode(.hierarchical)
                        .scaleEffect(isVerifying && verifyPulse ? 1.03 : 1.0)
                        .transition(.opacity)
                }

                // Checkmark — appears on completed
                if showCheckmark {
                    Image(systemName: "checkmark")
                        .font(.system(size: iconSize * 0.8, weight: .bold, design: .rounded))
                        .foregroundStyle(effectiveColor)
                        .transition(.scale(scale: 0.3).combined(with: .opacity))
                }
            }
        }
        .frame(width: diameter, height: diameter)
        .onAppear {
            appeared = true
            withAnimation(.easeInOut(duration: 0.9).delay(0.1)) {
                animatedProgress = targetProgress
            }
            startStateAnimations()
        }
        .onChange(of: state) { _, newState in
            transitionTo(newState)
        }
        .onChange(of: targetProgress) { _, newValue in
            withAnimation(.easeInOut(duration: 0.6)) {
                animatedProgress = newValue
            }
        }
    }

    // MARK: - State Animations

    private func startStateAnimations() {
        if isVerifying {
            startVerifyingPulse()
        }
        if isCompleted {
            runCompletionSequence()
        }
    }

    private func transitionTo(_ newState: RingState) {
        switch newState {
        case .empty:
            stopAllAnimations()
            withAnimation(.easeInOut(duration: 0.4)) {
                animatedProgress = 0
            }

        case .tracking(let p):
            stopAllAnimations()
            withAnimation(.easeInOut(duration: 0.6)) {
                animatedProgress = min(1.0, max(0, p))
            }

        case .verifying(let p):
            showCheckmark = false
            completionGlow = false
            glowStabilized = false
            withAnimation(.easeInOut(duration: 0.6)) {
                animatedProgress = min(1.0, max(0, p))
            }
            startVerifyingPulse()

        case .completed:
            verifyPulse = false
            runCompletionSequence()

        case .failed(let p):
            stopAllAnimations()
            withAnimation(.easeInOut(duration: 0.6)) {
                animatedProgress = min(1.0, max(0, p))
            }
        }
    }

    private func startVerifyingPulse() {
        withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
            verifyPulse = true
        }
    }

    private func runCompletionSequence() {
        // 1. Animate ring to full
        withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
            animatedProgress = 1.0
        }

        // 2. Brief glow pulse
        withAnimation(.easeInOut(duration: 0.4).delay(0.3)) {
            completionGlow = true
        }

        // 3. Checkmark appears (fade + scale)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7).delay(0.5)) {
            showCheckmark = true
        }

        // 4. Stabilize glow (no more motion)
        withAnimation(.easeOut(duration: 0.6).delay(1.0)) {
            glowStabilized = true
        }

        // 5. Subtle haptic
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func stopAllAnimations() {
        verifyPulse = false
        completionGlow = false
        showCheckmark = false
        glowStabilized = false
    }

}

// MARK: - ActivityFigureView (backward compat)

struct ActivityFigureView: View {
    let theme: ActivityTheme
    let isActive: Bool

    var body: some View {
        ChallengeProgressRing(
            state: .empty,
            symbol: theme.icon,
            color: theme.figureTint,
            diameter: 180
        )
    }
}
