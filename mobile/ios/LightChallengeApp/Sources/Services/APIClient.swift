// APIClient.swift
// Network service for the LightChallenge API.

import Foundation

actor APIClient {
    static let shared = APIClient()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config)
    }()

    // MARK: - Challenges

    /// Fetch all challenges (off-chain metadata list).
    func fetchChallenges(baseURL: String, status: String? = nil) async throws -> [ChallengeMeta] {
        var urlString = "\(baseURL)/api/challenges"
        if let status {
            urlString += "?status=\(status)"
        }
        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)

        // The endpoint returns { items: [...] }
        let response = try decoder.decode(ChallengeListResponse.self, from: data)
        return response.items ?? []
    }

    /// Fetch fast challenge metadata by ID.
    func fetchChallengeMeta(baseURL: String, id: String) async throws -> ChallengeMeta {
        guard let url = URL(string: "\(baseURL)/api/challenges/meta/\(id)") else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)

        // The meta endpoint returns the object directly with an id field
        // But the response may not include `id`, so we need to handle that
        struct MetaResponse: Decodable {
            let title: String?
            let description: String?
            let category: String?
            let game: String?
            let mode: String?
            let tags: [String]?
            let modelId: String?
            let modelKind: String?
            let modelHash: String?
            let createdAt: Double?
            let startsAt: Double?
            let endsAt: Double?
            let proofDeadline: Double?
            let proof: ProofConfig?
        }

        let meta = try decoder.decode(MetaResponse.self, from: data)
        return ChallengeMeta(
            id: id,
            title: meta.title,
            description: meta.description,
            category: ChallengeCategory(rawValue: meta.category ?? "") ?? .unknown,
            game: meta.game,
            mode: meta.mode,
            tags: meta.tags,
            status: nil,
            modelId: meta.modelId,
            modelKind: meta.modelKind,
            modelHash: meta.modelHash,
            createdAt: meta.createdAt,
            startsAt: meta.startsAt,
            endsAt: meta.endsAt,
            proofDeadline: meta.proofDeadline,
            proof: meta.proof,
            funds: nil
        )
    }

    /// Fetch full challenge detail (includes on-chain state).
    func fetchChallengeDetail(baseURL: String, id: String, viewer: String? = nil) async throws -> ChallengeDetail {
        var urlString = "\(baseURL)/api/challenge/\(id)"
        if let viewer, !viewer.isEmpty {
            urlString += "?viewer=\(viewer)"
        }
        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(httpResponse?.statusCode ?? 0, body)
        }
        return try decoder.decode(ChallengeDetail.self, from: data)
    }

    // MARK: - Participants

    /// Check participant status for a challenge.
    func fetchParticipantStatus(baseURL: String, challengeId: String, subject: String) async throws -> ParticipantStatus {
        guard let url = URL(string: "\(baseURL)/api/challenge/\(challengeId)/participant?subject=\(subject)") else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(ParticipantStatus.self, from: data)
    }

    // MARK: - My Activity

    /// Fetch the user's challenge participation list.
    func fetchMyActivity(baseURL: String, subject: String) async throws -> [MyChallenge] {
        guard let url = URL(string: "\(baseURL)/api/me/challenges?subject=\(subject)") else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)
        let response = try decoder.decode(MyActivityResponse.self, from: data)
        return response.challenges ?? []
    }

    // MARK: - Protocol Stats

    /// Fetch real protocol metrics for the welcome screen.
    func fetchProtocolStats(baseURL: String) async throws -> ProtocolStats {
        guard let url = URL(string: "\(baseURL)/api/protocol/metrics") else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        let challenges = json?["challenges"] as? [String: Any]
        let claims = json?["claims"] as? [String: Any]

        let totalChallenges = challenges?["total"] as? Int ?? 0
        let activeChallenges = challenges?["active"] as? Int ?? 0

        // Total participants: sum from challenges with evidence
        let withEvidence = challenges?["with_evidence"] as? Int ?? 0

        // Total staked from claims data (wei)
        let totalClaimedWei = claims?["total_wei_claimed"] as? String ?? "0"
        let uniqueClaimants = claims?["unique_claimants"] as? Int ?? 0

        return ProtocolStats(
            totalChallenges: totalChallenges,
            activeChallenges: activeChallenges,
            totalParticipants: uniqueClaimants > 0 ? uniqueClaimants : withEvidence,
            totalStakedWei: totalClaimedWei
        )
    }

    // MARK: - Progress

    /// Fetch aggregate challenge progress.
    func fetchProgress(baseURL: String, challengeId: String) async throws -> ChallengeProgress {
        guard let url = URL(string: "\(baseURL)/api/challenges/\(challengeId)/progress") else {
            throw APIError.invalidURL
        }
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(ChallengeProgress.self, from: data)
    }

    // MARK: - Achievements

    /// Fetch achievement mints for a wallet.
    func fetchAchievements(baseURL: String, address: String) async throws -> [Achievement] {
        guard let url = URL(string: "\(baseURL)/api/me/achievements?address=\(address)") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            return []
        }
        let wrapper = try decoder.decode(AchievementsResponse.self, from: data)
        return wrapper.achievements ?? []
    }

    /// Fetch claims/earnings for a wallet.
    func fetchClaims(baseURL: String, address: String) async throws -> [Claim] {
        guard let url = URL(string: "\(baseURL)/api/me/claims?subject=\(address)") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            return []
        }
        let wrapper = try decoder.decode(ClaimsResponse.self, from: data)
        return wrapper.claims ?? []
    }

    /// Fetch reputation/level for a wallet.
    func fetchReputation(baseURL: String, address: String) async throws -> Reputation {
        guard let url = URL(string: "\(baseURL)/api/me/reputation?address=\(address)") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            return Reputation.empty
        }
        return try decoder.decode(Reputation.self, from: data)
    }

    // MARK: - Leaderboard

    /// Fetch seasonal leaderboard.
    func fetchLeaderboard(baseURL: String, period: String) async throws -> LeaderboardResponse {
        guard let url = URL(string: "\(baseURL)/api/leaderboard?period=\(period)") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            return LeaderboardResponse(entries: [], season: nil)
        }
        return try decoder.decode(LeaderboardResponse.self, from: data)
    }

    // MARK: - Competition Stats

    /// Fetch competition stats (wins, losses, streak, rank) for a wallet.
    func fetchCompetitionStats(baseURL: String, address: String) async throws -> CompetitionStats {
        guard let url = URL(string: "\(baseURL)/api/me/stats?address=\(address)") else {
            throw APIError.invalidURL
        }
        let (data, response) = try await session.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            return CompetitionStats.empty
        }
        return try decoder.decode(CompetitionStats.self, from: data)
    }
}

// MARK: - Error

enum APIError: LocalizedError {
    case invalidURL
    case httpError(Int, String)
    case decodingFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL."
        case .httpError(let code, let body):
            return "Server error (\(code)): \(body.prefix(200))"
        case .decodingFailed(let detail):
            return "Failed to parse response: \(detail)"
        }
    }
}
