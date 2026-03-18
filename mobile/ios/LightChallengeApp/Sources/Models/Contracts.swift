// Contracts.swift
// Chain configuration, contract addresses, and ABI constants.

import Foundation

// MARK: - Chain Configuration

enum LightChain {
    static let chainId: Int = 504
    static let chainName = "LightChain Testnet"
    static let rpcURL = "https://light-testnet-rpc.lightchain.ai"
    static let explorerURL = "https://testnet.lightscan.app"
    static let symbol = "LCAI"
    static let currencyDecimals = 18

    /// WalletConnect project ID (shared with webapp).
    static let walletConnectProjectId = "1e01f2c06b5099a438c24fae3379ea57"
}

// MARK: - Deployed Contract Addresses

enum ContractAddresses {
    static let challengePay = "0xBeA3b508a5Ce2E6C8462108f42c732Da7454c5cb"
    static let treasury = "0xe84c197614d4fAAE1CdA8d6067fFe43befD9e961"
    static let metadataRegistry = "0xe9bAA8c04cd77d06A736fc987cC13348DfF0bfAb"
    static let challengeTaskRegistry = "0x0e079C693Bd177Fa31baab70EfCD5b9D625c355E"
    static let poiVerifier = "0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123"
    static let eventRouter = "0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D"
    static let trustedForwarder = "0xedF522094Ce3F497BEAA9f730d15a7dd554CaB4d"
    static let aivmInferenceV2 = "0x2d499C52312ca8F0AD3B7A53248113941650bA7E"
    static let protocol_ = "0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217"
}

// MARK: - Challenge Kind IDs (matches Solidity uint8)

enum ChallengeKindId: UInt8, CaseIterable {
    case steps = 1
    case running = 2
    case dota = 3
    case cycling = 4
    case hiking = 5
    case swimming = 6
    case lol = 7
    case cs2 = 8
    case fitnessGeneral = 9
    case gamingGeneral = 10

    var label: String {
        switch self {
        case .steps: "Steps"
        case .running: "Running"
        case .dota: "Dota 2"
        case .cycling: "Cycling"
        case .hiking: "Hiking"
        case .swimming: "Swimming"
        case .lol: "League of Legends"
        case .cs2: "CS2"
        case .fitnessGeneral: "Fitness"
        case .gamingGeneral: "Gaming"
        }
    }

    var isFitness: Bool {
        switch self {
        case .steps, .running, .cycling, .hiking, .swimming, .fitnessGeneral: true
        default: false
        }
    }
}

// MARK: - Currency Enum (matches Solidity)

enum CurrencyType: UInt8 {
    case native = 0
    case erc20 = 1
}

// MARK: - Hardcoded Function Selectors

/// Pre-computed keccak256 function selectors for ChallengePay and Treasury.
/// These are the first 4 bytes of keccak256(function_signature).
/// Verified against compiled Hardhat artifacts on 2026-03-18.
enum FunctionSelectors {
    // ChallengePay
    // createChallenge((uint8,uint8,address,uint256,uint256,uint256,uint256,uint256,address,uint256,bytes32))
    static let createChallenge = Data([0xbe, 0x96, 0xec, 0xaa])
    // joinChallengeNative(uint256)
    static let joinChallengeNative = Data([0x58, 0x1f, 0xa0, 0x2e])
    // finalize(uint256)
    static let finalize = Data([0x05, 0x26, 0x1a, 0xea])
    // claimWinner(uint256)
    static let claimWinner = Data([0xc3, 0x88, 0x7a, 0xd7])
    // claimLoser(uint256)
    static let claimLoser = Data([0x06, 0xb2, 0x81, 0x41])
    // claimRefund(uint256)
    static let claimRefund = Data([0x5b, 0x7b, 0xaf, 0x64])
    // getChallenge(uint256)
    static let getChallenge = Data([0x1b, 0xdd, 0x4b, 0x74])
    // contribOf(uint256,address)
    static let contribOf = Data([0xdf, 0x3b, 0x1a, 0x51])
    // isWinner(uint256,address)
    static let isWinner = Data([0xbd, 0xd4, 0x15, 0xaf])

    // Treasury
    // claimETH(uint256,uint256)
    static let treasuryClaimETH = Data([0x29, 0x8a, 0x7b, 0x2e])
    // ethAllowanceOf(uint256,address)
    static let ethAllowanceOf = Data([0x3d, 0xe6, 0x14, 0x7a])
}

// MARK: - Create Params

/// Mirrors the Solidity CreateParams struct.
struct CreateChallengeParams {
    let kind: UInt8
    let currency: UInt8
    let token: String           // address (0x0 for native)
    let stakeAmount: String     // wei string
    let joinClosesTs: UInt64
    let startTs: UInt64
    let duration: UInt64        // seconds
    let maxParticipants: UInt64
    let verifier: String        // address
    let proofDeadlineTs: UInt64
    let externalId: Data        // 32 bytes

    static let zeroAddress = "0x0000000000000000000000000000000000000000"
    static let zeroBytes32 = Data(repeating: 0, count: 32)
}

// MARK: - Transaction Request

struct TransactionRequest {
    let to: String
    let data: Data
    let value: String  // hex wei
}
