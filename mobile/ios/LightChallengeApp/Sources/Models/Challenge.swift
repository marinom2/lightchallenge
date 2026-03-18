// Challenge.swift
// API data models for challenges, participants, and activity.

import Foundation

// MARK: - Challenge Category

enum ChallengeCategory: String, Codable, CaseIterable {
    case fitness
    case gaming
    case social
    case custom
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw.lowercased()) ?? .unknown
    }

    var label: String {
        switch self {
        case .fitness: "Fitness"
        case .gaming: "Gaming"
        case .social: "Social"
        case .custom: "Custom"
        case .unknown: "Other"
        }
    }

    var icon: String {
        switch self {
        case .fitness: "figure.run"
        case .gaming: "gamecontroller.fill"
        case .social: "person.2.fill"
        case .custom: "sparkles"
        case .unknown: "questionmark.circle"
        }
    }

    var isFitness: Bool { self == .fitness }
    var isGaming: Bool { self == .gaming }

    /// Mobile proof submission is only supported for fitness challenges.
    var supportsMobileProof: Bool { isFitness }
}

// MARK: - Challenge List Item (from GET /api/challenges)

struct ChallengeMeta: Identifiable, Codable {
    let id: String
    let title: String?
    let description: String?
    let category: ChallengeCategory?
    let game: String?
    let mode: String?
    let tags: [String]?
    let status: String?
    let modelId: String?
    let modelKind: String?
    let modelHash: String?
    let createdAt: Double?
    let startsAt: Double?
    let endsAt: Double?
    let proofDeadline: Double?

    // Proof config (optional nested object)
    let proof: ProofConfig?
    let funds: FundsConfig?
    /// Challenge params from DB — contains rules (metric, threshold, period)
    let params: ChallengeParams?
    /// Participant count (optional — included when the list endpoint provides it)
    let participantCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, description, category, game, mode, tags, status
        case modelId, modelKind, modelHash, createdAt, startsAt, endsAt, proofDeadline
        case proof, funds, params, participantCount
    }

    /// Resolved category: explicit field, or inferred from game/modelId.
    var resolvedCategory: ChallengeCategory {
        if let cat = category, cat != .unknown { return cat }
        if game != nil { return .gaming }
        if let mid = modelId?.lowercased() {
            let gamePrefixes = ["dota", "lol", "cs2"]
            if gamePrefixes.contains(where: { mid.hasPrefix($0) }) { return .gaming }
            // Provider-agnostic fitness models (fitness.steps@1, fitness.cycling@1, etc.)
            if mid.hasPrefix("fitness.") { return .fitness }
            // Legacy provider-specific models
            let fitPrefixes = ["apple", "strava", "garmin", "fitbit", "googlefit"]
            if fitPrefixes.contains(where: { mid.hasPrefix($0) }) { return .fitness }
        }
        return .unknown
    }

    var displayTitle: String { title ?? "Challenge #\(id)" }
    var displayDescription: String { description ?? "" }

    var isActive: Bool { status == "Active" }
    var isFinalized: Bool { status == "Finalized" }

    var createdDate: Date? {
        guard let ts = createdAt, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }

    var startDate: Date? {
        guard let ts = startsAt, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }

    var endsDate: Date? {
        guard let ts = endsAt, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }

    var proofDeadlineDate: Date? {
        guard let ts = proofDeadline, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }

    var stakeDisplay: String? {
        guard let wei = funds?.stake, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.format(wei: amount)
    }

    /// Stake formatted as USD (or LCAI fallback if no token price).
    func stakeDisplayUSD(tokenPrice: Double?) -> String? {
        guard let wei = funds?.stake, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.formatUSD(wei: amount, tokenPrice: tokenPrice)
    }
}

// MARK: - Protocol Stats (for welcome screen)

struct ProtocolStats {
    let totalChallenges: Int
    let activeChallenges: Int
    let totalParticipants: Int
    let totalStakedWei: String

    var formattedStaked: String {
        LCFormatter.format(weiString: totalStakedWei)
    }
}

// MARK: - LCAI Currency Formatter

enum LCFormatter {
    /// Format a wei amount as a human-readable LCAI string.
    /// Always shows LCAI — no mLCAI/gwei subunits.
    static func format(wei: Double) -> String {
        let lcai = wei / 1e18
        if lcai >= 1000 {
            return String(format: "%.0f LCAI", lcai)
        } else if lcai >= 1 {
            return String(format: "%.2f LCAI", lcai)
        } else if lcai >= 0.001 {
            return String(format: "%.3f LCAI", lcai)
        } else if lcai > 0 {
            return String(format: "%.6f LCAI", lcai)
        } else {
            return "0 LCAI"
        }
    }

