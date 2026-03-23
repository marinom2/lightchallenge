// AIChatService.swift
// AI chat assistant — calls /api/ai/chat on the backend.

import Foundation

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: Role
    let content: String
    let timestamp = Date()

    enum Role: String {
        case user
        case assistant
    }
}

@MainActor
class AIChatService: ObservableObject {
    static let shared = AIChatService()

    @Published var messages: [ChatMessage] = []
    @Published var isLoading = false

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private init() {}

    /// Send a message and get an AI response.
    func send(_ text: String, baseURL: String, walletAddress: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = ChatMessage(role: .user, content: trimmed)
        messages.append(userMessage)
        isLoading = true

        defer { isLoading = false }

        do {
            let reply = try await callAPI(message: trimmed, baseURL: baseURL, walletAddress: walletAddress)
            let assistantMessage = ChatMessage(role: .assistant, content: reply)
            messages.append(assistantMessage)
        } catch {
            let errorMessage = ChatMessage(role: .assistant, content: "Sorry, I couldn't process your request. Please try again.")
            messages.append(errorMessage)
        }
    }

    func clearHistory() {
        messages.removeAll()
    }

    // MARK: - API Call

    private func callAPI(message: String, baseURL: String, walletAddress: String) async throws -> String {
        guard let url = URL(string: "\(baseURL)/api/ai/chat") else {
            throw APIError.invalidURL
        }

        // Build conversation history (last 10 messages for context)
        let history: [[String: String]] = messages.suffix(10).map { msg in
            ["role": msg.role.rawValue, "content": msg.content]
        }

        let payload: [String: Any] = [
            "message": message,
            "history": history,
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: payload)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(walletAddress, forHTTPHeaderField: "x-lc-address")
        request.httpBody = jsonData

        let (data, response) = try await session.data(for: request)

        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(httpResponse?.statusCode ?? 0, body)
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let reply = json["reply"] as? String else {
            throw APIError.decodingFailed("Missing reply in response")
        }

        return reply
    }
}
