// ActivityView.swift
// Product-oriented Activity inbox — time-grouped, high-signal events.
// Apple-style grouped list with unread indicators, deep link routing.

import SwiftUI

struct ActivityView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var notificationService: NotificationService

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if !appState.hasWallet {
                walletRequired
            } else if notificationService.notifications.isEmpty && !notificationService.isLoading {
                emptyState
            } else {
                activityList
            }
        }
        .background(LC.pageBg(scheme).ignoresSafeArea())
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if notificationService.unreadCount > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await notificationService.markAllRead(
                                baseURL: appState.serverURL,
                                wallet: appState.walletAddress
                            )
                        }
                    } label: {
                        Text("Mark All Read")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(LC.accent)
                    }
                }
            }
        }
        .task {
            if appState.hasWallet {
                await notificationService.fetchNotifications(
                    baseURL: appState.serverURL,
                    wallet: appState.walletAddress
                )
            }
        }
        .refreshable {
            await notificationService.fetchNotifications(
                baseURL: appState.serverURL,
                wallet: appState.walletAddress
            )
        }
    }

    // MARK: - Activity List (time-grouped)

    private var activityList: some View {
        ScrollView {
            if notificationService.isLoading && notificationService.notifications.isEmpty {
                loadingShimmers
            } else {
                let grouped = groupedByDay(notificationService.notifications)
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    ForEach(grouped, id: \.label) { section in
                        Section {
                            ForEach(section.items) { item in
                                activityRow(item)

                                if item.id != section.items.last?.id {
                                    Divider()
                                        .padding(.leading, 60)
                                }
                            }
                        } header: {
                            sectionHeader(section.label)
                        }
                    }
                }
                .padding(.bottom, LC.space32)
            }
        }
    }

    // MARK: - Section Header

    private func sectionHeader(_ label: String) -> some View {
        HStack {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(LC.textSecondary(scheme))
                .textCase(.uppercase)
            Spacer()
        }
        .padding(.horizontal, LC.space16)
        .padding(.vertical, LC.space8)
        .background(LC.pageBg(scheme).opacity(0.95))
        .background(.ultraThinMaterial)
    }

    // MARK: - Activity Row

    private func activityRow(_ notification: AppNotification) -> some View {
        Button {
            handleTap(notification)
        } label: {
            HStack(alignment: .top, spacing: LC.space12) {
                // Icon with colored background
                activityIcon(notification)

                // Content
                VStack(alignment: .leading, spacing: LC.space4) {
                    Text(notification.title)
                        .font(.subheadline.weight(notification.read ? .regular : .semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    if let body = notification.body, !body.isEmpty {
                        Text(body)
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    if let date = notification.createdAt {
                        Text(date.relativeShort)
                            .font(.caption2)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }

                Spacer(minLength: LC.space8)

                // Unread dot + chevron
                VStack(spacing: LC.space8) {
                    if !notification.read {
                        Circle()
                            .fill(LC.accent)
                            .frame(width: 8, height: 8)
                    }
                    Spacer()
                }
                .frame(width: 16)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LC.textTertiary(scheme).opacity(0.5))
                    .padding(.top, LC.space4)
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, LC.space12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Activity Icon

    private func activityIcon(_ notification: AppNotification) -> some View {
        let (bg, fg) = iconColors(for: notification.type)
        return Image(systemName: notification.icon)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(fg)
            .frame(width: 36, height: 36)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                    .fill(bg)
            )
    }

    private func iconColors(for type: String) -> (Color, Color) {
        switch type {
        // Success / celebration
        case "challenge_goal_reached", "competition_completed", "achievement_earned", "match_result":
            return (LC.success.opacity(0.12), LC.success)
        // Financial
        case "claim_available", "claim_reminder":
            return (LC.accent.opacity(0.12), LC.accent)
        // Warning / urgency
        case "challenge_behind_pace", "challenge_final_push", "dispute_filed":
            return (LC.warning.opacity(0.12), LC.warning)
        // Danger
        case "dispute_resolved" where false: // placeholder for negative resolution
            return (LC.danger.opacity(0.12), LC.danger)
        // Lifecycle
        case "challenge_finalized", "proof_submitted", "proof_window_open":
            return (LC.info.opacity(0.12), LC.info)
        // Join / social
        case "challenge_joined", "registration_confirmed", "competition_started", "challenge_starting":
            return (LC.accent.opacity(0.12), LC.accent)
        // Default
        default:
            return (LC.textTertiary(scheme).opacity(0.12), LC.textSecondary(scheme))
        }
    }

    // MARK: - Tap Handler (deep link)

    private func handleTap(_ notification: AppNotification) {
        // Mark individual item as read
        Task {
            await notificationService.markRead(
                id: notification.id,
                baseURL: appState.serverURL,
                wallet: appState.walletAddress
            )
        }

        // Extract challenge ID from data and deep link
        if let challengeId = notification.data["challengeId"] as? String, !challengeId.isEmpty {
            appState.deepLinkChallengeId = challengeId
            appState.selectedTab = .challenges
        } else if let challengeId = notification.data["challenge_id"] as? String, !challengeId.isEmpty {
            appState.deepLinkChallengeId = challengeId
            appState.selectedTab = .challenges
        }
    }

    // MARK: - Time Grouping

    private struct DaySection {
        let label: String
        let items: [AppNotification]
    }

    private func groupedByDay(_ items: [AppNotification]) -> [DaySection] {
        let calendar = Calendar.current

        var today: [AppNotification] = []
        var yesterday: [AppNotification] = []
        var earlier: [AppNotification] = []

        for item in items {
            guard let date = item.createdAt else {
                earlier.append(item)
                continue
            }
            if calendar.isDateInToday(date) {
                today.append(item)
            } else if calendar.isDateInYesterday(date) {
                yesterday.append(item)
            } else {
                earlier.append(item)
            }
        }

        var sections: [DaySection] = []
        if !today.isEmpty { sections.append(DaySection(label: "Today", items: today)) }
        if !yesterday.isEmpty { sections.append(DaySection(label: "Yesterday", items: yesterday)) }
        if !earlier.isEmpty { sections.append(DaySection(label: "Earlier", items: earlier)) }
        return sections
    }

    // MARK: - Loading

    private var loadingShimmers: some View {
        VStack(spacing: 0) {
            ForEach(0..<5, id: \.self) { _ in
                HStack(spacing: LC.space12) {
                    ShimmerView()
                        .frame(width: 36, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))
                    VStack(alignment: .leading, spacing: LC.space6) {
                        ShimmerView().frame(height: 14)
                        ShimmerView().frame(width: 180, height: 10)
                    }
                    Spacer()
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, LC.space12)
            }
        }
    }

    // MARK: - Empty & Error States

    private var walletRequired: some View {
        ContentUnavailableView {
            Label("Wallet Not Set", systemImage: "bell.slash")
        } description: {
            Text("Connect your wallet to see your activity.")
        }
    }

    private var emptyState: some View {
        VStack(spacing: LC.space16) {
            Image(systemName: "tray")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(LC.textTertiary(scheme))

            Text("No Activity Yet")
                .font(.headline)
                .foregroundStyle(LC.textPrimary(scheme))

            Text("Challenge updates, results, and claims\nwill appear here.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(LC.space48)
    }
}
