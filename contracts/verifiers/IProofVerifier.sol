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
 *
 * Active implementation: ChallengePayAivmPoiVerifier (AIVM PoI verification).
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
