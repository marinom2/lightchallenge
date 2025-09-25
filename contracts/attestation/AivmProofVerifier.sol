// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IProofVerifier {
    function verify(uint256 challengeId, address subject, bytes calldata proof) external view returns (bool);
}

contract AivmProofVerifier is IProofVerifier, Ownable, EIP712 {
    using ECDSA for bytes32;

    constructor(address initialOwner) Ownable(initialOwner) EIP712("ChallengePay-AIVM", "1") {}

    mapping(address => bool) public isAivmSigner;
    event AivmSignerAdded(address signer);
    event AivmSignerRemoved(address signer);

    function addAivmSigner(address signer) external onlyOwner {
        require(signer != address(0), "zero");
        require(!isAivmSigner[signer], "exists");
        isAivmSigner[signer] = true;
        emit AivmSignerAdded(signer);
    }

    function removeAivmSigner(address signer) external onlyOwner {
        require(isAivmSigner[signer], "not-a-signer");
        delete isAivmSigner[signer];
        emit AivmSignerRemoved(signer);
    }

    bytes32 private constant INFERENCE_TYPEHASH = keccak256(
        "Inference(uint256 challengeId,address subject,uint256 chainId,address challengeContract,bytes32 paramsHash,bytes32 evidenceHash,bytes32 modelId,uint256 modelVersion,uint256 deadline,uint256 nonce)"
    );

    mapping(uint256 => mapping(uint256 => bool)) public usedNonce;

    event InferenceConsumed(
        uint256 indexed challengeId,
        address indexed subject,
        bytes32 modelId,
        uint256 modelVersion,
        bytes32 evidenceHash,
        address signer,
        uint256 nonce
    );

    function verify(
        uint256 challengeId,
        address subject,
        bytes calldata proof
    ) external view override returns (bool) {
        (
            uint256 modelVersion,
            bytes32 modelId,
            bytes32 evidenceHash,
            bytes32 paramsHash,
            uint256 deadline,
            uint256 nonce,
            bytes memory signature
        ) = abi.decode(proof, (uint256, bytes32, bytes32, bytes32, uint256, uint256, bytes));

        if (block.timestamp > deadline) return false;
        if (usedNonce[challengeId][nonce]) return false;

        bytes32 structHash = keccak256(
            abi.encode(
                INFERENCE_TYPEHASH,
                challengeId,
                subject,
                block.chainid,
                msg.sender,
                paramsHash,
                evidenceHash,
                modelId,
                modelVersion,
                deadline,
                nonce
            )
        );

        address signer = _hashTypedDataV4(structHash).recover(signature);
        if (!isAivmSigner[signer]) return false;

        return true;
    }

    function consume(
        uint256 challengeId,
        address subject,
        bytes calldata proof
    ) external returns (bool ok) {
        (
            uint256 modelVersion,
            bytes32 modelId,
            bytes32 evidenceHash,
            bytes32 paramsHash,
            uint256 deadline,
            uint256 nonce,
            bytes memory signature
        ) = abi.decode(proof, (uint256, bytes32, bytes32, bytes32, uint256, uint256, bytes));

        if (block.timestamp > deadline) return false;
        if (usedNonce[challengeId][nonce]) return false;

        bytes32 structHash = keccak256(
            abi.encode(
                INFERENCE_TYPEHASH,
                challengeId,
                subject,
                block.chainid,
                msg.sender,
                paramsHash,
                evidenceHash,
                modelId,
                modelVersion,
                deadline,
                nonce
            )
        );

        address signer = _hashTypedDataV4(structHash).recover(signature);
        if (!isAivmSigner[signer]) return false;

        usedNonce[challengeId][nonce] = true;
        emit InferenceConsumed(challengeId, subject, modelId, modelVersion, evidenceHash, signer, nonce);
        return true;
    }
}
