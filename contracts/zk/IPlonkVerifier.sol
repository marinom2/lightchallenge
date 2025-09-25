// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal PLONK verifier interface used by many generators (snarkjs/aztec/zkSync-style).
interface IPlonkVerifier {
    /// @notice Verifies a PLONK proof against public signals.
    /// @param proof Opaque proof blob (format defined by the generator).
    /// @param pubSignals Public inputs as field elements (uint256 mod p).
    /// @return ok True if the proof is valid.
    function verifyProof(bytes calldata proof, uint256[] calldata pubSignals) external view returns (bool ok);
}