    /// Format a wei string.
    static func format(weiString: String) -> String {
        guard let amount = Double(weiString), amount > 0 else { return "0 LCAI" }
        return format(wei: amount)
    }
}

struct ProofConfig: Codable {
    let kind: String?
    let modelId: String?
    let modelHash: String?
    let paramsHash: String?
}

struct FundsConfig: Codable {
    let stake: String?
}

// MARK: - Challenge Rules (from params.rules)

struct ChallengeRules: Codable {
    let period: String?     // "daily", "total", "average"
    let metric: String?     // "steps", "distance", "active_minutes", "cycling_km", "swimming_km"
    let threshold: Double?  // goal value

    var goalValue: Double { threshold ?? 0 }

    var metricLabel: String {
        switch metric {
        case "steps": return "steps"
        case "distance", "distance_km", "walking_km": return "km"
        case "active_minutes": return "min"
        case "cycling_km": return "km"
        case "swimming_km": return "km"
        case "hiking_km": return "km"
        case "rowing_km": return "km"
        case "strength_sessions": return "sessions"
        case "yoga_min": return "min"
        case "hiit_min": return "min"
        case "exercise_time": return "min"
        case "calories": return "kcal"
        default: return metric ?? ""
        }
    }

    var metricName: String {
        switch metric {
        case "steps": return "Steps"
        case "distance", "distance_km": return "Distance"
        case "walking_km": return "Walking"
        case "active_minutes": return "Active Minutes"
        case "cycling_km": return "Cycling"
        case "swimming_km": return "Swimming"
        case "hiking_km": return "Hiking"
        case "rowing_km": return "Rowing"
        case "strength_sessions": return "Strength"
        case "yoga_min": return "Yoga"
        case "hiit_min": return "HIIT"
        case "exercise_time": return "Exercise Time"
        case "calories": return "Calories"
        default: return metric?.capitalized ?? "Activity"
        }
    }
}

/// A single condition entry from the rule structure: { metric, op, value }
private struct RuleCondition: Codable {
    let metric: String?
    let op: String?
    let value: Double?
}

/// A target block: dailyTarget or weeklyTarget with conditions array.
private struct TargetBlock: Codable {
    let conditions: [RuleCondition]?
    let consecutiveDays: Int?
}

struct ChallengeParams: Codable {
    /// Rules can come as an array `[{...}]` or a single object `{...}` from the API.
    let rules: [ChallengeRules]?

    // Rule-format fields (from iOS template ruleBuilder output)
    private let challengeType: String?
    private let conditions: [RuleCondition]?
    private let dailyTarget: TargetBlock?
    private let weeklyTarget: TargetBlock?

    /// First rule: from explicit `rules` array, or synthesized from conditions.
    var firstRule: ChallengeRules? {
        if let r = rules?.first { return r }
        return synthesizedFromConditions
    }

    private var synthesizedFromConditions: ChallengeRules? {
        let conds = dailyTarget?.conditions ?? weeklyTarget?.conditions ?? conditions ?? []
        guard let first = conds.first, let rawMetric = first.metric else { return nil }

        let metric: String
        switch rawMetric {
        case "steps_count":    metric = "steps"
        case "distance_km":    metric = "distance_km"
        case "walking_km":     metric = "walking_km"
        case "elev_gain_m":    metric = "hiking_km"
        case "active_minutes": metric = "active_minutes"
        case "duration_min":   metric = "active_minutes"
        case "yoga_min":       metric = "yoga_min"
        case "hiit_min":       metric = "hiit_min"
        case "rowing_km":      metric = "rowing_km"
        case "exercise_time":  metric = "exercise_time"
        case "calories":       metric = "calories"
        case "strength_sessions": metric = "strength_sessions"
        default:               metric = rawMetric
        }

        let period: String
        if dailyTarget != nil { period = "daily" }
        else if weeklyTarget != nil { period = "weekly" }
        else { period = "total" }

        return ChallengeRules(period: period, metric: metric, threshold: first.value)
    }

