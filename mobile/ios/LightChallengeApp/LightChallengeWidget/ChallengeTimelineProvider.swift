// ChallengeTimelineProvider.swift
// Reads active challenge data from the shared app group UserDefaults
// and builds timeline entries for the widget.

import WidgetKit
import Foundation

// MARK: - Shared Data Model (read by widget, written by main app)

struct WidgetChallengeData: Codable {
    let challengeId: String
    let title: String
    let phase: String           // "In Progress", "Proof Window", "Ended"
    let phaseEndTimestamp: Double // Unix timestamp for the next phase transition
    let stakeDisplay: String?
    let updatedAt: Double        // When the main app last wrote this data
}

// MARK: - Timeline Entry

struct ChallengeEntry: TimelineEntry {
    let date: Date
    let challenge: WidgetChallengeData?
    let isEmpty: Bool

    static let placeholder = ChallengeEntry(
        date: .now,
        challenge: WidgetChallengeData(
            challengeId: "0",
            title: "10K Steps Daily",
            phase: "In Progress",
            phaseEndTimestamp: Date().addingTimeInterval(86400).timeIntervalSince1970,
            stakeDisplay: "0.50 LCAI",
            updatedAt: Date().timeIntervalSince1970
        ),
        isEmpty: false
    )

    static let empty = ChallengeEntry(date: .now, challenge: nil, isEmpty: true)
}

// MARK: - App Group Keys

enum WidgetDataKeys {
    static let suiteName = "group.io.lightchallenge.app"
    static let activeChallengeKey = "widget_active_challenge"
}

// MARK: - Timeline Provider

struct ChallengeTimelineProvider: TimelineProvider {
    typealias Entry = ChallengeEntry

    func placeholder(in context: Context) -> ChallengeEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (ChallengeEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ChallengeEntry>) -> Void) {
        let entry = currentEntry()

        // Schedule next refresh:
        // - If there's an active challenge, refresh every 15 minutes or at phase transition
        // - If empty, refresh every 30 minutes
        let refreshDate: Date
        if let challenge = entry.challenge {
            let phaseEnd = Date(timeIntervalSince1970: challenge.phaseEndTimestamp)
            let fifteenMin = Date().addingTimeInterval(15 * 60)
            // Refresh at whichever comes first: phase end or 15 minutes
            refreshDate = min(phaseEnd, fifteenMin)
        } else {
            refreshDate = Date().addingTimeInterval(30 * 60)
        }

        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }

    // MARK: - Read from App Group

    private func currentEntry() -> ChallengeEntry {
        guard let defaults = UserDefaults(suiteName: WidgetDataKeys.suiteName),
              let data = defaults.data(forKey: WidgetDataKeys.activeChallengeKey) else {
            return .empty
        }

        do {
            let decoder = JSONDecoder()
            let challenge = try decoder.decode(WidgetChallengeData.self, from: data)

            // Stale data check: if updated more than 2 hours ago, treat as empty
            let staleCutoff = Date().addingTimeInterval(-2 * 3600)
            if Date(timeIntervalSince1970: challenge.updatedAt) < staleCutoff {
                return .empty
            }

            return ChallengeEntry(date: .now, challenge: challenge, isEmpty: false)
        } catch {
            return .empty
        }
    }
}
