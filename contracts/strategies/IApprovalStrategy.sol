// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IApprovalStrategy {
  function onCreate(
    uint256 id,
    address challenger,
    address token,
    uint8 currency,     // 0 = NATIVE, 1 = ERC20 (match ChallengePay.Currency)
    uint256 startTs,
    uint256 duration,
    bytes calldata data
  ) external returns (bool allow, bool autoApprove);
}