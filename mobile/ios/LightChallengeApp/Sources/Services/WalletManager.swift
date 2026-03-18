// WalletManager.swift
// Wallet connection via Reown AppKit (WalletConnect v2).
// One-tap flow: user taps wallet → confirms in wallet app → redirected back connected.

import Foundation
import SwiftUI
import UIKit
import Combine
import CryptoKit
import ReownAppKit

// MARK: - Native WebSocket Factory (no Starscream dependency)

struct NativeSocketFactory: WebSocketFactory {
    func create(with url: URL) -> WebSocketConnecting {
        NativeWebSocket(url: url)
    }
}

class NativeWebSocket: NSObject, WebSocketConnecting, URLSessionWebSocketDelegate {
    var isConnected = false
    var onConnect: (() -> Void)?
    var onDisconnect: ((Error?) -> Void)?
    var onText: ((String) -> Void)?
    var request: URLRequest

    private var task: URLSessionWebSocketTask?
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    }()

    init(url: URL) {
        self.request = URLRequest(url: url)
        super.init()
    }

    func connect() {
        task = session.webSocketTask(with: request)
        task?.resume()
        listenForMessages()
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        isConnected = false
        onDisconnect?(nil)
    }

    func write(string: String, completion: (() -> Void)?) {
        task?.send(.string(string)) { _ in
            completion?()
        }
    }

    private func listenForMessages() {
        task?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.onText?(text)
                default:
                    break
                }
                self?.listenForMessages()
            case .failure:
                break
            }
        }
    }

    // URLSessionWebSocketDelegate
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        isConnected = true
        onConnect?()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        isConnected = false
        onDisconnect?(nil)
    }
}

// MARK: - Minimal CryptoProvider (dapp-side, no signature verification needed)

struct LCCryptoProvider: CryptoProvider {
    func recoverPubKey(signature: EthereumSignature, message: Data) throws -> Data {
        // Dapps don't verify signatures — wallet handles signing
        throw WalletError.transactionFailed("Signature recovery not supported in dapp mode")
    }

    func keccak256(_ data: Data) -> Data {
        // CryptoKit doesn't have keccak256; this is only called for EIP-55 checksums
        // and auth (SIWE) which we don't use. Return SHA256 as a safe fallback.
        let hash = SHA256.hash(data: data)
        return Data(hash)
    }
}

// MARK: - Wallet Manager

@MainActor
class WalletManager: ObservableObject {
    static let shared = WalletManager()

    @Published var isConnected = false
    @Published var connectedAddress: String = ""
    @Published var connectedChainId: Int? = nil
    @Published var isConnecting = false
    @Published var error: String?

    /// True when wallet is connected but on a different chain than LightChain.
    var isWrongNetwork: Bool {
        guard isConnected, let chain = connectedChainId else { return false }
        return chain != LightChain.chainId
    }

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Configure AppKit (call once on launch)

    func configure() {
        let redirect = try? AppMetadata.Redirect(
            native: "lightchallengeapp://wc",
            universal: "https://uat.lightchallenge.app/wc"
        )

        let metadata = AppMetadata(
            name: "LightChallenge",
            description: "Stake. Prove. Earn. Fitness challenges on LightChain.",
            url: "https://uat.lightchallenge.app",
            icons: ["https://uat.lightchallenge.app/icon-192.png"],
            redirect: redirect ?? (try! AppMetadata.Redirect(native: "lightchallengeapp://wc", universal: nil))
        )

        let methods: Set<String> = ["eth_sendTransaction", "personal_sign", "eth_signTypedData"]
        let events: Set<String> = ["chainChanged", "accountsChanged"]
        let lightchain = Blockchain("eip155:\(LightChain.chainId)")!

        let sessionParams = SessionParams(
            namespaces: [
                "eip155": ProposalNamespace(
                    chains: [lightchain],
                    methods: methods,
                    events: events
                )
            ]
        )

        Networking.configure(
            groupIdentifier: "group.io.lightchallenge.app",
            projectId: LightChain.walletConnectProjectId,
            socketFactory: NativeSocketFactory()
        )

        AppKit.configure(
            projectId: LightChain.walletConnectProjectId,
            metadata: metadata,
            crypto: LCCryptoProvider(),
            sessionParams: sessionParams,
            authRequestParams: nil
        )

        subscribeToEvents()
        restoreSession()
    }

