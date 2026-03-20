// VerificationView.swift
// Lightweight blockchain verification layer — trust without noise.
// 3-layer model: clean default → verification sheet → explorer link.

import SwiftUI

// MARK: - Verification Step (event-based, future-ready for tx mapping)

struct VerificationStep: Identifiable {
    let id: String
    let label: String
    let isCompleted: Bool
    let txHash: String?
    let timestamp: Date?

    /// Maps timeline events to human-readable verification steps.
    static func from(timeline: [TimelineEvent], userAddress: String?) -> [VerificationStep] {
        // Relevant event names → user-facing labels
        let mapping: [(name: String, label: String)] = [
            ("ChallengeCreated", "Challenge created"),
            ("Joined", "Participants joined"),
            ("ProofSubmitted", "Proof submitted"),
            ("Finalized", "Result finalized"),
            ("WinnerClaimed", "Rewards processed"),
            ("LoserClaimed", "Stakes returned"),
            ("RefundClaimed", "Refunds processed"),
        ]

        var steps: [VerificationStep] = []
        var seen = Set<String>()

        for (eventName, label) in mapping {
            // Find matching events — collapse duplicates (e.g. multiple Joined events → one step)
            let matches = timeline.filter { $0.name == eventName }
            guard !matches.isEmpty else { continue }
            guard !seen.contains(eventName) else { continue }
            seen.insert(eventName)

            // Use the latest matching event for tx/timestamp
            let latest = matches.max(by: { ($0.timestamp ?? 0) < ($1.timestamp ?? 0) }) ?? matches[0]

            steps.append(VerificationStep(
                id: eventName,
                label: label,
                isCompleted: true,
                txHash: latest.tx,
                timestamp: latest.date
            ))
        }

        return steps
    }

    /// The most relevant transaction hash for explorer linking.
    static func primaryTxHash(from steps: [VerificationStep]) -> String? {
        // Prefer finalization tx, then proof, then creation
        let priority = ["Finalized", "WinnerClaimed", "LoserClaimed", "ProofSubmitted", "ChallengeCreated"]
        for name in priority {
            if let step = steps.first(where: { $0.id == name }), let tx = step.txHash, !tx.isEmpty {
                return tx
            }
        }
        return steps.first(where: { $0.txHash != nil })?.txHash
    }
}

// MARK: - Verification Badge (inline, subtle)

/// Minimal trust indicator for the result screen. Only renders when timeline data exists.
struct VerificationBadge: View {
    let timeline: [TimelineEvent]?
    let onTap: () -> Void

    @Environment(\.colorScheme) private var scheme

    private var hasVerification: Bool {
        guard let tl = timeline, !tl.isEmpty else { return false }
        return tl.contains(where: { $0.tx != nil })
    }

    var body: some View {
        if hasVerification {
            Button(action: onTap) {
                HStack(spacing: LC.space6) {
                    Image(systemName: "checkmark.shield")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(LC.accent.opacity(0.7))

                    Text("Verified on LightChallenge")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.textTertiary(scheme))

                    Spacer()

                    Text("View verification")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(LC.accent.opacity(0.7))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(LC.accent.opacity(0.5))
                }
                .padding(.vertical, LC.space12)
                .padding(.horizontal, LC.space16)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Verification Sheet

/// Clean bottom sheet showing human-readable verification steps + explorer link.
struct VerificationSheet: View {
    let timeline: [TimelineEvent]
    let challengeId: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    private var steps: [VerificationStep] {
        VerificationStep.from(timeline: timeline, userAddress: nil)
    }

    private var explorerURL: URL? {
        guard let tx = VerificationStep.primaryTxHash(from: steps) else { return nil }
        return URL(string: "\(LightChain.explorerURL)/tx/\(tx)")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Steps
                    VStack(spacing: 0) {
                        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                            stepRow(step, isLast: index == steps.count - 1)
                        }
                    }
                    .padding(.top, LC.space8)

                    // Explorer link
                    if let url = explorerURL {
                        Divider()
                            .padding(.vertical, LC.space20)

                        Button {
                            UIApplication.shared.open(url)
                        } label: {
                            HStack(spacing: LC.space6) {
                                Text("View on explorer")
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(LC.accent.opacity(0.8))
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(LC.accent.opacity(0.6))
                            }
                        }
                        .buttonStyle(.plain)
                    }

                    Spacer(minLength: LC.space32)
                }
                .padding(.horizontal, LC.space24)
            }
            .background(LC.pageBg(scheme))
            .navigationTitle("Verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(LC.accent)
                }
            }
        }
    }

    // MARK: - Step Row

    private func stepRow(_ step: VerificationStep, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: LC.space16) {
            // Indicator
            VStack(spacing: 0) {
                Image(systemName: step.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(step.isCompleted ? LC.accent.opacity(0.7) : LC.textTertiary(scheme).opacity(0.3))

                if !isLast {
                    Rectangle()
                        .fill(LC.accent.opacity(0.1))
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 16)

            // Content
            VStack(alignment: .leading, spacing: LC.space2) {
                Text(step.label)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(step.isCompleted ? LC.textPrimary(scheme) : LC.textTertiary(scheme))

                if let date = step.timestamp {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(LC.textTertiary(scheme))
                }
            }
            .padding(.bottom, isLast ? 0 : LC.space20)

            Spacer()
        }
    }
}
