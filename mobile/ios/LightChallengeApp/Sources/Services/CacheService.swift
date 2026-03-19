// CacheService.swift
// Local caching for challenge data and offline support.
// Uses file-based JSON caching (lightweight, no CoreData dependency).

import Foundation

actor CacheService {
    static let shared = CacheService()

    private let cacheDir: URL
    private let maxAge: TimeInterval = 3600  // 1 hour default TTL

    init() {
        let docs = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDir = docs.appendingPathComponent("LightChallengeCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    // MARK: - Challenges List Cache

    func cacheChallenges(_ challenges: [ChallengeMeta]) {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(challenges) else { return }
        write(data, key: "challenges_list")
    }

    func loadCachedChallenges() -> [ChallengeMeta]? {
        guard let data = read(key: "challenges_list") else { return nil }
        return try? JSONDecoder().decode([ChallengeMeta].self, from: data)
    }

    // MARK: - Challenge Detail Cache

    func cacheDetail(_ detail: ChallengeDetail, id: String) {
        guard let data = try? JSONEncoder().encode(detail) else { return }
        write(data, key: "detail_\(id)")
    }

    func loadCachedDetail(id: String) -> ChallengeDetail? {
        guard let data = read(key: "detail_\(id)") else { return nil }
        return try? JSONDecoder().decode(ChallengeDetail.self, from: data)
    }

    // MARK: - My Activity Cache

    func cacheMyActivity(_ activities: [MyChallenge], wallet: String) {
        guard let data = try? JSONEncoder().encode(activities) else { return }
        write(data, key: "activity_\(wallet.prefix(10))")
    }

    func loadCachedActivity(wallet: String) -> [MyChallenge]? {
        guard let data = read(key: "activity_\(wallet.prefix(10))") else { return nil }
        return try? JSONDecoder().decode([MyChallenge].self, from: data)
    }

    // MARK: - Challenge Metas Cache

    func cacheChallengeMetas(_ metas: [String: ChallengeMeta], wallet: String) {
        // Convert dict to array of pairs for Codable
        let pairs = metas.map { MetaPair(id: $0.key, meta: $0.value) }
        guard let data = try? JSONEncoder().encode(pairs) else { return }
        write(data, key: "metas_\(wallet.prefix(10))")
    }

    func loadCachedMetas(wallet: String) -> [String: ChallengeMeta]? {
        guard let data = read(key: "metas_\(wallet.prefix(10))") else { return nil }
        guard let pairs = try? JSONDecoder().decode([MetaPair].self, from: data) else { return nil }
        return Dictionary(uniqueKeysWithValues: pairs.map { ($0.id, $0.meta) })
    }

    // MARK: - Participant Status Cache

    func cacheParticipantStatus(_ status: ParticipantStatus, challengeId: String, wallet: String) {
        guard let data = try? JSONEncoder().encode(status) else { return }
        write(data, key: "participant_\(challengeId)_\(wallet.prefix(10))")
    }

    func loadCachedParticipantStatus(challengeId: String, wallet: String) -> ParticipantStatus? {
        guard let data = read(key: "participant_\(challengeId)_\(wallet.prefix(10))") else { return nil }
        return try? JSONDecoder().decode(ParticipantStatus.self, from: data)
    }

    // MARK: - Evidence Queue (offline submission)

    func queueEvidence(_ submission: PendingSubmission) {
        var queue = loadEvidenceQueue()
        queue.append(submission)
        guard let data = try? JSONEncoder().encode(queue) else { return }
        write(data, key: "evidence_queue", ttl: 86400 * 7)  // 7 day TTL
    }

    func loadEvidenceQueue() -> [PendingSubmission] {
        guard let data = read(key: "evidence_queue", maxAge: 86400 * 7) else { return [] }
        return (try? JSONDecoder().decode([PendingSubmission].self, from: data)) ?? []
    }

    func removeFromEvidenceQueue(id: String) {
        var queue = loadEvidenceQueue()
        queue.removeAll { $0.id == id }
        guard let data = try? JSONEncoder().encode(queue) else { return }
        write(data, key: "evidence_queue", ttl: 86400 * 7)
    }

    // MARK: - Clear

    func clearAll() {
        try? FileManager.default.removeItem(at: cacheDir)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    // MARK: - Private

    private func write(_ data: Data, key: String, ttl: TimeInterval? = nil) {
        let entry = CacheEntry(data: data, timestamp: Date(), ttl: ttl ?? maxAge)
        guard let entryData = try? JSONEncoder().encode(entry) else { return }
        let fileURL = cacheDir.appendingPathComponent("\(key).cache")
        try? entryData.write(to: fileURL)
    }

    private func read(key: String, maxAge: TimeInterval? = nil) -> Data? {
        let fileURL = cacheDir.appendingPathComponent("\(key).cache")
        guard let entryData = try? Data(contentsOf: fileURL),
              let entry = try? JSONDecoder().decode(CacheEntry.self, from: entryData) else {
            return nil
        }

        let age = Date().timeIntervalSince(entry.timestamp)
        let effectiveTTL = maxAge ?? entry.ttl
        guard age < effectiveTTL else {
            try? FileManager.default.removeItem(at: fileURL)
            return nil
        }

        return entry.data
    }
}

// MARK: - Cache Entry

private struct CacheEntry: Codable {
    let data: Data
    let timestamp: Date
    let ttl: TimeInterval
}

// MARK: - Meta Cache Pair

private struct MetaPair: Codable {
    let id: String
    let meta: ChallengeMeta
}

// MARK: - Pending Submission (Offline Queue)

struct PendingSubmission: Codable, Identifiable {
    let id: String
    let challengeId: String
    let subject: String
    let modelHash: String
    let evidenceJSON: String
    let createdAt: Date

    init(challengeId: String, subject: String, modelHash: String, evidenceJSON: String) {
        self.id = UUID().uuidString
        self.challengeId = challengeId
        self.subject = subject
        self.modelHash = modelHash
        self.evidenceJSON = evidenceJSON
        self.createdAt = Date()
    }
}
