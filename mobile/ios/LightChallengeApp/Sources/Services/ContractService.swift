// ContractService.swift
// Typed contract interactions for ChallengePay and Treasury.

import Foundation

@MainActor
class ContractService: ObservableObject {
    static let shared = ContractService()

    private let wallet = WalletManager.shared

    // MARK: - Create Challenge

    /// Create a fitness challenge on-chain and record metadata via API.
    func createChallenge(
        params: CreateChallengeParams,
        meta: CreateChallengeMeta,
        baseURL: String
    ) async throws -> CreateChallengeResult {
        // 1. Encode the on-chain transaction
        let calldata = ABIEncoder.encodeCreateChallenge(params)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: ABIEncoder.weiToHex(params.stakeAmount)
        )

        // 2. Send via wallet
        let txHash = try await wallet.sendTransaction(tx)

        // 3. Wait for receipt and extract challenge ID
        let challengeId = try await waitForChallengeCreated(txHash: txHash)

        // 4. Save metadata to backend (with retry)
        try await saveChallengeMeta(
            baseURL: baseURL,
            challengeId: challengeId,
            txHash: txHash,
            params: params,
            meta: meta
        )

        // 5. Record creator as participant (createChallenge auto-joins on-chain
        //    but does NOT emit a Joined event, so the DB needs a manual record)
        try? await recordParticipation(
            baseURL: baseURL,
            challengeId: challengeId,
            subject: wallet.connectedAddress,
            txHash: txHash
        )

