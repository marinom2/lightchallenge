// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal PLONK verifier interface (generator-agnostic).
interface IPlonkVerifier {
  /**
   * @dev Verifies a PLONK proof against public signals.
   * @param proof Opaque proof blob (format defined by the generator/circuit).
   * @param pubSignals Public inputs as field elements (uint256 mod p).
   * @return ok True if the proof is valid.
   */
  function verifyProof(bytes calldata proof, uint256[] calldata pubSignals) external view returns (bool ok);
}