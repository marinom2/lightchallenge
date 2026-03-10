// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/IAivmInferenceV2.sol";
import "../registry/ChallengeTaskRegistry.sol";

interface IProofVerifier {
    function verify(
        uint256 challengeId,
        address subject,
        bytes calldata proof
    ) external view returns (bool);
}

contract ChallengePayAivmPoiVerifier is Ownable, IProofVerifier {
    using Strings for uint256;

    uint8 internal constant REQUEST_STATUS_FINALIZED = 4;
    uint16 public constant RESULT_SCHEMA_V1 = 1;

    IAivmInferenceV2 public immutable aivm;
    ChallengeTaskRegistry public immutable taskRegistry;

    error InvalidOwner();
    error InvalidAivm();
    error InvalidRegistry();

    struct AivmPoiProofV1 {
        uint16 schemaVersion;
        uint256 requestId;
        bytes32 taskId;
        uint256 challengeId;
        address subject;
        bool passed;
        uint256 score;
        bytes32 evidenceHash;
        bytes32 benchmarkHash;
        bytes32 metricHash;
        uint64 evaluatedAt;
        bytes32 modelDigest;
        bytes32 paramsHash;
    }

    constructor(
        address initialOwner,
        address aivm_,
        address taskRegistry_
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidOwner();
        if (aivm_ == address(0)) revert InvalidAivm();
        if (taskRegistry_ == address(0)) revert InvalidRegistry();

        aivm = IAivmInferenceV2(aivm_);
        taskRegistry = ChallengeTaskRegistry(taskRegistry_);
    }

    function verify(
    uint256 challengeId,
    address subject,
    bytes calldata proof
) external view override returns (bool) {
    AivmPoiProofV1 memory p = abi.decode(proof, (AivmPoiProofV1));

    if (p.schemaVersion != RESULT_SCHEMA_V1) return false;
    if (p.challengeId != challengeId) return false;
    if (p.subject != subject) return false;
    if (!p.passed) return false;

    (
        uint256 boundRequestId,
        bytes32 boundTaskId,
        bytes32 boundModelDigest,
        bytes32 boundParamsHash,
        bytes32 boundBenchmarkHash,
        uint16 boundSchemaVersion,
        bool exists
    ) = taskRegistry.getBinding(challengeId, subject);

    if (!exists) return false;
    if (boundSchemaVersion != p.schemaVersion) return false;
    if (boundRequestId != p.requestId) return false;
    if (boundTaskId != p.taskId) return false;
    if (boundModelDigest != p.modelDigest) return false;
    if (boundParamsHash != p.paramsHash) return false;
    if (boundBenchmarkHash != p.benchmarkHash) return false;

    bytes32 requestModelDigest;
    bytes32 requestDetConfigHash;
    bytes32 requestTaskId;
    uint8 status;
    address worker;
    bytes32 responseHash;
    uint64 finalizedAt;

    {
        (
            ,
            ,
            requestModelDigest,
            requestDetConfigHash,
            ,
            ,
            requestTaskId,
            ,
            ,
            ,
            ,
            ,
            status,
            worker,
            ,
            ,
            responseHash,
            ,
            ,
            finalizedAt
        ) = aivm.requests(p.requestId);
    }

    if (status != REQUEST_STATUS_FINALIZED) return false;
    if (worker == address(0)) return false;
    if (finalizedAt == 0) return false;

    if (requestTaskId != p.taskId) return false;
    if (requestModelDigest != p.modelDigest) return false;
    if (requestDetConfigHash != p.paramsHash) return false;

    if (aivm.requestIdByTaskId(p.taskId) != p.requestId) return false;
    if (aivm.poiResultHashByTask(p.taskId) != responseHash) return false;

    if (aivm.poiAttestationCount(p.taskId) < aivm.poiQuorum()) return false;

    bytes32 expectedResponseHash =
        keccak256(bytes(_buildCanonicalResultString(p)));

    if (expectedResponseHash != responseHash) return false;

    return true;
}

    function previewCanonicalResultString(
        bytes calldata proof
    ) external pure returns (string memory) {
        AivmPoiProofV1 memory p = abi.decode(proof, (AivmPoiProofV1));
        return _buildCanonicalResultString(p);
    }

    function previewResponseHash(
        bytes calldata proof
    ) external pure returns (bytes32) {
        AivmPoiProofV1 memory p = abi.decode(proof, (AivmPoiProofV1));
        return keccak256(bytes(_buildCanonicalResultString(p)));
    }

    function _buildCanonicalResultString(
        AivmPoiProofV1 memory p
    ) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                "CP-AIVM-POI-V1",
                "|schemaVersion=", uint256(p.schemaVersion).toString(),
                "|requestId=", p.requestId.toString(),
                "|taskId=", _bytes32ToHex(p.taskId),
                "|challengeId=", p.challengeId.toString(),
                "|subject=", _addressToHex(p.subject),
                "|passed=", p.passed ? "1" : "0",
                "|score=", p.score.toString(),
                "|evidenceHash=", _bytes32ToHex(p.evidenceHash),
                "|benchmarkHash=", _bytes32ToHex(p.benchmarkHash),
                "|metricHash=", _bytes32ToHex(p.metricHash),
                "|evaluatedAt=", uint256(p.evaluatedAt).toString(),
                "|modelDigest=", _bytes32ToHex(p.modelDigest),
                "|paramsHash=", _bytes32ToHex(p.paramsHash)
            )
        );
    }

    function _addressToHex(address a) internal pure returns (string memory) {
        return Strings.toHexString(uint256(uint160(a)), 20);
    }

    function _bytes32ToHex(bytes32 v) internal pure returns (string memory) {
        return Strings.toHexString(uint256(v), 32);
    }
}