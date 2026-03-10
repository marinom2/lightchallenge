// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProofVerifier} from "../verifiers/IProofVerifier.sol";

interface IPlonkVerifier {
    function verifyProof(uint256[24] calldata proof, uint256[2] calldata pubSignals) external view returns (bool);
}

/// @title PlonkProofVerifierAdapter
/// @notice MIT-licensed adapter that bridges ChallengePay's IProofVerifier to a snarkJS PlonkVerifier (GPL).
/// @dev Expects proof encoding = abi.encode(uint256[24] proof, uint256[2] pubSignals)
contract PlonkProofVerifierAdapter is IProofVerifier {
    IPlonkVerifier public immutable plonk;

    constructor(address plonkVerifier) {
        require(plonkVerifier != address(0), "verifier=0");
        plonk = IPlonkVerifier(plonkVerifier);
    }

    /// @inheritdoc IProofVerifier
    function verify(
        uint256 /*challengeId*/,
        address /*subject*/,
        bytes calldata proof
    ) external override returns (bool ok) {
        (uint256[24] memory p, uint256[2] memory pub) = abi.decode(proof, (uint256[24], uint256[2]));
        // NOTE: Bindings to (challengeId, subject) should be enforced inside the circuit and thus in pubSignals.
        return plonk.verifyProof(p, pub);
    }

    // IERC165 passthrough (IProofVerifier already inherits IERC165)
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IProofVerifier).interfaceId || interfaceId == 0x01ffc9a7;
    }
}