// LightChallengeWidget.swift
// Widget extension entry point — active challenge countdown.
// Supports small and medium widget families.

import WidgetKit
import SwiftUI

@main
struct LightChallengeWidget: WidgetBundle {
    var body: some Widget {
        ChallengeCountdownWidget()
    }
}

struct ChallengeCountdownWidget: Widget {
    let kind: String = "ChallengeCountdown"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ChallengeTimelineProvider()) { entry in
            ChallengeWidgetView(entry: entry)
        }
        .configurationDisplayName("Challenge Countdown")
        .description("Track your most urgent active challenge.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