    // MARK: - Subscribe to WalletConnect Events

    private func subscribeToEvents() {
        // Session settled (new connection approved)
        AppKit.instance.sessionSettlePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] session in
                self?.handleSession(session)
            }
            .store(in: &cancellables)

        // Session rejected (wallet declined or doesn't support LightChain)
        AppKit.instance.sessionRejectionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (_, reason) in
                self?.isConnecting = false
                let msg = reason.message.lowercased()
                if msg.contains("chain") || msg.contains("namespace") || msg.contains("unsupported") {
                    self?.error = "Your wallet doesn't have LightChain Testnet (Chain \(LightChain.chainId)). Add it first:\n\nRPC: \(LightChain.rpcURL)\nChain ID: \(LightChain.chainId)\nSymbol: \(LightChain.symbol)"
                } else {
                    self?.error = "Connection declined: \(reason.message)"
                }
            }
            .store(in: &cancellables)

        // Session deleted (disconnected)
        AppKit.instance.sessionDeletePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.isConnected = false
                self?.connectedAddress = ""
                self?.isConnecting = false
            }
            .store(in: &cancellables)

        // Sessions changed
        AppKit.instance.sessionsPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] sessions in
                if sessions.isEmpty {
                    self?.isConnected = false
                    self?.connectedAddress = ""
                } else if let session = sessions.first {
                    self?.handleSession(session)
                }
            }
            .store(in: &cancellables)
    }

    private func handleSession(_ session: Session) {
        // Prefer account on LightChain; fall back to first available
        let lcAccount = session.accounts.first {
            $0.blockchain.reference == String(LightChain.chainId)
        }
        let account = lcAccount ?? session.accounts.first
        guard let account else { return }

        connectedAddress = account.address.lowercased()
        connectedChainId = Int(account.blockchain.reference)
        isConnected = true
        isConnecting = false
        error = nil
    }

    // MARK: - Restore Existing Session

    private func restoreSession() {
        let sessions = AppKit.instance.getSessions()
        if let session = sessions.first {
            handleSession(session)
        }
    }

    // MARK: - Connect (presents AppKit modal with wallet list)

    /// Opens the AppKit modal which shows installed wallets + QR code.
    /// User taps a wallet, confirms in the wallet app, and gets redirected back connected.
    func connect() {
        isConnecting = true
        error = nil
        AppKit.present()
    }

    /// Connect with a known address (manual entry fallback).
    func connectManually(address: String) {
        let addr = address.lowercased()
        connectedAddress = addr
        isConnected = true
    }

    // MARK: - Disconnect

    func disconnect() async {
        let sessions = AppKit.instance.getSessions()
        for session in sessions {
            try? await AppKit.instance.disconnect(topic: session.topic)
        }
        isConnected = false
        connectedAddress = ""
        connectedChainId = nil
    }

    /// Opens the wallet app so the user can switch to LightChain manually.
    func openWalletToSwitchNetwork() {
        AppKit.instance.launchCurrentWallet()
    }

    // MARK: - Handle Deep Link (wallet redirect back)

    func handleDeepLink(_ url: URL) {
        AppKit.instance.handleDeeplink(url)
    }

    // MARK: - Send Transaction

    func sendTransaction(_ tx: TransactionRequest) async throws -> String {
        guard isConnected else {
            throw WalletError.notConnected
        }

        // Estimate gas via direct RPC (MetaMask on custom chains may fail without it)
        let estimatedGas = try await estimateGas(tx: tx)

        // Fetch gas price — LightChain uses legacy gas pricing (no EIP-1559).
        // Without an explicit gasPrice, MetaMask fails on custom chains with
        // "Cannot convert undefined value to object" because it can't auto-detect
        // the gas pricing model.
        let gasPrice = try await fetchGasPrice()

        // Build transaction object with all required fields explicit.
        // eth_sendTransaction JSON-RPC spec requires params as an array: [{txObj}].
        // The W3MJSONRPC helper sends params as a flat dict which some wallets reject,
        // so we construct the Request directly.
        let txObj: [String: String] = [
            "from": connectedAddress,
            "to": tx.to,
            "value": tx.value,
            "data": tx.data.hexString,
            "gasLimit": estimatedGas,
            "gasPrice": gasPrice,
        ]

        let sessions = AppKit.instance.getSessions()
        guard let session = sessions.first else {
            throw WalletError.notConnected
        }

        guard let blockchain = Blockchain("eip155:\(LightChain.chainId)") else {
            throw WalletError.transactionFailed("Invalid chain configuration")
        }

        let wcRequest = try Request(
            topic: session.topic,
            method: "eth_sendTransaction",
            params: AnyCodable([txObj]),
            chainId: blockchain
        )

        // Open the wallet app for user confirmation
        AppKit.instance.launchCurrentWallet()

        // Send the request via WalletConnect
        try await AppKit.instance.request(params: wcRequest)

        // Wait for the response via publisher
        return try await withCheckedThrowingContinuation { continuation in
            AppKit.instance.sessionResponsePublisher
                .first()
                .receive(on: DispatchQueue.main)
                .sink { response in
                    switch response.result {
                    case .response(let value):
                        if let hash = try? value.get(String.self) {
                            continuation.resume(returning: hash)
                        } else {
                            continuation.resume(throwing: WalletError.transactionFailed("No hash in response"))
                        }
                    case .error(let rpcError):
                        continuation.resume(throwing: WalletError.transactionFailed(rpcError.message))
                    }
                }
                .store(in: &self.cancellables)
        }
    }

    /// Estimate gas for a transaction via direct RPC to LightChain.
    private func estimateGas(tx: TransactionRequest) async throws -> String {
        let callBody: [String: Any] = [
            "jsonrpc": "2.0",
            "id": Int(Date().timeIntervalSince1970),
            "method": "eth_estimateGas",
            "params": [
                [
                    "from": connectedAddress,
                    "to": tx.to,
                    "data": tx.data.hexString,
                    "value": tx.value,
                ] as [String: Any]
            ],
        ]

        guard let url = URL(string: LightChain.rpcURL) else {
            return "0x100000" // 1M gas fallback
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: callBody)

        let (responseData, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any]

        if let error = json?["error"] as? [String: Any],
           let message = error["message"] as? String {
            throw WalletError.simulationFailed(message)
        }

        guard let gasHex = json?["result"] as? String else {
            return "0x100000" // 1M gas fallback
        }

        // Add 20% buffer to estimated gas
        if let gas = UInt64(gasHex.dropFirst(2), radix: 16) {
            let buffered = gas + gas / 5
            return "0x" + String(buffered, radix: 16)
        }

        return gasHex
    }

    /// Fetch current gas price from LightChain RPC.
    private func fetchGasPrice() async throws -> String {
        let callBody: [String: Any] = [
            "jsonrpc": "2.0",
            "id": Int(Date().timeIntervalSince1970),
            "method": "eth_gasPrice",
            "params": [] as [Any],
        ]

        guard let url = URL(string: LightChain.rpcURL) else {
            return "0x3b9aca00" // 1 gwei fallback
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: callBody)

        let (responseData, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any]

        guard let gasPrice = json?["result"] as? String else {
            return "0x3b9aca00" // 1 gwei fallback
        }

        return gasPrice
    }

    // MARK: - Read-Only RPC (no wallet needed)

    func ethCall(to: String, data: Data) async throws -> Data {
        let callBody: [String: Any] = [
            "jsonrpc": "2.0",
            "id": Int(Date().timeIntervalSince1970),
            "method": "eth_call",
            "params": [
                ["to": to, "data": data.hexString],
                "latest",
            ],
        ]

        guard let url = URL(string: LightChain.rpcURL) else {
            throw WalletError.invalidRPC
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: callBody)

        let (responseData, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any]

        if let error = json?["error"] as? [String: Any],
           let message = error["message"] as? String {
            throw WalletError.rpcError(message)
        }

        guard let resultHex = json?["result"] as? String,
              let resultData = Data(hexString: resultHex) else {
            return Data()
        }

        return resultData
    }
}

// MARK: - Errors

enum WalletError: LocalizedError {
    case notConnected
    case transactionFailed(String)
    case invalidRPC
    case rpcError(String)
    case simulationFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: "Wallet not connected"
        case .transactionFailed(let msg): "Transaction failed: \(msg)"
        case .invalidRPC: "Invalid RPC URL"
        case .rpcError(let msg): "RPC error: \(msg)"
        case .simulationFailed(let msg): "Simulation failed: \(msg)"
        }
    }
}
