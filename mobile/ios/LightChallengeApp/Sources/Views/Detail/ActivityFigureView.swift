// ActivityFigureView.swift
// Apple Fitness-grade progress ring with centered SF Symbol.

import SwiftUI

// MARK: - Ring State

enum RingState {
    case empty          // Not started — empty track only
    case progress(Double) // Active — partial fill 0…1
    case complete       // Done — full ring + glow
}

// MARK: - ChallengeProgressRing

/// Circular progress ring with a centered SF Symbol.
/// Apple Fitness-grade: strong contrast, tight icon-to-ring relationship.
struct ChallengeProgressRing: View {
    let state: RingState
    let symbol: String
    let color: Color
    var diameter: CGFloat = 180
    var lineWidth: CGFloat = 20

    @State private var animatedProgress: Double = 0
    @State private var appeared = false

    // Icon fills ~42% of diameter — tight, "held" by the ring
    private var iconSize: CGFloat { diameter * 0.42 }
    // Strong track: 22% opacity for clear contrast vs progress stroke
    private var trackColor: Color { color.opacity(0.22) }

    private var targetProgress: Double {
        switch state {
        case .empty: return 0
        case .progress(let p): return min(1.0, max(0, p))
        case .complete: return 1.0
        }
    }

    var body: some View {
        ZStack {
            // Track (background ring) — always visible
            Circle()
                .stroke(trackColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            // Progress arc — only when > 0
            if animatedProgress > 0.005 {
                Circle()
                    .trim(from: 0, to: animatedProgress)
                    .stroke(
                        color,
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: color.opacity(0.3), radius: 6, y: 2)
            }

            // Completion glow
            if case .complete = state, appeared {
                Circle()
                    .stroke(color.opacity(0.15), style: StrokeStyle(lineWidth: lineWidth + 8, lineCap: .round))
                    .blur(radius: 4)

                // Checkmark overlay (small, top-right of ring)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: diameter * 0.14, weight: .bold))
                    .foregroundStyle(.white, color)
                    .offset(x: diameter * 0.32, y: -diameter * 0.32)
            }

            // SF Symbol — centered, tight
            VStack(spacing: 2) {
                Image(systemName: symbol)
                    .font(.system(size: iconSize * (showPercentage ? 0.75 : 1.0), weight: .medium))
                    .foregroundStyle(color.opacity(animatedProgress > 0 || isComplete ? 1.0 : 0.6))
                    .symbolRenderingMode(.hierarchical)

                // Percentage label — only when there's real progress
                if showPercentage {
                    Text("\(Int(animatedProgress * 100))%")
                        .font(.system(size: diameter * 0.11, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(color)
                }
            }
        }
        .frame(width: diameter, height: diameter)
        .onAppear {
            appeared = true
            withAnimation(.easeInOut(duration: 0.9).delay(0.1)) {
                animatedProgress = targetProgress
            }
        }
        .onChange(of: targetProgress) { _, newValue in
            withAnimation(.easeInOut(duration: 0.6)) {
                animatedProgress = newValue
            }
        }
    }

    private var isComplete: Bool {
        if case .complete = state { return true }
        return false
    }

    /// Show percentage text when there's real progress (not empty, not complete).
    private var showPercentage: Bool {
        if case .progress(let p) = state, p > 0 { return true }
        return false
    }
}

// MARK: - ActivityFigureView (backward compat)

/// Wraps ChallengeProgressRing for use in contexts without progress data.
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
