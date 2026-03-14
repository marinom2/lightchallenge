// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {IProofVerifier} from "./verifiers/IProofVerifier.sol";

interface ITreasury {
  function depositETH(uint256 bucketId) external payable;
  function depositERC20From(uint256 bucketId, address token, address from, uint256 amount) external;
  function depositERC20Permit(
    uint256 bucketId,
    address token,
    address owner,
    uint256 amount,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
  ) external;

  function grantETH(uint256 bucketId, address to, uint256 amount) external;
  function grantERC20(uint256 bucketId, address token, address to, uint256 amount) external;
}

/**
 * @title ChallengePay — LightChallenge V1 (Final Pre-Production)
 *
 * Challenge dapp where users create challenges, join, get verified through
 * Lightchain AIVM + PoI, finalize outcomes, and get paid safely.
 *
 * All funds are held in Treasury buckets (ChallengePay holds zero funds).
 * Claims are pull-based via Treasury allowances.
 *
 * Status lifecycle: Active → Finalized | Canceled
 * Outcome model: None | Success | Fail
 */
contract ChallengePay is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ────────────────────────────────────────────────────────────────────────────
  // Errors
  // ────────────────────────────────────────────────────────────────────────────
  error ZeroAddress();
  error AmountZero();
  error WrongMsgValue();
  error ChallengePaused();
  error NotAdmin();
  error NotPendingAdmin();
  error InvalidBounds();
  error LeadTimeOutOfBounds();
  error StartTooSoon();
  error DeadlineRequired();
  error ProofDeadlineBeforeEnd();
  error JoinClosesAfterStart();
  error TokenNotAllowed();
  error ExternalIdAlreadyUsed();
  error NotCreatorOrAdmin();
  error NotActive();
  error AlreadyCanceled();
  error JoinWindowClosed();
  error MaxParticipantsReached();
  error ProofNotOpen();
  error ProofWindowClosed();
  error NotEligible();
  error AlreadyWinner();
  error AlreadyFinalized();
  error BeforeDeadline();
  error TightenOnlyViolation();
  error GlobalPausedError();
  error ChallengeNotFinalized();

  // ────────────────────────────────────────────────────────────────────────────
  // Enums
  // ────────────────────────────────────────────────────────────────────────────
  enum Status   { Active, Finalized, Canceled }
  enum Outcome  { None, Success, Fail }
  enum Currency { NATIVE, ERC20 }

  // ────────────────────────────────────────────────────────────────────────────
  // Immutables
  // ────────────────────────────────────────────────────────────────────────────
  address public immutable treasury;
  address public immutable protocol;

  // ────────────────────────────────────────────────────────────────────────────
  // Admin (2-step transfer)
  // ────────────────────────────────────────────────────────────────────────────
  address public admin;
  address public pendingAdmin;
  bool public globalPaused;

  event GlobalPaused(bool paused);
  event AdminTransferStarted(address indexed oldAdmin, address indexed newPendingAdmin);
  event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);

  modifier onlyAdmin() {
    if (msg.sender != admin) revert NotAdmin();
    _;
  }

  modifier notPaused() {
    if (globalPaused) revert GlobalPausedError();
    _;
  }

  function transferAdmin(address newPendingAdmin) external onlyAdmin {
    if (newPendingAdmin == address(0)) revert ZeroAddress();
    pendingAdmin = newPendingAdmin;
    emit AdminTransferStarted(admin, newPendingAdmin);
  }

  function acceptAdmin() external {
    if (msg.sender != pendingAdmin) revert NotPendingAdmin();
    emit AdminTransferAccepted(admin, msg.sender);
    admin = msg.sender;
    pendingAdmin = address(0);
  }

  function pauseAll(bool paused) external onlyAdmin {
    globalPaused = paused;
    emit GlobalPaused(paused);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-2771 trusted forwarder
  // ────────────────────────────────────────────────────────────────────────────
  address public trustedForwarder;
  event TrustedForwarderSet(address indexed forwarder);

  function setTrustedForwarder(address fwd) external onlyAdmin {
    trustedForwarder = fwd;
    emit TrustedForwarderSet(fwd);
  }

  function isTrustedForwarder(address fwd) public view returns (bool) {
    return fwd != address(0) && fwd == trustedForwarder;
  }

  function _msgSender2771() internal view returns (address sender) {
    if (isTrustedForwarder(msg.sender) && msg.data.length >= 20) {
      assembly { sender := shr(96, calldataload(sub(calldatasize(), 20))) }
    } else {
      sender = msg.sender;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Global config
  // ────────────────────────────────────────────────────────────────────────────
  mapping(address => bool) public allowedToken;
  bool public useTokenAllowlist;
  uint256 public minLeadTime;
  uint256 public maxLeadTime;
  bool public proofTightenOnly;

  // Creator allowlist (optional gate for who can create challenges)
  mapping(address => bool) public creatorAllowed;
  bool public useCreatorAllowlist;

  event TokenAllowlistSet(bool enabled);
  event TokenAllowed(address indexed token, bool allowed);
  event LeadTimeBoundsSet(uint256 minLeadTime, uint256 maxLeadTime);
  event ProofTightenOnlySet(bool enabled);
  event CreatorAllowlistSet(bool enabled);
  event CreatorAllowed(address indexed creator, bool allowed);

  function setUseTokenAllowlist(bool enabled) external onlyAdmin {
    useTokenAllowlist = enabled;
    emit TokenAllowlistSet(enabled);
  }

  function setTokenAllowed(address token, bool allowed) external onlyAdmin {
    if (token == address(0)) revert ZeroAddress();
    allowedToken[token] = allowed;
    emit TokenAllowed(token, allowed);
  }

  function setLeadTimeBounds(uint256 minSec, uint256 maxSec) external onlyAdmin {
    if (minSec > maxSec) revert InvalidBounds();
    minLeadTime = minSec;
    maxLeadTime = maxSec;
    emit LeadTimeBoundsSet(minSec, maxSec);
  }

  function setProofTightenOnly(bool enabled) external onlyAdmin {
    proofTightenOnly = enabled;
    emit ProofTightenOnlySet(enabled);
  }

  function setUseCreatorAllowlist(bool enabled) external onlyAdmin {
    useCreatorAllowlist = enabled;
    emit CreatorAllowlistSet(enabled);
  }

  function setCreatorAllowed(address creator, bool allowed) external onlyAdmin {
    if (creator == address(0)) revert ZeroAddress();
    creatorAllowed[creator] = allowed;
    emit CreatorAllowed(creator, allowed);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fee config (admin-level, snapshotted per-challenge at creation)
  // ────────────────────────────────────────────────────────────────────────────
  struct FeeCaps {
    uint16 forfeitFeeMaxBps;
    uint16 cashbackMaxBps;
  }

  struct FeeConfig {
    uint16 forfeitFeeBps;   // total fee taken from losers' forfeited pool
    uint16 protocolBps;     // protocol's share of forfeited pool
    uint16 creatorBps;      // creator's share of forfeited pool
    uint16 cashbackBps;     // cashback to losers (taken before fees)
  }

  FeeCaps public feeCaps;
  FeeConfig public feeConfig;

  event FeeCapsSet(uint16 forfeitFeeMaxBps, uint16 cashbackMaxBps);
  event FeeConfigSet(uint16 forfeitFeeBps, uint16 protocolBps, uint16 creatorBps, uint16 cashbackBps);

  function setFeeCaps(FeeCaps calldata caps) external onlyAdmin {
    if (caps.forfeitFeeMaxBps > 10_000) revert InvalidBounds();
    if (caps.cashbackMaxBps > 10_000) revert InvalidBounds();
    feeCaps = caps;
    emit FeeCapsSet(caps.forfeitFeeMaxBps, caps.cashbackMaxBps);
  }

  function setFeeConfig(FeeConfig calldata f) external onlyAdmin {
    if (f.forfeitFeeBps > 10_000) revert InvalidBounds();
    if (f.cashbackBps > 10_000) revert InvalidBounds();
    if (uint256(f.protocolBps) + f.creatorBps > f.forfeitFeeBps) revert InvalidBounds();
    if (feeCaps.forfeitFeeMaxBps > 0 && f.forfeitFeeBps > feeCaps.forfeitFeeMaxBps) revert InvalidBounds();
    if (feeCaps.cashbackMaxBps > 0 && f.cashbackBps > feeCaps.cashbackMaxBps) revert InvalidBounds();
    feeConfig = f;
    emit FeeConfigSet(f.forfeitFeeBps, f.protocolBps, f.creatorBps, f.cashbackBps);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Dispatchers (authorized callers for submitProofFor / submitProofForBatch)
  // ────────────────────────────────────────────────────────────────────────────
  mapping(address => bool) public dispatchers;

  event DispatcherSet(address indexed addr, bool enabled);

  function setDispatcher(address addr, bool enabled) external {
    if (msg.sender != admin) revert NotAdmin();
    dispatchers[addr] = enabled;
    emit DispatcherSet(addr, enabled);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Minimum stake
  // ────────────────────────────────────────────────────────────────────────────
  uint256 public minStake;

  event MinStakeSet(uint256 minStake);

  function setMinStake(uint256 _minStake) external {
    if (msg.sender != admin) revert NotAdmin();
    minStake = _minStake;
    emit MinStakeSet(_minStake);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // External ID tracking
  // ────────────────────────────────────────────────────────────────────────────
  mapping(bytes32 => bool) public externalIdUsed;
  mapping(uint256 => bytes32) public externalIdOf;
  mapping(bytes32 => uint256) public idByExternalId;

  // ────────────────────────────────────────────────────────────────────────────
  // Challenge struct
  // ────────────────────────────────────────────────────────────────────────────
  struct Challenge {
    uint256 id;
    uint8 kind;
    Status status;
    Outcome outcome;

    address creator;
    Currency currency;
    address token;
    uint256 stake;

    uint256 joinClosesTs;
    uint256 startTs;
    uint256 duration;
    uint256 maxParticipants;

    uint256 pool;
    uint256 participantsCount;

    IProofVerifier verifier;
    uint256 proofDeadlineTs;

    uint32 winnersCount;
    uint256 winnersPool;

    bool paused;
    bool canceled;
    bool payoutsDone;

    // Fee snapshot (creation-time)
    uint16 fee_forfeitFeeBps;
    uint16 fee_protocolBps;
    uint16 fee_creatorBps;
    uint16 fee_cashbackBps;

    // Mappings (not exposed in view)
    mapping(address => uint256) contrib;
    mapping(address => bool) participantSeen;
    mapping(address => bool) winner;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Snapshot (created during finalize)
  // ────────────────────────────────────────────────────────────────────────────
  struct Snapshot {
    bool set;
    bool success;

    uint256 committedPool;          // winners' total contributions
    uint256 forfeitedPool;          // losers' total contributions

    uint256 cashback;
    uint256 forfeitedAfterCashback;

    uint256 protocolAmt;
    uint256 creatorAmt;

    uint256 perCommittedBonusX;     // scaled (1e18) per-winner bonus
    uint256 perCashbackX;           // scaled (1e18) per-loser cashback

    // Claim tracking
    mapping(address => bool) winnerClaimed;
    mapping(address => bool) loserClaimed;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Storage
  // ────────────────────────────────────────────────────────────────────────────
  uint256 public nextChallengeId;
  mapping(uint256 => Challenge) internal challenges;
  mapping(uint256 => Snapshot) internal snapshots;

  // Cancel/refund tracking
  mapping(uint256 => bool) public cancelRefundStaged;
  mapping(uint256 => mapping(address => bool)) public refundClaimed;

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────
  event ChallengeCreated(
    uint256 indexed id,
    address indexed creator,
    uint8 kind,
    uint8 currency,
    address token,
    uint256 startTs,
    bytes32 externalId
  );

  event Joined(uint256 indexed id, address indexed user, uint256 amount);

  event ParticipantProofSubmitted(
    uint256 indexed id,
    address indexed participant,
    address indexed verifier,
    bool ok
  );
  event WinnerMarked(
    uint256 indexed id,
    address indexed participant,
    uint256 contrib,
    uint256 winnersPool,
    uint32 winnersCount
  );

  event VerificationConfigUpdated(
    uint256 indexed id,
    address verifier,
    uint256 proofDeadlineTs
  );

  event Finalized(uint256 indexed id, uint8 status, uint8 outcome);
  event Paused(uint256 indexed id, bool paused);
  event Canceled(uint256 indexed id);

  event FeesBooked(
    uint256 indexed id,
    uint256 protocolAmt,
    uint256 creatorAmt,
    uint256 cashback
  );
  event SnapshotSet(uint256 indexed id, bool success);

  event WinnerClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event LoserClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event RefundClaimed(uint256 indexed id, address indexed user, uint256 amount);

  // ────────────────────────────────────────────────────────────────────────────
  // Constructor
  // ────────────────────────────────────────────────────────────────────────────
  constructor(address _treasury, address _protocol) {
    if (_treasury == address(0) || _protocol == address(0)) revert ZeroAddress();
    treasury = _treasury;
    protocol = _protocol;
    admin = msg.sender;

    // Sensible defaults
    minLeadTime = 60;         // 1 minute minimum
    maxLeadTime = 365 days;
    nextChallengeId = 2;      // reserve 0 and 1
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Views
  // ────────────────────────────────────────────────────────────────────────────
  struct ChallengeView {
    uint256 id;
    uint8 kind;
    uint8 status;
    uint8 outcome;

    address creator;
    uint8 currency;
    address token;
    uint256 stake;

    uint256 joinClosesTs;
    uint256 startTs;
    uint256 duration;
    uint256 maxParticipants;

    uint256 pool;
    uint256 participantsCount;

    address verifier;
    uint256 proofDeadlineTs;

    uint32 winnersCount;
    uint256 winnersPool;

    bool paused;
    bool canceled;
    bool payoutsDone;
  }

  function getChallenge(uint256 id) external view returns (ChallengeView memory out) {
    Challenge storage c = challenges[id];
    out = ChallengeView({
      id: c.id,
      kind: c.kind,
      status: uint8(c.status),
      outcome: uint8(c.outcome),
      creator: c.creator,
      currency: uint8(c.currency),
      token: c.token,
      stake: c.stake,
      joinClosesTs: c.joinClosesTs,
      startTs: c.startTs,
      duration: c.duration,
      maxParticipants: c.maxParticipants,
      pool: c.pool,
      participantsCount: c.participantsCount,
      verifier: address(c.verifier),
      proofDeadlineTs: c.proofDeadlineTs,
      winnersCount: c.winnersCount,
      winnersPool: c.winnersPool,
      paused: c.paused,
      canceled: c.canceled,
      payoutsDone: c.payoutsDone
    });
  }

  struct SnapshotView {
    bool set;
    bool success;

    uint256 committedPool;
    uint256 forfeitedPool;

    uint256 cashback;
    uint256 forfeitedAfterCashback;

    uint256 protocolAmt;
    uint256 creatorAmt;

    uint256 perCommittedBonusX;
    uint256 perCashbackX;
  }

  function getSnapshot(uint256 id) external view returns (SnapshotView memory out) {
    Snapshot storage s = snapshots[id];
    out = SnapshotView({
      set: s.set,
      success: s.success,
      committedPool: s.committedPool,
      forfeitedPool: s.forfeitedPool,
      cashback: s.cashback,
      forfeitedAfterCashback: s.forfeitedAfterCashback,
      protocolAmt: s.protocolAmt,
      creatorAmt: s.creatorAmt,
      perCommittedBonusX: s.perCommittedBonusX,
      perCashbackX: s.perCashbackX
    });
  }

  /// @notice Read a participant's contribution for a challenge.
  function contribOf(uint256 id, address user) external view returns (uint256) {
    return challenges[id].contrib[user];
  }

  /// @notice Check if a participant is a winner.
  function isWinner(uint256 id, address user) external view returns (bool) {
    return challenges[id].winner[user];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Challenge management (admin)
  // ────────────────────────────────────────────────────────────────────────────
  function pauseChallenge(uint256 id, bool paused_) external onlyAdmin {
    Challenge storage c = challenges[id];
    c.paused = paused_;
    emit Paused(id, paused_);
  }

  function cancelChallenge(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();
    Challenge storage c = challenges[id];

    if (c.canceled) revert AlreadyCanceled();
    if (sender != c.creator && sender != admin) revert NotCreatorOrAdmin();
    if (c.status != Status.Active) revert NotActive();
    if (c.winnersCount > 0) revert AlreadyWinner();

    c.canceled = true;
    c.status = Status.Canceled;
    c.outcome = Outcome.None;

    emit Canceled(id);
  }

  /**
   * @notice Update verifier and/or proof deadline for an active challenge.
   * If proofTightenOnly is enabled, the new deadline must be <= current.
   */
  function setVerificationConfig(
    uint256 id,
    address verifier,
    uint256 proofDeadlineTs
  ) external onlyAdmin {
    Challenge storage c = challenges[id];
    if (c.status != Status.Active) revert NotActive();

    if (verifier != address(0)) {
      if (c.participantsCount > 0) revert InvalidBounds();
      c.verifier = IProofVerifier(verifier);
    }

    if (proofDeadlineTs != 0) {
      if (proofTightenOnly && proofDeadlineTs > c.proofDeadlineTs) revert TightenOnlyViolation();
      uint256 endTime = c.startTs + c.duration;
      if (proofDeadlineTs < endTime) revert ProofDeadlineBeforeEnd();
      c.proofDeadlineTs = proofDeadlineTs;
    }

    emit VerificationConfigUpdated(id, address(c.verifier), c.proofDeadlineTs);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────────────────────────────────────
  struct CreateParams {
    uint8 kind;
    Currency currency;
    address token;
    uint256 stakeAmount;
    uint256 joinClosesTs;     // 0 = defaults to startTs
    uint256 startTs;
    uint256 duration;
    uint256 maxParticipants;  // 0 = unlimited
    address verifier;
    uint256 proofDeadlineTs;
    bytes32 externalId;       // 0 = none
  }

  function createChallenge(CreateParams calldata p)
    external
    payable
    nonReentrant
    notPaused
    returns (uint256 id)
  {
    address sender = _msgSender2771();

    // Creator allowlist gate
    if (useCreatorAllowlist && !creatorAllowed[sender]) revert NotEligible();

    // Minimum stake
    if (minStake > 0 && msg.value < minStake) revert InvalidBounds();

    // Timing validation
    if (p.startTs <= block.timestamp) revert StartTooSoon();
    if (p.duration == 0) revert InvalidBounds();

    uint256 leadTime = p.startTs - block.timestamp;
    if (leadTime < minLeadTime) revert LeadTimeOutOfBounds();
    if (maxLeadTime > 0 && leadTime > maxLeadTime) revert LeadTimeOutOfBounds();

    // joinClosesTs: default to startTs, must be <= startTs
    uint256 joinClosesTs = p.joinClosesTs == 0 ? p.startTs : p.joinClosesTs;
    if (joinClosesTs > p.startTs) revert JoinClosesAfterStart();
    if (joinClosesTs <= block.timestamp) revert InvalidBounds();

    // Verifier
    if (p.verifier == address(0)) revert ZeroAddress();

    // Proof deadline
    if (p.proofDeadlineTs == 0) revert DeadlineRequired();
    uint256 endTime = p.startTs + p.duration;
    if (p.proofDeadlineTs < endTime) revert ProofDeadlineBeforeEnd();

    // Token validation
    if (p.currency == Currency.ERC20) {
      if (p.token == address(0)) revert ZeroAddress();
      if (useTokenAllowlist && !allowedToken[p.token]) revert TokenNotAllowed();
    }

    // External ID uniqueness
    if (p.externalId != bytes32(0)) {
      if (externalIdUsed[p.externalId]) revert ExternalIdAlreadyUsed();
      externalIdUsed[p.externalId] = true;
    }

    // Allocate
    id = nextChallengeId++;
    Challenge storage c = challenges[id];

    c.id = id;
    c.kind = p.kind;
    c.status = Status.Active;
    c.outcome = Outcome.None;

    c.creator = sender;
    c.currency = p.currency;
    c.token = (p.currency == Currency.ERC20) ? p.token : address(0);
    c.stake = p.stakeAmount;

    c.joinClosesTs = joinClosesTs;
    c.startTs = p.startTs;
    c.duration = p.duration;
    c.maxParticipants = p.maxParticipants;

    c.verifier = IProofVerifier(p.verifier);
    c.proofDeadlineTs = p.proofDeadlineTs;

    // Snapshot fees at creation
    c.fee_forfeitFeeBps = feeConfig.forfeitFeeBps;
    c.fee_protocolBps = feeConfig.protocolBps;
    c.fee_creatorBps = feeConfig.creatorBps;
    c.fee_cashbackBps = feeConfig.cashbackBps;

    // Deposit stake into Treasury bucket (bucketId = id)
    if (p.currency == Currency.NATIVE) {
      if (msg.value != p.stakeAmount) revert WrongMsgValue();
      if (p.stakeAmount > 0) ITreasury(treasury).depositETH{value: p.stakeAmount}(id);
    } else {
      if (msg.value != 0) revert WrongMsgValue();
      if (p.stakeAmount > 0) ITreasury(treasury).depositERC20From(id, p.token, sender, p.stakeAmount);
    }

    // Creator's stake counts as pool contribution
    if (p.stakeAmount > 0) {
      c.pool += p.stakeAmount;
      c.contrib[sender] += p.stakeAmount;
      _markParticipant(c, sender);
    }

    // External ID mapping
    if (p.externalId != bytes32(0)) {
      externalIdOf[id] = p.externalId;
      idByExternalId[p.externalId] = id;
    }

    emit ChallengeCreated(id, sender, p.kind, uint8(p.currency), c.token, c.startTs, p.externalId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Joining (deposits credit the challenge bucket in Treasury)
  // ────────────────────────────────────────────────────────────────────────────
  function joinChallengeNative(uint256 id) external payable nonReentrant notPaused {
    address sender = _msgSender2771();
    if (msg.value == 0) revert AmountZero();

    Challenge storage c = challenges[id];
    _requireJoinable(c);
    if (c.currency != Currency.NATIVE) revert TokenNotAllowed();

    _enforceParticipantCap(c, sender);

    ITreasury(treasury).depositETH{value: msg.value}(id);

    c.pool += msg.value;
    c.contrib[sender] += msg.value;

    emit Joined(id, sender, msg.value);
  }

  function joinChallengeERC20(uint256 id, uint256 amount) external nonReentrant notPaused {
    address sender = _msgSender2771();
    if (amount == 0) revert AmountZero();

    Challenge storage c = challenges[id];
    _requireJoinable(c);
    if (c.currency != Currency.ERC20) revert TokenNotAllowed();

    _enforceParticipantCap(c, sender);

    ITreasury(treasury).depositERC20From(id, c.token, sender, amount);

    c.pool += amount;
    c.contrib[sender] += amount;

    emit Joined(id, sender, amount);
  }

  function joinChallengeERC20WithPermit(
    uint256 id,
    uint256 amount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external nonReentrant notPaused {
    address sender = _msgSender2771();
    if (amount == 0) revert AmountZero();

    Challenge storage c = challenges[id];
    _requireJoinable(c);
    if (c.currency != Currency.ERC20) revert TokenNotAllowed();

    _enforceParticipantCap(c, sender);

    ITreasury(treasury).depositERC20Permit(id, c.token, sender, amount, deadline, v, r, s);

    c.pool += amount;
    c.contrib[sender] += amount;

    emit Joined(id, sender, amount);
  }

  function _requireJoinable(Challenge storage c) internal view {
    if (c.paused || c.canceled) revert ChallengePaused();
    if (c.status != Status.Active) revert NotActive();
    if (block.timestamp >= c.joinClosesTs) revert JoinWindowClosed();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proof submission
  // ────────────────────────────────────────────────────────────────────────────

  function submitMyProof(uint256 id, bytes calldata proof) external nonReentrant notPaused {
    address sender = _msgSender2771();
    _submitProofInternal(id, sender, proof);
  }

  function submitMyProofMeta(uint256 id, bytes calldata proof) external nonReentrant notPaused {
    address sender = _msgSender2771();
    _submitProofInternal(id, sender, proof);
  }

  function submitProofFor(uint256 id, address participant, bytes calldata proof)
    external
    nonReentrant
    notPaused
  {
    if (!dispatchers[msg.sender] && msg.sender != admin) revert NotAdmin();
    if (participant == address(0)) revert ZeroAddress();
    _submitProofInternal(id, participant, proof);
  }

  function submitProofForBatch(uint256 id, address[] calldata participants, bytes[] calldata proofs)
    external
    nonReentrant
    notPaused
  {
    if (!dispatchers[msg.sender] && msg.sender != admin) revert NotAdmin();
    if (participants.length != proofs.length) revert InvalidBounds();
    for (uint256 i = 0; i < participants.length; i++) {
      address p = participants[i];
      if (p == address(0)) revert ZeroAddress();
      _submitProofInternal(id, p, proofs[i]);
    }
  }

  function _submitProofInternal(uint256 id, address participant, bytes calldata proof) internal {
    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert ChallengePaused();
    if (c.status != Status.Active) revert NotActive();
    if (c.payoutsDone) revert AlreadyFinalized();

    if (block.timestamp < c.startTs) revert ProofNotOpen();
    if (block.timestamp > c.proofDeadlineTs) revert ProofWindowClosed();

    uint256 contrib = c.contrib[participant];
    if (contrib == 0) revert NotEligible();

    bool ok = false;
    try c.verifier.verify(id, participant, proof) returns (bool r) {
      ok = r;
    } catch {
      ok = false;
    }

    emit ParticipantProofSubmitted(id, participant, address(c.verifier), ok);
    if (!ok) return;

    if (c.winner[participant]) revert AlreadyWinner();
    c.winner[participant] = true;

    c.winnersPool += contrib;
    c.winnersCount += 1;

    emit WinnerMarked(id, participant, contrib, c.winnersPool, c.winnersCount);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Finalize + snapshot + book
  // ────────────────────────────────────────────────────────────────────────────
  function finalize(uint256 id) external nonReentrant notPaused {
    Challenge storage c = challenges[id];
    if (c.payoutsDone) revert AlreadyFinalized();
    if (c.status != Status.Active) revert NotActive();

    uint256 endTime = c.startTs + c.duration;
    if (block.timestamp < endTime) revert BeforeDeadline();
    if (block.timestamp < c.proofDeadlineTs) revert BeforeDeadline();

    c.status = Status.Finalized;
    c.outcome = (c.winnersPool > 0) ? Outcome.Success : Outcome.Fail;

    _snapshotAndBook(c);
    emit Finalized(id, uint8(c.status), uint8(c.outcome));
  }

  /**
   * @dev Snapshot final state and book payouts via Treasury grants.
   *
   * Dust handling: Integer division in fee splits and per-winner bonus
   * calculation may produce small rounding remainders (< participantsCount wei
   * per challenge). Fee-split dust is assigned to protocol (line: dust = ...).
   * Per-claim bonus dust stays in the Treasury bucket and is recoverable by
   * the SWEEPER_ROLE via Treasury.sweep() after all claims are processed.
   * This is safe because sweep only touches truly free funds
   * (balance - outstanding - bucketBalances).
   */
  function _snapshotAndBook(Challenge storage c) internal {
    c.payoutsDone = true;

    Snapshot storage s = snapshots[c.id];
    s.set = true;

    uint256 totalPool = c.pool;
    uint256 winnersPool = c.winnersPool;
    uint256 losersPool = (totalPool > winnersPool) ? (totalPool - winnersPool) : 0;

    s.committedPool = winnersPool;
    s.forfeitedPool = losersPool;

    bool hasWinners = winnersPool > 0;
    s.success = hasWinners;

    c.pool = 0;

    // Fee calculation from losers' forfeited pool
    uint16 forfeitFeeBps = c.fee_forfeitFeeBps;
    uint16 protocolBps   = c.fee_protocolBps;
    uint16 creatorBps    = c.fee_creatorBps;
    uint16 cashbackBps   = c.fee_cashbackBps;

    uint256 cashback = (losersPool * cashbackBps) / 10_000;
    uint256 losersAfterCashback = losersPool - cashback;

    uint256 feeGross   = (losersAfterCashback * forfeitFeeBps) / 10_000;
    uint256 protocolAmt = (losersAfterCashback * protocolBps) / 10_000;
    uint256 creatorAmt  = (losersAfterCashback * creatorBps) / 10_000;

    // Dust from rounding goes to protocol
    uint256 dust = feeGross - (protocolAmt + creatorAmt);
    protocolAmt += dust;

    uint256 distributable = losersAfterCashback - feeGross;

    s.cashback = cashback;
    s.forfeitedAfterCashback = losersAfterCashback;
    s.protocolAmt = protocolAmt;
    s.creatorAmt = creatorAmt;

    // Per-winner bonus (scaled by 1e18)
    if (winnersPool > 0 && distributable > 0) {
      s.perCommittedBonusX = (distributable * 1e18) / winnersPool;
    }

    // Per-loser cashback (scaled by 1e18)
    s.perCashbackX = (losersPool > 0 && cashback > 0) ? (cashback * 1e18) / losersPool : 0;

    // If no winners, route distributable to protocol to prevent stuck funds
    if (distributable > 0 && winnersPool == 0) {
      _grantFromBucket(c.id, protocol, distributable, c.currency, c.token);
    }

    if (protocolAmt > 0) _grantFromBucket(c.id, protocol, protocolAmt, c.currency, c.token);
    if (creatorAmt  > 0) _grantFromBucket(c.id, c.creator, creatorAmt, c.currency, c.token);

    emit FeesBooked(c.id, protocolAmt, creatorAmt, cashback);
    emit SnapshotSet(c.id, hasWinners);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * @notice Winners claim: original contribution + pro-rata share of distributable pool.
   * @dev Per-winner bonus uses fixed-point scaling (1e18). The last claimant may receive
   * slightly less than their exact share due to integer truncation. Maximum loss per
   * participant is 1 wei. Accumulated dust is recoverable via Treasury.sweep().
   */
  function claimWinner(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Snapshot storage s = snapshots[id];
    if (!s.set) revert NotEligible();

    Challenge storage c = challenges[id];
    if (!c.winner[sender]) revert NotEligible();

    uint256 principal = c.contrib[sender];
    if (principal == 0) revert NotEligible();
    if (s.winnerClaimed[sender]) revert NotEligible();
    s.winnerClaimed[sender] = true;

    uint256 amount = principal;
    if (s.perCommittedBonusX > 0) {
      amount = principal + (principal * s.perCommittedBonusX / 1e18);
    }

    _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit WinnerClaimed(id, sender, amount);
  }

  /**
   * @notice Losers claim: cashback portion of their contribution.
   */
  function claimLoser(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Snapshot storage s = snapshots[id];
    if (!s.set || s.perCashbackX == 0) revert NotEligible();

    Challenge storage c = challenges[id];
    if (c.winner[sender]) revert NotEligible();

    uint256 principal = c.contrib[sender];
    if (principal == 0) revert NotEligible();
    if (s.loserClaimed[sender]) revert NotEligible();
    s.loserClaimed[sender] = true;

    uint256 amount = principal * s.perCashbackX / 1e18;
    if (amount > 0) _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit LoserClaimed(id, sender, amount);
  }

  /**
   * @notice Refund claim: full contribution back when challenge is canceled.
   */
  function claimRefund(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Challenge storage c = challenges[id];
    if (c.status != Status.Canceled) revert ChallengeNotFinalized();

    uint256 amount = c.contrib[sender];
    if (amount == 0) revert NotEligible();
    if (refundClaimed[id][sender]) revert NotEligible();

    refundClaimed[id][sender] = true;
    _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit RefundClaimed(id, sender, amount);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────
  function _markParticipant(Challenge storage c, address user) internal {
    if (!c.participantSeen[user]) {
      c.participantSeen[user] = true;
      c.participantsCount++;
    }
  }

  function _enforceParticipantCap(Challenge storage c, address user) internal {
    if (c.participantSeen[user]) return;
    if (c.maxParticipants > 0 && c.participantsCount >= c.maxParticipants) revert MaxParticipantsReached();
    _markParticipant(c, user);
  }

  function _grantFromBucket(uint256 bucketId, address to, uint256 amount, Currency currency, address token) internal {
    if (amount == 0) return;
    if (currency == Currency.NATIVE) {
      ITreasury(treasury).grantETH(bucketId, to, amount);
    } else {
      ITreasury(treasury).grantERC20(bucketId, token, to, amount);
    }
  }
}
