// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProofVerifier {
  function verify(uint256 challengeId, address subject, bytes calldata proof) external returns (bool);
}