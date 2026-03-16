// ABIEncoder.swift
// Minimal Solidity ABI encoder for contract interactions.

import Foundation
import CryptoKit

enum ABIEncoder {

    // MARK: - Encode Full Call

    /// Encode a contract function call: selector + ABI-encoded parameters.
    static func encode(selector: Data, params: [ABIValue]) -> Data {
        var result = selector
        for param in params {
            result.append(param.abiEncoded)
        }
        return result
    }

    // MARK: - Encode createChallenge

    static func encodeCreateChallenge(_ p: CreateChallengeParams) -> Data {
        encode(selector: FunctionSelectors.createChallenge, params: [
            .uint8(p.kind),
            .uint8(p.currency),
            .address(p.token),
            .uint256(p.stakeAmount),
            .uint64(p.joinClosesTs),
            .uint64(p.startTs),
            .uint64(p.duration),
            .uint64(p.maxParticipants),
            .address(p.verifier),
            .uint64(p.proofDeadlineTs),
            .bytes32(p.externalId),
        ])
    }

    // MARK: - Simple uint256 calls

    static func encodeUint256Call(selector: Data, id: UInt64) -> Data {
        encode(selector: selector, params: [.uint64(id)])
    }

    static func encodeJoinNative(challengeId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.joinChallengeNative, id: challengeId)
    }

    static func encodeFinalize(challengeId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.finalize, id: challengeId)
    }

    static func encodeClaimWinner(challengeId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.claimWinner, id: challengeId)
    }

    static func encodeClaimLoser(challengeId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.claimLoser, id: challengeId)
    }

    static func encodeClaimRefund(challengeId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.claimRefund, id: challengeId)
    }

    static func encodeTreasuryClaimETH(bucketId: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.treasuryClaimETH, id: bucketId)
    }

    // MARK: - Read calls

    static func encodeGetChallenge(id: UInt64) -> Data {
        encodeUint256Call(selector: FunctionSelectors.getChallenge, id: id)
    }

    static func encodeIsWinner(challengeId: UInt64, user: String) -> Data {
        encode(selector: FunctionSelectors.isWinner, params: [
            .uint64(challengeId),
            .address(user),
        ])
    }

    static func encodeContribOf(challengeId: UInt64, user: String) -> Data {
        encode(selector: FunctionSelectors.contribOf, params: [
            .uint64(challengeId),
            .address(user),
        ])
    }

    static func encodeEthAllowance(bucketId: UInt64, user: String) -> Data {
        encode(selector: FunctionSelectors.ethAllowanceOf, params: [
            .uint64(bucketId),
            .address(user),
        ])
    }

    // MARK: - Helpers

    /// Convert wei string to hex (for tx value field).
    static func weiToHex(_ wei: String) -> String {
        guard let value = UInt64(wei) else { return "0x0" }
        return "0x" + String(value, radix: 16)
    }

    /// Convert ETH amount (e.g. "0.1") to wei string.
    static func ethToWei(_ eth: String) -> String {
        guard let amount = Double(eth) else { return "0" }
        let wei = amount * 1e18
        return String(format: "%.0f", wei)
    }
}

// MARK: - ABI Value Type

enum ABIValue {
    case uint8(UInt8)
    case uint64(UInt64)
    case uint256(String)    // Decimal string for large numbers
    case address(String)    // 0x-prefixed hex
    case bytes32(Data)      // Exactly 32 bytes
    case bool(Bool)

    /// ABI encode to 32-byte word (left-padded for integers, right-padded for bytes).
    var abiEncoded: Data {
        var word = Data(repeating: 0, count: 32)

        switch self {
        case .uint8(let v):
            word[31] = v

        case .uint64(let v):
            let bytes = withUnsafeBytes(of: v.bigEndian) { Data($0) }
            word.replaceSubrange(24..<32, with: bytes)

        case .uint256(let decimalString):
            // Parse decimal string to big-endian bytes
            let bytes = decimalStringToBytes(decimalString)
            let start = 32 - bytes.count
            if start >= 0 && !bytes.isEmpty {
                word.replaceSubrange(start..<(start + bytes.count), with: bytes)
            }

        case .address(let hex):
            let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
            if let addrData = Data(hexString: clean) {
                let start = 32 - addrData.count
                word.replaceSubrange(start..<32, with: addrData)
            }

        case .bytes32(let data):
            let len = min(data.count, 32)
            word.replaceSubrange(0..<len, with: data.prefix(32))

        case .bool(let v):
            word[31] = v ? 1 : 0
        }

        return word
    }
}

// MARK: - Decimal String to Big-Endian Bytes

private func decimalStringToBytes(_ decimal: String) -> Data {
    guard !decimal.isEmpty else { return Data([0]) }

    // Simple approach: convert decimal to hex via UInt64 if it fits
    if let value = UInt64(decimal) {
        if value == 0 { return Data([0]) }
        var bytes = withUnsafeBytes(of: value.bigEndian) { Data($0) }
        // Strip leading zeros
        while bytes.count > 1 && bytes.first == 0 {
            bytes.removeFirst()
        }
        return bytes
    }

    // For very large numbers, do manual decimal-to-binary conversion
    var result = [UInt8]()
    var digits = Array(decimal).compactMap { $0.wholeNumberValue }
    while !digits.isEmpty && !(digits.count == 1 && digits[0] == 0) {
        var remainder = 0
        var newDigits = [Int]()
        for digit in digits {
            let current = remainder * 10 + digit
            newDigits.append(current / 256)
            remainder = current % 256
        }
        result.insert(UInt8(remainder), at: 0)
        // Strip leading zeros from newDigits
        while newDigits.first == 0 { newDigits.removeFirst() }
        digits = newDigits
    }

    return Data(result.isEmpty ? [0] : result)
}

// MARK: - Data Hex Extension

extension Data {
    init?(hexString: String) {
        let hex = hexString.hasPrefix("0x") ? String(hexString.dropFirst(2)) : hexString
        guard hex.count % 2 == 0 else { return nil }

        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }

    var hexString: String {
        "0x" + map { String(format: "%02x", $0) }.joined()
    }
}
