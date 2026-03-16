// MainTabView.swift
// Root tab navigation — 4-tab layout.
// Explore | Challenges | Achievements | Profile

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var notificationService: NotificationService

    var body: some View {
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
}
