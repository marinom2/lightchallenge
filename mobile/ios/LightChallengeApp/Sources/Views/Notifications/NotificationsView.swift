// NotificationsView.swift
// Notification center — displays challenge notifications.

import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var notificationService: NotificationService

    var body: some View {
        Group {
            if !appState.hasWallet {
                walletRequired
            } else if notificationService.notifications.isEmpty {
                emptyView
            } else {
                notificationsList
            }
        }
        .navigationTitle("Notifications")
        .toolbar {
            if !notificationService.notifications.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Mark All Read") {
                        Task {
                            await notificationService.markAllRead(
                                baseURL: appState.serverURL,
                                wallet: appState.walletAddress
                            )
                        }
                    }
                    .font(.caption)
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

    // MARK: - List

    private var notificationsList: some View {
        List {
            ForEach(notificationService.notifications) { notification in
                notificationRow(notification)
            }
        }
        .listStyle(.plain)
    }

    private func notificationRow(_ notification: AppNotification) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: notification.icon)
                .font(.title3)
                .foregroundStyle(notification.read ? Color.secondary : Color.blue)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title)
                    .font(.subheadline.weight(notification.read ? .regular : .semibold))

                if let body = notification.body {
                    Text(body)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if let date = notification.createdAt {
                    Text(date.relativeShort)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            if !notification.read {
                Circle()
                    .fill(.blue)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - States

    private var walletRequired: some View {
        ContentUnavailableView {
            Label("Wallet Not Set", systemImage: "bell.slash")
        } description: {
            Text("Set your wallet address to receive notifications.")
        }
    }

    private var emptyView: some View {
        ContentUnavailableView(
            "No Notifications",
            systemImage: "bell",
            description: Text("You'll see challenge updates here.")
        )
    }
}
