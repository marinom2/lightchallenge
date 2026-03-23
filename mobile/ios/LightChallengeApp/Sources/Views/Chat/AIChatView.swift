// AIChatView.swift
// AI assistant chat interface.

import SwiftUI

struct AIChatView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var chatService = AIChatService.shared
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 0) {
            if chatService.messages.isEmpty {
                emptyState
            } else {
                messageList
            }

            inputBar
        }
        .navigationTitle("AI Assistant")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if !chatService.messages.isEmpty {
                    Button {
                        chatService.clearHistory()
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14))
                            .foregroundStyle(LC.textSecondary(scheme))
                    }
                }
            }
        }
        .lcPageBackground()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ScrollView {
            VStack(spacing: LC.space24) {
                Spacer().frame(height: LC.space32)

                Image(systemName: "sparkles")
                    .font(.system(size: 48))
                    .foregroundStyle(LC.accent)

                VStack(spacing: LC.space8) {
                    Text("LightChallenge AI")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(LC.textPrimary(scheme))

                    Text("Ask me anything about challenges, tournaments, fitness, wallets, or how the platform works.")
                        .font(.subheadline)
                        .foregroundStyle(LC.textSecondary(scheme))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, LC.space24)
                }

                VStack(spacing: LC.space12) {
                    suggestionButton("How do challenges work?")
                    suggestionButton("How do I connect Apple Health?")
                    suggestionButton("What are LCAI rewards?")
                    suggestionButton("Explain tournament formats")
                }
                .padding(.top, LC.space8)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func suggestionButton(_ text: String) -> some View {
        Button {
            sendMessage(text)
        } label: {
            HStack(spacing: LC.space8) {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LC.accent)

                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(LC.textPrimary(scheme))

                Spacer()
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, LC.space12)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(LC.cardBgElevated(scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
            )
        }
        .padding(.horizontal, LC.space24)
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: LC.space12) {
                    ForEach(chatService.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }

                    if chatService.isLoading {
                        HStack(spacing: LC.space8) {
                            TypingIndicator()
                            Spacer()
                        }
                        .padding(.horizontal, LC.space16)
                        .id("typing")
                    }
                }
                .padding(.vertical, LC.space12)
            }
            .onChange(of: chatService.messages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) {
                    if chatService.isLoading {
                        proxy.scrollTo("typing", anchor: .bottom)
                    } else if let last = chatService.messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: chatService.isLoading) { _, loading in
                if loading {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("typing", anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: LC.space12) {
                TextField("Ask anything...", text: $inputText, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($inputFocused)
                    .onSubmit { sendCurrentMessage() }
                    .textFieldStyle(.plain)
                    .padding(.horizontal, LC.space12)
                    .padding(.vertical, LC.space8)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                            .fill(LC.cardBgElevated(scheme))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                            .stroke(LC.cardBorder(scheme), lineWidth: 0.5)
                    )

                Button {
                    sendCurrentMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(
                            canSend ? LC.accent : LC.textTertiary(scheme)
                        )
                }
                .disabled(!canSend)
            }
            .padding(.horizontal, LC.space16)
            .padding(.vertical, LC.space12)
        }
        .background(LC.cardBg(scheme).ignoresSafeArea(edges: .bottom))
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chatService.isLoading
    }

    private func sendCurrentMessage() {
        let text = inputText
        inputText = ""
        sendMessage(text)
    }

    private func sendMessage(_ text: String) {
        Task {
            await chatService.send(
                text,
                baseURL: appState.serverURL,
                walletAddress: appState.walletAddress
            )
        }
    }
}

// MARK: - Message Bubble

private struct MessageBubble: View {
    let message: ChatMessage
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(alignment: .top, spacing: LC.space8) {
            if message.role == .assistant {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LC.accent)
                    .frame(width: 28, height: 28)
                    .background(LC.accentLight.opacity(scheme == .dark ? 0.15 : 1))
                    .clipShape(Circle())
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: LC.space4) {
                Text(message.content)
                    .font(.subheadline)
                    .foregroundStyle(
                        message.role == .user ? .white : LC.textPrimary(scheme)
                    )
                    .padding(.horizontal, LC.space12)
                    .padding(.vertical, LC.space8)
                    .background(
                        RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                            .fill(
                                message.role == .user
                                    ? AnyShapeStyle(LC.accent)
                                    : AnyShapeStyle(LC.cardBgElevated(scheme))
                            )
                    )
            }
            .frame(maxWidth: 280, alignment: message.role == .user ? .trailing : .leading)

            if message.role == .user {
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
        .padding(.horizontal, LC.space16)
    }
}

// MARK: - Typing Indicator

private struct TypingIndicator: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: LC.space8) {
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(LC.accent)
                .frame(width: 28, height: 28)
                .background(LC.accentLight.opacity(0.15))
                .clipShape(Circle())

            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(LC.textTertiary(.dark))
                        .frame(width: 6, height: 6)
                        .opacity(phase == i ? 1 : 0.3)
                }
            }
            .padding(.horizontal, LC.space12)
            .padding(.vertical, LC.space12)
            .background(
                RoundedRectangle(cornerRadius: LC.radiusMD, style: .continuous)
                    .fill(Color(.systemGray6))
            )
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation(.easeInOut(duration: 0.3)) {
                    phase = (phase + 1) % 3
                }
            }
        }
    }
}