    init(rules: [ChallengeRules]?) {
        self.rules = rules
        self.challengeType = nil
        self.conditions = nil
        self.dailyTarget = nil
        self.weeklyTarget = nil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Try standard rules array/object
        if let arr = try? container.decode([ChallengeRules].self, forKey: .rules) {
            rules = arr
        } else if let single = try? container.decode(ChallengeRules.self, forKey: .rules) {
            rules = [single]
        } else {
            rules = nil
        }

        // Rule-format fields (from template ruleBuilder)
        challengeType = try? container.decode(String.self, forKey: .challengeType)
        conditions = try? container.decode([RuleCondition].self, forKey: .conditions)
        dailyTarget = try? container.decode(TargetBlock.self, forKey: .dailyTarget)
        weeklyTarget = try? container.decode(TargetBlock.self, forKey: .weeklyTarget)
    }

    private enum CodingKeys: String, CodingKey {
        case rules, challengeType, conditions, dailyTarget, weeklyTarget
    }
}

// MARK: - Challenge Detail (from GET /api/challenge/[id])

struct ChallengeDetail: Codable {
    let id: String
    let status: String?
    let outcome: Int?
    let creator: String?
    let participantsCount: Int?
    let youJoined: Bool?

    // Mutable so we can patch from DB meta when chain data is missing
    var title: String?
    var description: String?
    var category: String?
    let game: String?
    let mode: String?
    var tags: [String]?

    var modelId: String?
    var modelHash: String?
    let proof: ProofConfig?

    let money: MoneyInfo?
    let pool: PoolInfo?
    var params: ChallengeParams?

    let timeline: [TimelineEvent]?

    // The detail API returns timestamps as string epoch values with "Ts" suffix
    // (startTs, endTs, joinClosesTs) while the list API uses double "At" suffix
    // (startsAt, endsAt). We decode both conventions. Mutable for meta merge.
    var startsAt: Double?
    var endsAt: Double?
    var startTs: String?
    var endTs: String?
    var proofDeadline: Double?
    let joinClosesTs: String?
    let createdAt: Double?

    // Parsed params from the API's semicolon-delimited params string.
    // e.g. { "period": "weekly", "metric": "steps", "threshold": "10000" }
    let form: [String: FormValue]?

    /// Patch missing fields from the fast DB meta endpoint.
    mutating func mergeFromMeta(_ meta: ChallengeMeta) {
        if title == nil || title?.isEmpty == true { title = meta.title }
        if description == nil || description?.isEmpty == true { description = meta.description }
        if category == nil { category = meta.category?.rawValue }
        if tags == nil || tags?.isEmpty == true { tags = meta.tags }
        if modelId == nil { modelId = meta.modelId }
        if modelHash == nil { modelHash = meta.modelHash }
        if params == nil { params = meta.params }
        // Merge timestamps: prefer chain Ts, then meta At
        if startsAt == nil && startTs == nil, let ts = meta.startsAt, ts > 0 { startsAt = ts }
        if endsAt == nil && endTs == nil, let ts = meta.endsAt, ts > 0 { endsAt = ts }
        if proofDeadline == nil, let ts = meta.proofDeadline, ts > 0 { proofDeadline = ts }
    }

    var resolvedCategory: ChallengeCategory {
        if let c = category {
            return ChallengeCategory(rawValue: c.lowercased()) ?? .unknown
        }
        if game != nil { return .gaming }
        return .unknown
    }

    var displayTitle: String { title ?? "Challenge #\(id)" }
    var isActive: Bool { status == "Active" }

    var startDate: Date? {
        if let ts = startsAt, ts > 0 { return Date(timeIntervalSince1970: ts) }
        if let s = startTs, let ts = Double(s), ts > 0 { return Date(timeIntervalSince1970: ts) }
        return nil
    }

    var endsDate: Date? {
        if let ts = endsAt, ts > 0 { return Date(timeIntervalSince1970: ts) }
        if let s = endTs, let ts = Double(s), ts > 0 { return Date(timeIntervalSince1970: ts) }
        return nil
    }

    var proofDeadlineDate: Date? {
        if let ts = proofDeadline, ts > 0 { return Date(timeIntervalSince1970: ts) }
        // Fallback: proof deadline = endDate + 3 days
        if let end = endsDate { return end.addingTimeInterval(3 * 86400) }
        return nil
    }

    /// Challenge rules: from params.rules first, then from form fields.
    var rules: ChallengeRules? {
        if let r = params?.firstRule { return r }
        // Build rules from the API's form dict (parsed params string)
        if let form {
            let metric = form["metric"]?.stringValue
            let period = form["period"]?.stringValue
            let threshold = form["threshold"]?.doubleValue
            if metric != nil || threshold != nil {
                return ChallengeRules(period: period, metric: metric, threshold: threshold)
            }
        }
        return nil
    }

