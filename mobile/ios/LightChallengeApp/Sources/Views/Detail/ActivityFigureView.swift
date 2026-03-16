// ActivityFigureView.swift
// Animated activity figure using Lottie with SF Symbol fallback.
// Phase 1: Lottie JSON stick-figure animations
// Phase 2: Upgrade to RealityKit + USDZ for flagship types

import SwiftUI
import Lottie

/// Displays an animated activity figure matching the challenge type.
/// Uses bundled Lottie animations with SF Symbol fallback.
struct ActivityFigureView: View {
    let theme: ActivityTheme
    let isActive: Bool

    /// Map activity labels to their Lottie JSON filenames (without .json).
    private var animationName: String {
        switch theme.label {
        case "Walking":  return "activity_walking"
        case "Running":  return "activity_running"
        case "Cycling":  return "activity_cycling"
        case "Swimming": return "activity_swimming"
        case "Strength": return "activity_strength"
        case "Hiking":   return "activity_hiking"
        case "Yoga":     return "activity_yoga"
        default:         return "activity_walking"
        }
    }

    var body: some View {
        ZStack {
            // Subtle glow behind figure (Apple Fitness style)
            lottieOrFallback
                .opacity(0.25)
                .blur(radius: 16)

            // Main figure
            lottieOrFallback
        }
        .frame(width: 120, height: 120)
    }

    @ViewBuilder
    private var lottieOrFallback: some View {
        if let _ = Bundle.main.url(forResource: animationName, withExtension: "json") {
            LottieView(animation: .named(animationName))
                .playbackMode(.playing(.toProgress(1, loopMode: .loop)))
                .animationSpeed(isActive ? 1.0 : 0.5)
        } else {
            // SF Symbol fallback
            Image(systemName: theme.icon)
                .font(.system(size: 64, weight: .light))
                .foregroundStyle(theme.figureTint)
        }
    }
}