        return CreateChallengeResult(challengeId: challengeId, txHash: txHash)
    }

    // MARK: - Join Challenge

    /// Join a challenge by sending the stake amount.
    func joinChallengeNative(challengeId: UInt64, stakeWei: String, baseURL: String, inviteId: String? = nil) async throws -> String {
        let calldata = ABIEncoder.encodeJoinNative(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: ABIEncoder.weiToHex(stakeWei)
        )

        let txHash = try await wallet.sendTransaction(tx)

        // Record participation in DB (also finalizes any matching invite)
        try await recordParticipation(
            baseURL: baseURL,
            challengeId: String(challengeId),
            subject: wallet.connectedAddress,
            txHash: txHash,
            inviteId: inviteId
        )

        return txHash
    }

    // MARK: - Finalize

    func finalize(challengeId: UInt64) async throws -> String {
        let calldata = ABIEncoder.encodeFinalize(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: "0x0"
        )
        return try await wallet.sendTransaction(tx)
    }

    // MARK: - Claims

    func claimWinner(challengeId: UInt64) async throws -> String {
        let calldata = ABIEncoder.encodeClaimWinner(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: "0x0"
        )
        return try await wallet.sendTransaction(tx)
    }

    func claimLoser(challengeId: UInt64) async throws -> String {
        let calldata = ABIEncoder.encodeClaimLoser(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: "0x0"
        )
        return try await wallet.sendTransaction(tx)
    }

    func claimRefund(challengeId: UInt64) async throws -> String {
        let calldata = ABIEncoder.encodeClaimRefund(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: "0x0"
        )
        return try await wallet.sendTransaction(tx)
    }

    func treasuryClaimETH(challengeId: UInt64, amount: String) async throws -> String {
        let calldata = ABIEncoder.encodeTreasuryClaimETH(bucketId: challengeId, amount: amount)
        let tx = TransactionRequest(
            to: ContractAddresses.treasury,
            data: calldata,
            value: "0x0"
        )
        return try await wallet.sendTransaction(tx)
    }

    // MARK: - Read Calls

    /// Check if an address is a winner for a challenge.
    func isWinner(challengeId: UInt64, user: String) async throws -> Bool {
        let calldata = ABIEncoder.encodeIsWinner(challengeId: challengeId, user: user)
        let result = try await wallet.ethCall(to: ContractAddresses.challengePay, data: calldata)
        guard result.count >= 32 else { return false }
        return result[31] == 1
    }

    /// Get the user's contribution (stake) for a challenge.
    func contribOf(challengeId: UInt64, user: String) async throws -> String {
        let calldata = ABIEncoder.encodeContribOf(challengeId: challengeId, user: user)
        let result = try await wallet.ethCall(to: ContractAddresses.challengePay, data: calldata)
        guard result.count >= 32 else { return "0" }
        return decodeUint256(result.prefix(32))
    }

    /// Get ETH allowance from Treasury for a bucket.
    func ethAllowance(bucketId: UInt64, user: String) async throws -> String {
        let calldata = ABIEncoder.encodeEthAllowance(bucketId: bucketId, user: user)
        let result = try await wallet.ethCall(to: ContractAddresses.treasury, data: calldata)
        guard result.count >= 32 else { return "0" }
        return decodeUint256(result.prefix(32))
    }

    /// Read snapshot for a challenge. Returns (set, success).
    func getSnapshot(challengeId: UInt64) async throws -> (set: Bool, success: Bool) {
        let calldata = ABIEncoder.encodeGetSnapshot(challengeId: challengeId)
        let result = try await wallet.ethCall(to: ContractAddresses.challengePay, data: calldata)
        // Snapshot struct: bool set (offset 0), bool success (offset 32), ...
        guard result.count >= 64 else { return (false, false) }
        let isSet = result[31] == 1
        let isSuccess = result[63] == 1
        return (isSet, isSuccess)
    }

    /// Decode a 32-byte big-endian uint256 to decimal string.
    /// Uses UInt64 fast path when possible, falls back to manual big-number conversion.
    private func decodeUint256(_ bytes: Data) -> String {
        // Strip leading zeros to check if it fits in UInt64
        let stripped = bytes.drop(while: { $0 == 0 })
        if stripped.count <= 8 {
            let value = stripped.reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
            return String(value)
        }
        // Big number: convert bytes to decimal string via repeated division
        var hex = stripped.map { $0 }
        var digits: [UInt8] = []
        while !hex.isEmpty {
            var remainder: UInt16 = 0
            var next: [UInt8] = []
            for byte in hex {
                let val = remainder * 256 + UInt16(byte)
                let q = val / 10
                remainder = val % 10
                if !next.isEmpty || q > 0 {
                    next.append(UInt8(q))
                }
            }
            digits.append(UInt8(remainder))
            hex = next
        }
        return digits.isEmpty ? "0" : String(digits.reversed().map { Character(String($0)) })
    }

    // MARK: - Claim Eligibility

    struct ClaimEligibility {
        let canClaimWinner: Bool
        let canClaimLoser: Bool
        let canClaimRefund: Bool
        let canClaimTreasury: Bool
        let contribution: String
        let allowance: String

        var hasAnyClaim: Bool {
            canClaimWinner || canClaimLoser || canClaimRefund || canClaimTreasury
        }
    }

    /// Determine what the user can claim for a challenge.
    /// Reads on-chain snapshot to distinguish winner/loser/refund correctly.
    func checkClaimEligibility(challengeId: UInt64, user: String) async -> ClaimEligibility {
        async let winner = isWinner(challengeId: challengeId, user: user)
        async let contrib = contribOf(challengeId: challengeId, user: user)
        async let allowance = ethAllowance(bucketId: challengeId, user: user)
        async let snapshot = getSnapshot(challengeId: challengeId)

        let isWin = (try? await winner) ?? false
        let contribWei = (try? await contrib) ?? "0"
        let allowanceWei = (try? await allowance) ?? "0"
        let snap = (try? await snapshot) ?? (set: false, success: false)
        let hasContrib = contribWei != "0"
        let hasAllowance = allowanceWei != "0"

        // Claim logic:
        // - snapshot.set && isWinner  → claimWinner
        // - snapshot.set && !success  → claimRefund (challenge failed, everyone gets refund)
        // - snapshot.set && !isWinner && success → claimLoser (losers get cashback)
        // - !snapshot.set → no claims yet (finalize hasn't run)
        let finalized = snap.set
        let challengeSucceeded = snap.success

        return ClaimEligibility(
            canClaimWinner: finalized && isWin && hasContrib,
            canClaimLoser: finalized && challengeSucceeded && !isWin && hasContrib,
            canClaimRefund: finalized && !challengeSucceeded && !isWin && hasContrib,
            canClaimTreasury: hasAllowance,
            contribution: contribWei,
            allowance: allowanceWei
        )
    }

    // MARK: - Private Helpers

    private func waitForChallengeCreated(txHash: String) async throws -> String {
        // Poll for receipt
        for _ in 0..<30 {
            try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

            let receipt = try await getTransactionReceipt(txHash: txHash)
            if let logs = receipt?["logs"] as? [[String: Any]] {
                // Parse ChallengeCreated event (first topic = event signature)
                for log in logs {
                    if let topics = log["topics"] as? [String], topics.count >= 2 {
                        // Topic[1] is the indexed challengeId
                        let idHex = topics[1]
                        if let idValue = UInt64(idHex.dropFirst(2), radix: 16) {
                            return String(idValue)
                        }
                    }
                }
            }

            // Check if receipt exists but no logs (tx reverted)
            if let status = receipt?["status"] as? String, status == "0x0" {
                throw WalletError.transactionFailed("Transaction reverted")
            }
        }

        throw WalletError.transactionFailed("Receipt timeout")
    }

    private func getTransactionReceipt(txHash: String) async throws -> [String: Any]? {
        let body: [String: Any] = [
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getTransactionReceipt",
            "params": [txHash],
        ]

        guard let url = URL(string: LightChain.rpcURL) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["result"] as? [String: Any]
    }

    private func saveChallengeMeta(
        baseURL: String,
        challengeId: String,
        txHash: String,
        params: CreateChallengeParams,
        meta: CreateChallengeMeta
    ) async throws {
        guard let url = URL(string: "\(baseURL)/api/challenges") else {
            throw WalletError.transactionFailed("Invalid server URL")
        }

        let body: [String: Any] = [
            "id": challengeId,
            "title": meta.title,
            "description": meta.description ?? "",
            "subject": WalletManager.shared.connectedAddress,
            "txHash": txHash,
            "category": meta.category,
            "status": "Active",
            "tags": meta.tags,
            "modelId": meta.modelId,
            "modelHash": meta.modelHash,
            "proof": [
                "kind": "aivm",
                "modelId": meta.modelId,
                "modelHash": meta.modelHash,
                "params": meta.aivmParams,
                "paramsHash": meta.paramsHash,
                "verifierUsed": ContractAddresses.poiVerifier,
            ] as [String: Any],
            "timeline": [
                "joinClosesAt": ISO8601DateFormatter().string(from: meta.joinCloses),
                "startsAt": ISO8601DateFormatter().string(from: meta.starts),
                "endsAt": ISO8601DateFormatter().string(from: meta.ends),
                "proofDeadline": ISO8601DateFormatter().string(from: meta.proofDeadline),
            ] as [String: Any],
            "funds": [
                "stake": params.stakeAmount,
                "currency": ["type": "NATIVE", "symbol": "LCAI"],
            ] as [String: Any],
            "params": meta.rule,
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: body)

        // Retry up to 7 times with increasing delay — the server-side RPC node
        // may need time to propagate the receipt for tx-receipt auth verification.
        var lastStatusCode = 0
        var lastBody = ""
        let delays: [UInt64] = [0, 2, 5, 10, 20, 35, 55] // seconds before each attempt (~127s total)
        for attempt in 0..<delays.count {
            if delays[attempt] > 0 {
                try await Task.sleep(nanoseconds: delays[attempt] * 1_000_000_000)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 30

            let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
            request.setValue(WalletManager.shared.connectedAddress, forHTTPHeaderField: "x-lc-address")
            request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")
            request.httpBody = jsonData

            let (responseData, response) = try await URLSession.shared.data(for: request)
            let httpResponse = response as? HTTPURLResponse
            let statusCode = httpResponse?.statusCode ?? -1

            if statusCode >= 200 && statusCode < 300 {
                return // Success
            }

            lastStatusCode = statusCode
            lastBody = String(data: responseData, encoding: .utf8) ?? ""
            print("[ContractService] saveChallengeMeta attempt \(attempt + 1) failed: HTTP \(statusCode) — \(lastBody)")

            // Only retry on 401 (auth race) or 5xx (server error). 4xx other than 401 won't improve.
            if statusCode != 401 && statusCode < 500 {
                break
            }
        }

        throw WalletError.transactionFailed(
            "Challenge created on-chain (#\(challengeId)) but metadata save failed (HTTP \(lastStatusCode)). Pull to refresh later — the challenge exists on the blockchain."
        )
    }

    private func recordParticipation(
        baseURL: String,
        challengeId: String,
        subject: String,
        txHash: String,
        inviteId: String? = nil
    ) async throws {
        guard let url = URL(string: "\(baseURL)/api/challenge/\(challengeId)/participant") else { return }

        var body: [String: Any] = [
            "subject": subject,
            "txHash": txHash,
        ]
        if let inviteId, !inviteId.isEmpty {
            body["inviteId"] = inviteId
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        request.setValue(subject, forHTTPHeaderField: "x-lc-address")
        request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (responseData, response) = try await URLSession.shared.data(for: request)
        let httpResponse = response as? HTTPURLResponse
        let statusCode = httpResponse?.statusCode ?? -1
        if statusCode < 200 || statusCode >= 300 {
            let errBody = String(data: responseData, encoding: .utf8) ?? ""
            print("[ContractService] recordParticipation failed: HTTP \(statusCode) — \(errBody)")
        }
    }
}

// MARK: - Creation Meta

struct CreateChallengeMeta {
    let title: String
    let description: String?
    let category: String
    let tags: [String]
    let modelId: String
    let modelHash: String
    let aivmParams: [String: Any]
    let paramsHash: String
    let rule: [String: Any]
    let joinCloses: Date
    let starts: Date
    let ends: Date
    let proofDeadline: Date
}

struct CreateChallengeResult {
    let challengeId: String
    let txHash: String
}
