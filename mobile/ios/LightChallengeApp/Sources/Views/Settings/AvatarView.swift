// AvatarView.swift
// Reusable avatar display — shows user photo or styled initials fallback.
// Used in Profile, Achievements, share cards.

import SwiftUI

struct AvatarView: View {
    let size: CGFloat
    var walletAddress: String = ""
    @EnvironmentObject private var avatarService: AvatarService
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if let image = avatarService.avatarImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                // Gradient initials fallback
                ZStack {
                    LinearGradient(
                        colors: [LC.accent, LC.gradBlue],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )

                    if !walletAddress.isEmpty && walletAddress.count >= 6 {
                        Text(String(walletAddress.dropFirst(2).prefix(2)).uppercased())
                            .font(.system(size: size * 0.35, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                    } else {
                        Image(systemName: "person.fill")
                            .font(.system(size: size * 0.4, weight: .medium))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(
                    LinearGradient(
                        colors: [LC.accent.opacity(0.3), LC.gradLavender.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: size > 60 ? 2 : 1
                )
        )
    }
}

// MARK: - Editable Avatar (with camera badge)

struct EditableAvatarView: View {
    let size: CGFloat
    var walletAddress: String = ""
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            AvatarView(size: size, walletAddress: walletAddress)

            // Camera badge
            Image(systemName: "camera.fill")
                .font(.system(size: size * 0.14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: size * 0.28, height: size * 0.28)
                .background(
                    Circle()
                        .fill(LC.accent)
                        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
                )
                .offset(x: 2, y: 2)
        }
    }
}