    var stakeDisplay: String? {
        guard let wei = money?.stakeWei, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.format(wei: amount)
    }

    func stakeDisplayUSD(tokenPrice: Double?) -> String? {
        guard let wei = money?.stakeWei, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.formatUSD(wei: amount, tokenPrice: tokenPrice)
    }

    var poolDisplay: String? {
        guard let wei = pool?.committedWei, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.format(wei: amount)
    }

    func poolDisplayUSD(tokenPrice: Double?) -> String? {
        guard let wei = pool?.committedWei, let amount = Double(wei), amount > 0 else { return nil }
        return LCFormatter.formatUSD(wei: amount, tokenPrice: tokenPrice)
    }

    /// Create a ChallengeDetail from ChallengeMeta (fallback when chain fetch fails).
    static func fromMeta(_ meta: ChallengeMeta) -> ChallengeDetail {
        ChallengeDetail(
            id: meta.id,
            status: meta.status,
            outcome: nil,
            creator: nil,
            participantsCount: nil,
            youJoined: nil,
            title: meta.title,
            description: meta.description,
            category: meta.category?.rawValue,
            game: meta.game,
            mode: meta.mode,
            tags: meta.tags,
            modelId: meta.modelId,
            modelHash: meta.modelHash,
            proof: meta.proof,
            money: nil,
            pool: nil,
            params: meta.params,
            timeline: nil,
            startsAt: meta.startsAt,
            endsAt: meta.endsAt,
            startTs: nil,
            endTs: nil,
            proofDeadline: meta.proofDeadline,
            joinClosesTs: nil,
            createdAt: meta.createdAt,
            form: nil
        )
    }

    /// Convert to ChallengeMeta for use in AutoProofService.
    func toChallengeMeta() -> ChallengeMeta {
        ChallengeMeta(
            id: id,
            title: title,
            description: description,
            category: ChallengeCategory(rawValue: (category ?? "").lowercased()),
            game: game,
            mode: mode,
            tags: tags,
            status: status,
            modelId: modelId,
            modelKind: nil,
            modelHash: modelHash,
            createdAt: createdAt,
            startsAt: startsAt ?? (startTs.flatMap { Double($0) }),
            endsAt: endsAt ?? (endTs.flatMap { Double($0) }),
            proofDeadline: proofDeadline,
            proof: proof,
            funds: FundsConfig(stake: money?.stakeWei),
            params: params,
            participantCount: participantsCount
        )
    }
}

/// Flexible JSON value that can be a string or number in the form dict.
enum FormValue: Codable {
    case string(String)
    case number(Double)
    case int(Int)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .number(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else {
            self = .string("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let d): try container.encode(d)
        case .int(let i): try container.encode(i)
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let s): return s
        case .number(let d): return String(d)
        case .int(let i): return String(i)
        }
    }

    var doubleValue: Double? {
        switch self {
        case .number(let d): return d
        case .int(let i): return Double(i)
        case .string(let s): return Double(s)
        }
    }
}

struct MoneyInfo: Codable {
    let stakeWei: String?
}

struct PoolInfo: Codable {
    let committedWei: String?
}

struct TimelineEvent: Codable, Identifiable {
    let name: String?
    let label: String?
    let tx: String?
    let block: String?
    let timestamp: Double?
    let who: String?

    var id: String { "\(name ?? "")-\(block ?? "")-\(tx ?? "")" }

    var date: Date? {
        guard let ts = timestamp, ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }
}

// MARK: - Server Progress (from GET /api/challenge/[id]/my-progress)

struct ServerProgress: Codable {
    let metric: String?
    let metricLabel: String?
    let currentValue: Double?
    let goalValue: Double?
    let progress: Double?
    let updatedAt: String?
}

// MARK: - Participant Status (from GET /api/challenge/[id]/participant)

struct ParticipantStatus: Codable {
    let challengeId: String?
    let subject: String?
    let hasEvidence: Bool?
    let verdictPass: Bool?
    let verdictReasons: [String]?
    let verdictEvaluator: String?
    let verdictUpdatedAt: String?
}

// MARK: - My Challenges (from GET /api/me/challenges)

