// MainTabView.swift
// Root navigation — adaptive layout.
// iPhone: 4-tab bottom bar.
// iPad: sidebar NavigationSplitView.

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var notificationService: NotificationService
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var pushDetailNotification: AppNotification?
    // AI chat hidden until API key is funded — set to true to re-enable
    // @State private var showingChat = false

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadLayout
            } else {
                iPhoneLayout
            }
        }
        .sheet(item: $pushDetailNotification) { notification in
            ActivityDetailSheet(notification: notification) {
                if let challengeId = notification.challengeId, !challengeId.isEmpty {
                    appState.deepLinkChallengeId = challengeId
                    appState.selectedTab = .challenges
                }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(24)
        }
        .onChange(of: appState.activityDetailNotification) { _, notification in
            if let notification {
                pushDetailNotification = notification
                appState.activityDetailNotification = nil
            }
        }
    }

    // MARK: - iPhone (Bottom Tabs)

    private var iPhoneLayout: some View {
        TabView(selection: $appState.selectedTab) {
            ExploreView()
                .tabItem {
                    Label(AppState.Tab.explore.label, systemImage: AppState.Tab.explore.icon)
                }
                .tag(AppState.Tab.explore)

            ChallengesView()
                .tabItem {
                    Label(AppState.Tab.challenges.label, systemImage: AppState.Tab.challenges.icon)
                }
                .tag(AppState.Tab.challenges)

            AchievementsView()
                .tabItem {
                    Label(AppState.Tab.achievements.label, systemImage: AppState.Tab.achievements.icon)
                }
                .tag(AppState.Tab.achievements)

            ProfileView()
                .tabItem {
                    Label(AppState.Tab.profile.label, systemImage: AppState.Tab.profile.icon)
                }
                .tag(AppState.Tab.profile)
                .badge(notificationService.unreadCount)
        }
        .tint(LC.accent)
    }

    // MARK: - iPad (Sidebar)

    private var iPadLayout: some View {
        NavigationSplitView {
            List {
                Section {
                    ForEach(AppState.Tab.allCases, id: \.self) { tab in
                        Button {
                            appState.selectedTab = tab
                        } label: {
                            Label(tab.label, systemImage: tab.icon)
                                .badge(tab == .profile ? notificationService.unreadCount : 0)
                        }
                        .listRowBackground(
                            appState.selectedTab == tab
                                ? LC.accent.opacity(0.12)
                                : Color.clear
                        )
                    }
                } header: {
                    Text("LightChallenge")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(LC.accent)
                        .textCase(nil)
                        .padding(.bottom, LC.space4)
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("Menu")
            .tint(LC.accent)
        } detail: {
            switch appState.selectedTab {
            case .explore:
                ExploreView()
            case .challenges:
                ChallengesView()
            case .achievements:
                AchievementsView()
            case .profile:
                ProfileView()
            }
        }
        .tint(LC.accent)
    }
}
