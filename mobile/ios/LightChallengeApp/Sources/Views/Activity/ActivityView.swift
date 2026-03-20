// ActivityView.swift
// Product-quality Activity inbox — Apple-level polish.
// Semantic icons, human copy, full-height modal, dual interaction model.

import SwiftUI

struct ActivityView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var notificationService: NotificationService

    @Environment(\.colorScheme) private var scheme

    @State private var selectedNotification: AppNotification?

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
        .sheet(item: $selectedNotification) { notification in
            ActivityDetailSheet(notification: notification) {
                navigateToChallenge(notification)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(24)
        }
        .onChange(of: appState.activityDetailNotification) { _, notification in
            if let notification {
                selectedNotification = notification
                appState.activityDetailNotification = nil
            }
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
                                        .padding(.leading, 64)
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
                // Semantic icon
                activityIcon(notification)

                VStack(alignment: .leading, spacing: 3) {
                    Text(notification.displayTitle)
                        .font(.subheadline.weight(notification.read ? .regular : .semibold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    if let desc = notification.displayBody, !desc.isEmpty {
                        Text(desc)
                            .font(.caption)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    if let date = notification.createdAt {
                        Text(date.relativeShort)
                            .font(.caption2)
                            .foregroundStyle(LC.textTertiary(scheme))
                            .padding(.top, 1)
                    }
                }

                Spacer(minLength: LC.space4)

                // Unread dot + disclosure indicator
                HStack(spacing: LC.space8) {
                    if !notification.read {
                        Circle()
                            .fill(LC.accent)
                            .frame(width: 7, height: 7)
                    }

                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LC.textTertiary(scheme).opacity(0.4))
                }
                .padding(.top, LC.space4)
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Activity Icon

    private func activityIcon(_ notification: AppNotification) -> some View {
        let style = notification.iconStyle
        return Image(systemName: style.name)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(style.color)
            .frame(width: 38, height: 38)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous)
                    .fill(style.color.opacity(0.1))
            )
    }

    // MARK: - Tap Handler (dual interaction model)

    private func handleTap(_ notification: AppNotification) {
        // Mark as read immediately
        Task {
            await notificationService.markRead(
                id: notification.id,
                baseURL: appState.serverURL,
                wallet: appState.walletAddress
            )
        }

        if notification.isActionEvent {
            navigateToChallenge(notification)
        } else {
            selectedNotification = notification
        }
    }

    private func navigateToChallenge(_ notification: AppNotification) {
        if let challengeId = notification.challengeId, !challengeId.isEmpty {
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
                        .frame(width: 38, height: 38)
                        .clipShape(RoundedRectangle(cornerRadius: LC.radiusSM, style: .continuous))
                    VStack(alignment: .leading, spacing: LC.space6) {
                        ShimmerView().frame(height: 14)
                        ShimmerView().frame(width: 180, height: 10)
                    }
                    Spacer()
                }
                .padding(.horizontal, LC.space16)
                .padding(.vertical, 14)
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

            Text("Challenge updates, results, and rewards\nwill appear here.")
                .font(.subheadline)
                .foregroundStyle(LC.textSecondary(scheme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(LC.space48)
    }
}

// MARK: - Activity Detail Sheet (full-height, Apple-level)

struct ActivityDetailSheet: View {
    let notification: AppNotification
    let onViewChallenge: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var iconAppeared = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                    .frame(height: LC.space40)

                // Hero area
                VStack(spacing: LC.space20) {
                    // Semantic icon (scale-in animation)
                    iconView
                        .scaleEffect(iconAppeared ? 1.0 : 0.5)
                        .opacity(iconAppeared ? 1.0 : 0)
                        .animation(
                            .spring(response: 0.5, dampingFraction: 0.7),
                            value: iconAppeared
                        )

                    // Title
                    Text(notification.displayTitle)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(LC.textPrimary(scheme))
                        .multilineTextAlignment(.center)

                    // Description
                    if let desc = notification.displayBody, !desc.isEmpty {
                        Text(desc)
                            .font(.body)
                            .foregroundStyle(LC.textSecondary(scheme))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, LC.space16)
                    }

                    // State chip
                    if let state = notification.stateLabel {
                        stateChip(state)
                    }
                }
                .padding(.horizontal, LC.space24)

                Spacer()

                // Timestamp
                if let date = notification.createdAt {
                    Text(date.relativeShort)
                        .font(.footnote)
                        .foregroundStyle(LC.textTertiary(scheme))
                        .padding(.bottom, LC.space24)
                }

                // Actions
                VStack(spacing: LC.space12) {
                    if notification.challengeId != nil {
                        Button {
                            dismiss()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                onViewChallenge()
                            }
                        } label: {
                            Text("View Challenge")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(
                                    RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                                        .fill(
                                            LinearGradient(
                                                colors: [LC.accent, LC.gradBlue],
                                                startPoint: .leading,
                                                endPoint: .trailing
                                            )
                                        )
                                        .shadow(color: LC.accent.opacity(0.15), radius: 10, y: 5)
                                )
                        }
                        .buttonStyle(ScaleButtonStyle())
                    }

                    Button {
                        dismiss()
                    } label: {
                        Text("Close")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(LC.textSecondary(scheme))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                }
                .padding(.horizontal, LC.space24)
                .padding(.bottom, LC.space32)
            }
            .background(LC.pageBg(scheme).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(LC.textTertiary(scheme))
                    }
                }
            }
        }
        .onAppear {
            withAnimation {
                iconAppeared = true
            }
        }
    }

    // MARK: - Icon

    private var iconView: some View {
        let style = notification.iconStyle
        return Image(systemName: style.name)
            .font(.system(size: 32, weight: .semibold))
            .foregroundStyle(style.color)
            .frame(width: 72, height: 72)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(style.color.opacity(0.1))
            )
    }

    // MARK: - State Chip

    private func stateChip(_ text: String) -> some View {
        let color = notification.stateColor
        return Text(text)
            .font(.caption.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(color.opacity(0.1))
            )
    }
}

// MARK: - Tactile Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.85), value: configuration.isPressed)
    }
}
