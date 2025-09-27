// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IProofVerifier } from "../IProofVerifier.sol"; // ✅ single source of truth

/// @notice Verifies EIP-712 signed inference payloads from approved AIVM signers.
contract AivmProofVerifier is Ownable, IProofVerifier {
    using ECDSA for bytes32;

    // domain separator data
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant TYPEHASH = keccak256(
        "Inference(address user,uint256 challengeId,bytes32 modelId,uint256 modelVersion,bytes payload)"
    );

    mapping(address => bool) public isAivmSigner;

    event AivmSignerUpdated(address signer, bool allowed);

    constructor(
        string memory name,
        string memory version,
        uint256 chainId
    ) Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                address(this)
            )
        );
    }

    function setAivmSigner(address signer, bool allowed) external onlyOwner {
        isAivmSigner[signer] = allowed;
        emit AivmSignerUpdated(signer, allowed);
    }

    /// @notice IProofVerifier entrypoint used by ChallengePay
    /// @dev view is fine; interface expects external that returns bool.
    function verify(
        uint256 challengeId,
        address user,
        bytes calldata proof // abi-encoded (modelId, modelVersion, payload, signature)
    ) external view override returns (bool) {
        (bytes32 modelId, uint256 modelVersion, bytes memory payload, bytes memory sig) =
            abi.decode(proof, (bytes32, uint256, bytes, bytes));

        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH, user, challengeId, modelId, modelVersion, keccak256(payload))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ECDSA.recover(digest, sig);
        return isAivmSigner[signer];
    }
}