struct MyChallenge: Codable, Identifiable {
    let challengeId: String
    let hasEvidence: Bool?
    let verdictPass: Bool?
    let verdictReasons: [String]?
    let verdictEvaluator: String?
    let verdictUpdatedAt: String?

    var id: String { challengeId }

    // Note: No CodingKeys needed — the shared JSONDecoder uses
    // .convertFromSnakeCase which handles challenge_id → challengeId etc.
    // Explicit CodingKeys with snake_case strings CONFLICT with that strategy.

    var statusLabel: String {
        if let pass = verdictPass {
            return pass ? "Passed" : "Failed"
        }
        if hasEvidence == true { return "Evaluating" }
        return "Proof needed"
    }

    var statusColor: String {
        if let pass = verdictPass {
            return pass ? "green" : "red"
        }
        if hasEvidence == true { return "amber" }
        return "blue"
    }
}

// MARK: - API Response Wrappers

struct ChallengeListResponse: Codable {
    let items: [ChallengeMeta]?
}

struct ChallengeDetailResponse: Codable {
    // The detail endpoint returns the object directly, not wrapped.
    // We decode ChallengeDetail directly from the response.
}

struct MyActivityResponse: Codable {
    let ok: Bool?
    let challenges: [MyChallenge]?
}

// MARK: - Challenge Progress (from GET /api/challenges/[id]/progress)

struct ChallengeProgress: Codable {
    let challengeId: String?
    let participantCount: Int?
    let evidenceCount: Int?
    let verdictCount: Int?
    let passCount: Int?
    let failCount: Int?
}

// MARK: - Achievements (from GET /api/me/achievements)

struct Achievement: Codable, Identifiable {
    let tokenId: String?
    let challengeId: String?
    let recipient: String?
    let achievementType: String?
    let txHash: String?
    let blockNumber: Int?
    let mintedAt: String?

    var id: String { tokenId ?? UUID().uuidString }

    var type: AchievementType {
        AchievementType(rawValue: achievementType ?? "") ?? .participation
    }

    var mintDate: Date? {
        guard let str = mintedAt else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: str) ?? ISO8601DateFormatter().date(from: str)
    }
}

enum AchievementType: String, Codable, CaseIterable {
    case completion, victory, winStreak = "win_streak", firstWin = "first_win"
    case participation, topScorer = "top_scorer", undefeated, comeback
    case speedrun, social, earlyAdopter = "early_adopter", veteran
    case perfectionist, explorer

    var label: String {
        switch self {
        case .completion: return "Completion"
        case .victory: return "Victory"
        case .winStreak: return "Win Streak"
        case .firstWin: return "First Win"
        case .participation: return "Participation"
        case .topScorer: return "Top Scorer"
        case .undefeated: return "Undefeated"
        case .comeback: return "Comeback"
        case .speedrun: return "Speedrun"
        case .social: return "Social"
        case .earlyAdopter: return "Early Adopter"
        case .veteran: return "Veteran"
        case .perfectionist: return "Perfectionist"
        case .explorer: return "Explorer"
        }
    }

    var icon: String {
        switch self {
        case .completion: return "checkmark.circle.fill"
        case .victory: return "trophy.fill"
        case .winStreak: return "flame.fill"
        case .firstWin: return "star.fill"
        case .participation: return "person.fill"
        case .topScorer: return "crown.fill"
        case .undefeated: return "shield.fill"
        case .comeback: return "arrow.uturn.up.circle.fill"
        case .speedrun: return "bolt.fill"
        case .social: return "bubble.left.and.bubble.right.fill"
        case .earlyAdopter: return "sparkles"
        case .veteran: return "medal.fill"
        case .perfectionist: return "diamond.fill"
        case .explorer: return "map.fill"
        }
    }

    var points: Int {
        switch self {
        case .completion: return 50
        case .victory: return 150
        case .winStreak: return 100
        case .firstWin: return 75
        case .participation: return 25
        case .topScorer: return 200
        case .undefeated: return 250
        case .comeback: return 125
        case .speedrun: return 150
        case .social: return 50
        case .earlyAdopter: return 100
        case .veteran: return 200
        case .perfectionist: return 300
        case .explorer: return 75
        }
    }

