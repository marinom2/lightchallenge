// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * Treasury — bucketed, claim-based custody 
 *
 * Properties:
 * - Funds partitioned into BUCKETS (bucketId => balances).
 * - Operator can ONLY grant payouts from a bucket's available balance.
 * - Recipients claim via pull pattern (unstoppable), optional claim-to.
 * - Sweeper can only sweep truly free funds:
 *     free = onchainBalance - outstandingAllowances - totalBucketBalances
 *
 * Intended usage:
 * - ChallengePay holds ZERO funds.
 * - All deposits go into Treasury buckets (bucketId = challengeId).
 * - Validator stake deposits go into bucketId = VALIDATOR_BUCKET in ChallengePay (e.g., 1).
 * - ChallengePay is granted OPERATOR_ROLE to call grantETH/grantERC20.
 */
contract Treasury is AccessControl, ReentrancyGuard {
  using SafeERC20 for IERC20;

  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
  bytes32 public constant SWEEPER_ROLE  = keccak256("SWEEPER_ROLE");

  // ────────────────────────────────────────────────────────────────────────────
  // Bucket balances (virtual accounting backed by real on-chain balances)
  // ────────────────────────────────────────────────────────────────────────────
  mapping(uint256 => uint256) public bucketEthBalance; // bucketId => remaining allocatable ETH
  mapping(address => mapping(uint256 => uint256)) public bucketErc20Balance; // token => bucketId => remaining allocatable

  // Totals across all buckets (used for sweep safety)
  uint256 public totalBucketEthBalance;
  mapping(address => uint256) public totalBucketErc20Balance;

  // ────────────────────────────────────────────────────────────────────────────
  // Allowances are ALSO bucketed
  // bucketId => recipient => remaining allowance
  // token => bucketId => recipient => remaining allowance
  // ────────────────────────────────────────────────────────────────────────────
  mapping(uint256 => mapping(address => uint256)) public ethAllowanceOf;
  mapping(address => mapping(uint256 => mapping(address => uint256))) public allowanceOf;

  // Outstanding allowances across ALL buckets (used for sweep safety)
  uint256 public outstandingETH;
  mapping(address => uint256) public outstandingERC20;

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────
  event Received(address indexed from, uint256 amount);
  event ReceivedERC20(address indexed token, address indexed from, uint256 amount);

  event BucketCreditedETH(uint256 indexed bucketId, address indexed from, uint256 amount);
  event BucketCreditedERC20(uint256 indexed bucketId, address indexed token, address indexed from, uint256 amount);

  event GrantETH(uint256 indexed bucketId, address indexed to, uint256 amount, address operator);
  event GrantERC20(uint256 indexed bucketId, address indexed token, address indexed to, uint256 amount, address operator);

  event ReduceETH(uint256 indexed bucketId, address indexed to, uint256 amount, address operator);
  event ReduceERC20(uint256 indexed bucketId, address indexed token, address indexed to, uint256 amount, address operator);

  event ClaimedETH(uint256 indexed bucketId, address indexed to, uint256 amount);
  event ClaimedERC20(uint256 indexed bucketId, address indexed token, address indexed to, uint256 amount);

  event Swept(address indexed token, address indexed to, uint256 amount);

  // ────────────────────────────────────────────────────────────────────────────
  // Errors
  // ────────────────────────────────────────────────────────────────────────────
  error BadParams();
  error AmountZero();
  error AllowanceTooLow();
  error InsufficientBucketBalance();
  error InsufficientTreasuryBalance();
  error SweepWouldBreakReserves();
  error TaxedERC20Detected();

  constructor(address admin, address initialOperator) {
    if (admin == address(0)) revert BadParams();
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(SWEEPER_ROLE, admin);
    if (initialOperator != address(0)) _grantRole(OPERATOR_ROLE, initialOperator);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Receiving ETH (unbucketed telemetry only)
  // NOTE: Bucketed deposits should use depositETH(bucketId) for correct accounting.
  // ────────────────────────────────────────────────────────────────────────────
  receive() external payable { emit Received(msg.sender, msg.value); }
  fallback() external payable { if (msg.value > 0) emit Received(msg.sender, msg.value); }

  // ────────────────────────────────────────────────────────────────────────────
  // Bucketed deposits
  // ────────────────────────────────────────────────────────────────────────────
  function depositETH(uint256 bucketId) external payable {
    if (bucketId == 0) revert BadParams(); // 0 reserved invalid
    if (msg.value == 0) revert AmountZero();

    bucketEthBalance[bucketId] += msg.value;
    totalBucketEthBalance += msg.value;

    emit BucketCreditedETH(bucketId, msg.sender, msg.value);
  }

  function depositERC20From(uint256 bucketId, address token, address from, uint256 amount) external {
    if (from != msg.sender && !hasRole(OPERATOR_ROLE, msg.sender)) revert BadParams();
    if (bucketId == 0 || token == address(0) || from == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 balBefore = IERC20(token).balanceOf(address(this));
    IERC20(token).safeTransferFrom(from, address(this), amount);
    uint256 balAfter = IERC20(token).balanceOf(address(this));
    uint256 delta = balAfter - balBefore;

    // taxed/fee-on-transfer tokens break precise bucket accounting
    if (delta != amount) revert TaxedERC20Detected();

    bucketErc20Balance[token][bucketId] += amount;
    totalBucketErc20Balance[token] += amount;

    emit BucketCreditedERC20(bucketId, token, from, amount);
    emit ReceivedERC20(token, from, amount);
  }

  function depositERC20Permit(
    uint256 bucketId,
    address token,
    address owner,
    uint256 amount,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
  ) external {
    if (bucketId == 0 || token == address(0) || owner == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    IERC20Permit(token).permit(owner, address(this), amount, deadline, v, r, s);

    uint256 balBefore = IERC20(token).balanceOf(address(this));
    IERC20(token).safeTransferFrom(owner, address(this), amount);
    uint256 balAfter = IERC20(token).balanceOf(address(this));
    uint256 delta = balAfter - balBefore;

    if (delta != amount) revert TaxedERC20Detected();

    bucketErc20Balance[token][bucketId] += amount;
    totalBucketErc20Balance[token] += amount;

    emit BucketCreditedERC20(bucketId, token, owner, amount);
    emit ReceivedERC20(token, owner, amount);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Grants (operator-only)
  // - consume bucket balances
  // - create recipient allowances (claimable)
  // ────────────────────────────────────────────────────────────────────────────
  function grantETH(uint256 bucketId, address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
    if (bucketId == 0 || to == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 b = bucketEthBalance[bucketId];
    if (b < amount) revert InsufficientBucketBalance();

    bucketEthBalance[bucketId] = b - amount;
    totalBucketEthBalance -= amount;

    ethAllowanceOf[bucketId][to] += amount;
    outstandingETH += amount;

    emit GrantETH(bucketId, to, amount, msg.sender);
  }

  function grantERC20(uint256 bucketId, address token, address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
    if (bucketId == 0 || token == address(0) || to == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 b = bucketErc20Balance[token][bucketId];
    if (b < amount) revert InsufficientBucketBalance();

    bucketErc20Balance[token][bucketId] = b - amount;
    totalBucketErc20Balance[token] -= amount;

    allowanceOf[token][bucketId][to] += amount;
    outstandingERC20[token] += amount;

    emit GrantERC20(bucketId, token, to, amount, msg.sender);
  }

  // Operator correction (reduce allowance and return funds to bucket)
  function reduceETHAllowance(uint256 bucketId, address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
    if (bucketId == 0 || to == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 a = ethAllowanceOf[bucketId][to];
    if (a < amount) revert AllowanceTooLow();

    ethAllowanceOf[bucketId][to] = a - amount;
    outstandingETH -= amount;

    bucketEthBalance[bucketId] += amount;
    totalBucketEthBalance += amount;

    emit ReduceETH(bucketId, to, amount, msg.sender);
  }

  function reduceERC20Allowance(uint256 bucketId, address token, address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
    if (bucketId == 0 || token == address(0) || to == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 a = allowanceOf[token][bucketId][to];
    if (a < amount) revert AllowanceTooLow();

    allowanceOf[token][bucketId][to] = a - amount;
    outstandingERC20[token] -= amount;

    bucketErc20Balance[token][bucketId] += amount;
    totalBucketErc20Balance[token] += amount;

    emit ReduceERC20(bucketId, token, to, amount, msg.sender);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims (pull-based, unstoppable)
  // NOTE: claim() is keyed by (bucketId, to). UI should read allowance first.
  // ────────────────────────────────────────────────────────────────────────────
  function claimETH(uint256 bucketId, uint256 amount) external nonReentrant {
    _claimETHTo(bucketId, msg.sender, amount);
  }

  /**
   * @notice Claim ETH to a specific address. The allowance is consumed from
   * `to`'s balance, so funds always go to the correct recipient. This is
   * permissionless by design: anyone can trigger delivery of already-granted
   * funds, but cannot redirect them. This enables third-party relayers and
   * meta-transaction flows without additional authorization.
   */
  function claimETHTo(uint256 bucketId, address to, uint256 amount) external nonReentrant {
    if (to == address(0)) revert BadParams();
    _claimETHTo(bucketId, to, amount);
  }

  function _claimETHTo(uint256 bucketId, address to, uint256 amount) internal {
    if (bucketId == 0) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 a = ethAllowanceOf[bucketId][to];
    if (a < amount) revert AllowanceTooLow();

    ethAllowanceOf[bucketId][to] = a - amount;
    outstandingETH -= amount;

    (bool ok, ) = payable(to).call{value: amount}("");
    require(ok, "ETH_TRANSFER_FAILED");

    emit ClaimedETH(bucketId, to, amount);
  }

  function claimERC20(uint256 bucketId, address token, uint256 amount) external nonReentrant {
    _claimERC20To(bucketId, token, msg.sender, amount);
  }

  /**
   * @notice Claim ERC20 to a specific address. The allowance is consumed from
   * `to`'s balance, so funds always go to the correct recipient. This is
   * permissionless by design: anyone can trigger delivery of already-granted
   * funds, but cannot redirect them. This enables third-party relayers and
   * meta-transaction flows without additional authorization.
   */
  function claimERC20To(uint256 bucketId, address token, address to, uint256 amount) external nonReentrant {
    if (to == address(0)) revert BadParams();
    _claimERC20To(bucketId, token, to, amount);
  }

  function _claimERC20To(uint256 bucketId, address token, address to, uint256 amount) internal {
    if (bucketId == 0 || token == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    uint256 a = allowanceOf[token][bucketId][to];
    if (a < amount) revert AllowanceTooLow();

    allowanceOf[token][bucketId][to] = a - amount;
    outstandingERC20[token] -= amount;

    IERC20(token).safeTransfer(to, amount);
    emit ClaimedERC20(bucketId, token, to, amount);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sweep (SWEEPER_ROLE)
  // free = onchainBalance - outstandingAllowances - totalBucketBalances
  // ────────────────────────────────────────────────────────────────────────────
  function sweep(address token, address to, uint256 amount)
    external
    onlyRole(SWEEPER_ROLE)
    nonReentrant
  {
    if (to == address(0)) revert BadParams();
    if (amount == 0) revert AmountZero();

    if (token == address(0)) {
      uint256 bal = address(this).balance;
      if (bal < amount) revert InsufficientTreasuryBalance();

      uint256 free = bal - outstandingETH - totalBucketEthBalance;
      if (amount > free) revert SweepWouldBreakReserves();

      (bool ok, ) = payable(to).call{value: amount}("");
      require(ok, "ETH_SWEEP_FAILED");
    } else {
      uint256 bal = IERC20(token).balanceOf(address(this));
      if (bal < amount) revert InsufficientTreasuryBalance();

      uint256 free = bal - outstandingERC20[token] - totalBucketErc20Balance[token];
      if (amount > free) revert SweepWouldBreakReserves();

      IERC20(token).safeTransfer(to, amount);
    }

    emit Swept(token, to, amount);
  }
}