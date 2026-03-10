// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IProofVerifier
 * @notice Base interface for proof verifiers used by ChallengePay.
 *
 * IMPORTANT:
 * - verify() is intentionally NON-VIEW to allow implementations to emit events
 *   or update internal accounting if desired.
 * - Pure/view verifiers can still implement non-view verify() and simply not write state.
 */
interface IProofVerifier is IERC165 {
  /**
   * @notice Verify an off-chain proof bound to (challengeId, subject).
   * @param challengeId Challenge identifier.
   * @param subject     The user/account the proof is about.
   * @param proof       ABI-encoded verifier-specific payload (opaque to callers).
   * @return ok         True if the proof is valid.
   */
  function verify(
    uint256 challengeId,
    address subject,
    bytes calldata proof
  ) external returns (bool ok);
}

/**
 * @title IProofVerifierEIP712
 * @notice Optional extension for EIP-712 verifiers.
 */
interface IProofVerifierEIP712 is IProofVerifier {
  function domainSeparator() external view returns (bytes32);
  function structTypehash() external pure returns (bytes32);
}

/**
 * @title IProofVerifierWithReason
 * @notice Optional extension that can explain failures in a machine-friendly way.
 */
interface IProofVerifierWithReason is IProofVerifier {
  /**
   * @return ok     True if valid.
   * @return code   Reason code (0=OK, 1=BINDING_FAIL, 2=EXPIRED, ...).
   * @return detail Arbitrary detail (e.g., modelId or attestation hash).
   */
  function verifyAndExplain(
    uint256 challengeId,
    address subject,
    bytes calldata proof
  ) external view returns (bool ok, uint8 code, bytes32 detail);
}