    var color: (Color, Color) {
        switch self {
        case .completion: return (Color(hex: 0x2563EB), Color(hex: 0x3B82F6))
        case .victory: return (Color(hex: 0xF59E0B), Color(hex: 0x2563EB))
        case .winStreak: return (Color(hex: 0xEF4444), Color(hex: 0xF59E0B))
        case .firstWin: return (Color(hex: 0xF59E0B), Color(hex: 0x3B82F6))
        case .participation: return (Color(hex: 0x3B82F6), Color(hex: 0x93C5FD))
        case .topScorer: return (Color(hex: 0x475569), Color(hex: 0x64748B))
        case .undefeated: return (Color(hex: 0x334155), Color(hex: 0x475569))
        case .comeback: return (Color(hex: 0x22C55E), Color(hex: 0x2563EB))
        case .speedrun: return (Color(hex: 0xF59E0B), Color(hex: 0xEF4444))
        case .social: return (Color(hex: 0x93C5FD), Color(hex: 0x3B82F6))
        case .earlyAdopter: return (Color(hex: 0x3B82F6), Color(hex: 0x2563EB))
        case .veteran: return (Color(hex: 0x475569), Color(hex: 0xF59E0B))
        case .perfectionist: return (Color(hex: 0x1D4ED8), Color(hex: 0x475569))
        case .explorer: return (Color(hex: 0x2563EB), Color(hex: 0x93C5FD))
        }
    }
}

import SwiftUI

struct AchievementsResponse: Codable {
    let achievements: [Achievement]?
}

// MARK: - Claims (from GET /api/me/claims)

struct Claim: Codable, Identifiable {
    let challengeId: String?
    let subject: String?
    let claimType: String?
    let amountWei: String?
    let txHash: String?
    let claimedAt: String?

    var id: String { "\(challengeId ?? "")-\(claimType ?? "")-\(txHash ?? "")" }

    var amountLCAI: Double {
        guard let wei = amountWei, let amount = Double(wei), amount > 0 else { return 0 }
        return amount / 1e18
    }

    var displayAmount: String {
        guard let wei = amountWei, let amount = Double(wei), amount > 0 else { return "0 LCAI" }
        return LCFormatter.format(wei: amount)
    }

    var typeLabel: String {
        switch claimType {
        case "principal": return "Stake Return"
        case "cashback": return "Cashback"
        case "validator_reward": return "Validator Reward"
        case "winner": return "Winner Reward"
        case "loser": return "Loser Refund"
        default: return claimType?.capitalized ?? "Reward"
        }
    }
}

struct ClaimsResponse: Codable {
    let claims: [Claim]?
}

// MARK: - Reputation (from GET /api/me/reputation)

struct Reputation: Codable {
    let subject: String?
    let points: Int
    let level: Int
    let completions: Int
    let victories: Int
    let updatedAt: String?

    static let empty = Reputation(subject: nil, points: 0, level: 1, completions: 0, victories: 0, updatedAt: nil)

    var levelName: String {
        switch level {
        case 1: return "Newcomer"
        case 2: return "Challenger"
        case 3: return "Competitor"
        case 4: return "Champion"
        case 5: return "Legend"
        default: return "Newcomer"
        }
    }

    var levelIcon: String {
        switch level {
        case 1: return "person.fill"
        case 2: return "bolt.fill"
        case 3: return "flame.fill"
        case 4: return "crown.fill"
        case 5: return "star.fill"
        default: return "person.fill"
        }
    }

    var nextLevelPoints: Int {
        switch level {
        case 1: return 100
        case 2: return 300
        case 3: return 800
        case 4: return 2000
        default: return points
        }
    }

    var progress: Double {
        guard nextLevelPoints > 0 else { return 1.0 }
        let prevThreshold: Int
        switch level {
        case 2: prevThreshold = 100
        case 3: prevThreshold = 300
        case 4: prevThreshold = 800
        case 5: prevThreshold = 2000
        default: prevThreshold = 0
        }
        let range = nextLevelPoints - prevThreshold
        guard range > 0 else { return 1.0 }
        return min(1.0, Double(points - prevThreshold) / Double(range))
    }
}

// MARK: - Competition Stats (from GET /api/me/stats)

struct CompetitionStats: Codable {
    let wins: Int
    let losses: Int
    let streak: Int
    let rank: Int?
    let totalEarned: Double
    let completions: Int

    static let empty = CompetitionStats(wins: 0, losses: 0, streak: 0, rank: nil, totalEarned: 0, completions: 0)

    var winRate: Double {
        let total = wins + losses
        guard total > 0 else { return 0 }
        return Double(wins) / Double(total)
    }

    var winRateDisplay: String {
        String(format: "%.0f%%", winRate * 100)
    }
}
