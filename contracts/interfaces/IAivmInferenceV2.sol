// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAivmInferenceV2 {
    function validatorRegistry() external view returns (address);

    function requestIdByTaskId(bytes32 taskId) external view returns (uint256);
    function poiResultHashByTask(bytes32 taskId) external view returns (bytes32);
    function poiAttestationCount(bytes32 taskId) external view returns (uint64);
    function poiQuorum() external view returns (uint64);

    function requests(
        uint256 requestId
    )
        external
        view
        returns (
            address requester,
            string memory model,
            bytes32 modelDigest,
            bytes32 detConfigHash,
            bytes32 promptHash,
            bytes32 promptId,
            bytes32 taskId,
            uint256 fee,
            uint64 createdAt,
            uint64 commitDeadline,
            uint64 revealDeadline,
            uint64 finalizeDeadline,
            uint8 status,
            address worker,
            bytes32 commitment,
            uint64 committedAt,
            bytes32 responseHash,
            string memory response,
            uint64 revealedAt,
            uint64 finalizedAt
        );
}