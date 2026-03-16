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

        // 4. Save metadata to backend
        try await saveChallengeMeta(
            baseURL: baseURL,
            challengeId: challengeId,
            txHash: txHash,
            params: params,
            meta: meta
        )

        return CreateChallengeResult(challengeId: challengeId, txHash: txHash)
    }

    // MARK: - Join Challenge

    /// Join a challenge by sending the stake amount.
    func joinChallengeNative(challengeId: UInt64, stakeWei: String, baseURL: String) async throws -> String {
        let calldata = ABIEncoder.encodeJoinNative(challengeId: challengeId)
        let tx = TransactionRequest(
            to: ContractAddresses.challengePay,
            data: calldata,
            value: ABIEncoder.weiToHex(stakeWei)
        )

        let txHash = try await wallet.sendTransaction(tx)

        // Record participation in DB
        try await recordParticipation(
            baseURL: baseURL,
            challengeId: String(challengeId),
            subject: wallet.connectedAddress,
            txHash: txHash
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

    func treasuryClaimETH(challengeId: UInt64) async throws -> String {
        let calldata = ABIEncoder.encodeTreasuryClaimETH(bucketId: challengeId)
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
        // Decode uint256 from big-endian bytes
        let value = result.prefix(32).reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        return String(value)
    }

    /// Get ETH allowance from Treasury for a bucket.
    func ethAllowance(bucketId: UInt64, user: String) async throws -> String {
        let calldata = ABIEncoder.encodeEthAllowance(bucketId: bucketId, user: user)
        let result = try await wallet.ethCall(to: ContractAddresses.treasury, data: calldata)
        guard result.count >= 32 else { return "0" }
        let value = result.prefix(32).reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        return String(value)
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
    func checkClaimEligibility(challengeId: UInt64, user: String) async -> ClaimEligibility {
        async let winner = isWinner(challengeId: challengeId, user: user)
        async let contrib = contribOf(challengeId: challengeId, user: user)
        async let allowance = ethAllowance(bucketId: challengeId, user: user)

        let isWin = (try? await winner) ?? false
        let contribWei = (try? await contrib) ?? "0"
        let allowanceWei = (try? await allowance) ?? "0"
        let hasContrib = contribWei != "0"
        let hasAllowance = allowanceWei != "0"

        return ClaimEligibility(
            canClaimWinner: isWin && hasContrib,
            canClaimLoser: !isWin && hasContrib,
            canClaimRefund: hasContrib,  // Only valid if status=Canceled
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
        guard let url = URL(string: "\(baseURL)/api/challenges") else { return }

        let body: [String: Any] = [
            "id": challengeId,
            "title": meta.title,
            "description": meta.description ?? "",
            "subject": WalletManager.shared.connectedAddress,
            "txHash": txHash,
            "category": "fitness",
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
            ],
            "timeline": [
                "joinClosesAt": ISO8601DateFormatter().string(from: meta.joinCloses),
                "startsAt": ISO8601DateFormatter().string(from: meta.starts),
                "endsAt": ISO8601DateFormatter().string(from: meta.ends),
                "proofDeadline": ISO8601DateFormatter().string(from: meta.proofDeadline),
            ],
            "funds": [
                "stake": params.stakeAmount,
                "currency": ["type": "NATIVE", "symbol": "LCAI"],
            ],
            "params": meta.rule,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add wallet auth headers
        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        request.setValue(WalletManager.shared.connectedAddress, forHTTPHeaderField: "x-lc-address")
        request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)
        let httpResponse = response as? HTTPURLResponse
        guard let status = httpResponse?.statusCode, status >= 200, status < 300 else {
            // Non-fatal: on-chain creation succeeded, metadata save is best-effort
            return
        }
    }

    private func recordParticipation(
        baseURL: String,
        challengeId: String,
        subject: String,
        txHash: String
    ) async throws {
        guard let url = URL(string: "\(baseURL)/api/challenge/\(challengeId)/participant") else { return }

        let body: [String: Any] = [
            "subject": subject,
            "txHash": txHash,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        request.setValue(subject, forHTTPHeaderField: "x-lc-address")
        request.setValue(timestamp, forHTTPHeaderField: "x-lc-timestamp")

        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await URLSession.shared.data(for: request)
    }
}

// MARK: - Creation Meta

struct CreateChallengeMeta {
    let title: String
    let description: String?
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
