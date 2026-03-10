// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {IProofVerifier} from "./verifiers/IProofVerifier.sol";
import {IApprovalStrategy} from "./strategies/IApprovalStrategy.sol";

interface IFastTrackVerifier {
  function verify(bytes calldata attestation, address challenger, bytes32 externalId) external view returns (bool ok);
}

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

contract ChallengePay is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Validator-stake bucket (separate from any challenge bucket)
  uint256 public constant VALIDATOR_BUCKET = 1;

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
  error ApprovalWindowTooShort();
  error ApprovalDeadlineAfterStart();
  error DeadlineRequired();
  error ProofDeadlineBeforeEnd();
  error PeerDeadlineBeforeEnd();
  error PeerQuorumInvalid();
  error TokenNotAllowed();
  error ExternalIdAlreadyUsed();
  error FastTrackInvalid();
  error StrategyRejected();

  error NotCreatorOrAdmin();
  error NotCreatorOnly();

  error NotPending();
  error NotApproved();
  error AlreadyCanceled();
  error JoinWindowClosed();
  error MaxParticipantsReached();

  error NotValidator();
  error MinStakeNotMet();
  error HasOpenVoteLocks();
  error CooldownNotElapsed();
  error AlreadyVoted();
  error AfterDeadline();
  error BeforeDeadline();
  error QuorumOrThresholdInvalid();
  error VoterCapTooSmall();
  error MaxVotersReached();

  error NotPeer();
  error ProofNotOpen();
  error ProofWindowClosed();
  error NotEligible();
  error AlreadyWinner();

  error AlreadyFinalized();
  error RejectNotStaged();

  error TightenOnlyViolation();
  error CharityTooHigh();
  error CharityAddressRequired();

  // ────────────────────────────────────────────────────────────────────────────
  // Immutables
  // ────────────────────────────────────────────────────────────────────────────
  address public immutable treasury;
  address public immutable protocol;

  // ────────────────────────────────────────────────────────────────────────────
  // Admin (2-step)
  // ────────────────────────────────────────────────────────────────────────────
  address public admin;
  address public pendingAdmin;
  bool public globalPaused;

  event GlobalPaused(bool paused);
  event AdminTransferStarted(address indexed oldAdmin, address indexed newPendingAdmin);
  event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);

  modifier onlyAdmin() {
    // Important: admin gating MUST use msg.sender (never forwarded).
    if (msg.sender != admin) revert NotAdmin();
    _;
  }

  modifier notPaused() {
    if (globalPaused) revert ChallengePaused();
_;
  }

  function transferAdmin(address newPendingAdmin) external onlyAdmin {
    if (newPendingAdmin == address(0)) revert ZeroAddress();
    pendingAdmin = newPendingAdmin;
    emit AdminTransferStarted(admin, newPendingAdmin);
  }

  function acceptAdmin() external {
    if (msg.sender != pendingAdmin) revert NotPendingAdmin();
    address old = admin;
    admin = pendingAdmin;
    pendingAdmin = address(0);
    emit AdminTransferAccepted(old, admin);
  }

  function pauseAll(bool paused) external onlyAdmin {
    globalPaused = paused;
    emit GlobalPaused(paused);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-2771 (TrustedForwarder) — optional
  // ────────────────────────────────────────────────────────────────────────────
  address public trustedForwarder;
  event TrustedForwarderSet(address indexed forwarder);

  function setTrustedForwarder(address fwd) external onlyAdmin {
    if (fwd == address(0)) revert ZeroAddress();
    trustedForwarder = fwd;
    emit TrustedForwarderSet(fwd);
  }

  function isTrustedForwarder(address fwd) public view returns (bool) {
    return fwd != address(0) && fwd == trustedForwarder;
  }

  /**
   * @dev ERC-2771 sender extractor:
   * If called through trustedForwarder, last 20 bytes of calldata is original sender.
   */
  function _msgSender2771() internal view returns (address sender) {
    if (msg.sender == trustedForwarder && msg.data.length >= 20) {
      assembly {
        sender := shr(96, calldataload(sub(calldatasize(), 20)))
      }
    } else {
      sender = msg.sender;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Globals
  // ────────────────────────────────────────────────────────────────────────────
  uint32 public maxVotersPerChallenge = 5000;

  mapping(address => bool) public allowedToken;
  bool public useTokenAllowlist;

  uint256 public minLeadTime = 2 minutes;
  uint256 public maxLeadTime = 30 days;

  bool public proofTightenOnly = true;
  IFastTrackVerifier public fastTrackVerifier;

  event MaxVotersPerChallengeSet(uint32 cap);
  event TokenAllowlistSet(bool enabled);
  event TokenAllowed(address indexed token, bool allowed);
  event LeadTimeBoundsSet(uint256 minLeadTime, uint256 maxLeadTime);
  event ProofTightenOnlySet(bool enabled);
  event FastTrackVerifierSet(address indexed verifier);

  function setMaxVotersPerChallenge(uint32 cap) external onlyAdmin {
    if (cap < 10) revert VoterCapTooSmall();
    maxVotersPerChallenge = cap;
    emit MaxVotersPerChallengeSet(cap);
  }

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
    if (minSec == 0 || maxSec < minSec) revert InvalidBounds();
    minLeadTime = minSec;
    maxLeadTime = maxSec;
    emit LeadTimeBoundsSet(minSec, maxSec);
  }

  function setProofTightenOnly(bool enabled) external onlyAdmin {
    proofTightenOnly = enabled;
    emit ProofTightenOnlySet(enabled);
  }

  function setFastTrackVerifier(address verifier) external onlyAdmin {
    fastTrackVerifier = IFastTrackVerifier(verifier);
    emit FastTrackVerifierSet(verifier);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Validators (Treasury-held stake)
  // ────────────────────────────────────────────────────────────────────────────
  uint256 public totalValidatorStake;             // accounting mirror
  uint256 public minValidatorStake = 5e13;        // example
  uint256 public approvalThresholdBps = 5000;     // 50% of total stake
  uint256 public quorumBps = 300;                 // 3%
  uint256 public unstakeCooldownSec = 3 days;

  mapping(address => uint256) public validatorStake;  // accounting mirror (Treasury holds funds)
  mapping(address => uint256) public pendingUnstake;
  mapping(address => uint256) public pendingUnstakeUnlockAt;

  mapping(address => uint256) public voteLocks;
  mapping(uint256 => mapping(address => bool)) public voteLockedFor;

  event ValidatorStaked(address indexed validator, uint256 amount);
  event ValidatorUnstakeRequested(address indexed validator, uint256 amount, uint256 unlockAt);
  event ValidatorUnstakedGranted(address indexed validator, uint256 amount);
  event ValidatorParamsSet(uint256 minStake, uint256 thresholdBps, uint256 quorumBps, uint256 cooldownSec);
  event VoteLockCleared(uint256 indexed id, address indexed validator);

  function setValidatorParams(
    uint256 _minStake,
    uint256 _thresholdBps,
    uint256 _quorumBps,
    uint256 _cooldownSec
  ) external onlyAdmin {
    if (_thresholdBps == 0 || _thresholdBps > 10_000 || _quorumBps > 10_000) revert QuorumOrThresholdInvalid();
    minValidatorStake = _minStake;
    approvalThresholdBps = _thresholdBps;
    quorumBps = _quorumBps;
    unstakeCooldownSec = _cooldownSec;
    emit ValidatorParamsSet(_minStake, _thresholdBps, _quorumBps, _cooldownSec);
  }

  /**
   * Stake as validator:
   * - deposits ETH into Treasury VALIDATOR_BUCKET
   * - updates local accounting mirrors
   * - DOES NOT hold ETH here
   */
  function stakeValidator() external payable nonReentrant notPaused {
    address sender = _msgSender2771();
    if (msg.value == 0) revert AmountZero();

    // custody -> Treasury
    ITreasury(treasury).depositETH{value: msg.value}(VALIDATOR_BUCKET);

    uint256 newStake = validatorStake[sender] + msg.value;
    validatorStake[sender] = newStake;
    totalValidatorStake += msg.value;

    if (newStake < minValidatorStake) revert MinStakeNotMet();
    emit ValidatorStaked(sender, msg.value);
  }

  /**
   * Request unstake:
   * - reduces accounting mirrors immediately (prevents vote weight abuse)
   * - after cooldown, user calls withdrawUnstaked() which grants Treasury allowance
   */
  function requestUnstake(uint256 amount) external nonReentrant notPaused {
    address sender = _msgSender2771();
    if (amount == 0) revert AmountZero();
    if (voteLocks[sender] > 0) revert HasOpenVoteLocks();

    uint256 currentStake = validatorStake[sender];
    if (currentStake < amount) revert NotEligible();

    validatorStake[sender] = currentStake - amount;
    totalValidatorStake -= amount;

    pendingUnstake[sender] += amount;
    pendingUnstakeUnlockAt[sender] = block.timestamp + unstakeCooldownSec;

    emit ValidatorUnstakeRequested(sender, amount, pendingUnstakeUnlockAt[sender]);
  }

  /**
   * Finalize unstake:
   * - grants the user an ETH allowance from VALIDATOR_BUCKET in Treasury
   * - user then claims directly from Treasury (or claimETHTo)
   */
  function withdrawUnstaked() external nonReentrant {
    address sender = _msgSender2771();
    uint256 amount = pendingUnstake[sender];
    if (amount == 0) revert AmountZero();
    if (block.timestamp < pendingUnstakeUnlockAt[sender]) revert CooldownNotElapsed();

    pendingUnstake[sender] = 0;
    pendingUnstakeUnlockAt[sender] = 0;

    // grant claimable funds from stake bucket
    ITreasury(treasury).grantETH(VALIDATOR_BUCKET, sender, amount);
    emit ValidatorUnstakedGranted(sender, amount);
  }

  function clearMyVoteLock(uint256 id) external {
    address sender = _msgSender2771();
    Challenge storage c = challenges[id];
    if (c.status == Status.Pending && !c.canceled) revert NotPending();
    if (!voteLockedFor[id][sender]) return;

    voteLockedFor[id][sender] = false;
    if (voteLocks[sender] > 0) voteLocks[sender] -= 1;
    emit VoteLockCleared(id, sender);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fees (snapshotted per challenge)
  // ────────────────────────────────────────────────────────────────────────────
  struct FeeCaps {
    uint16 forfeitFeeMaxBps;
    uint16 charityMaxBps;
    uint16 cashbackMaxBps;
  }

  struct FeeConfig {
    uint16 forfeitFeeBps;        // total forfeiture fee on losersAfterCashback
    uint16 protocolBps;
    uint16 creatorBps;
    uint16 validatorsBps;

    uint16 rejectFeeBps;
    uint16 rejectValidatorsBps;

    uint16 cashbackBps;
  }

  FeeCaps public feeCaps = FeeCaps({forfeitFeeMaxBps: 1000, charityMaxBps: 500, cashbackMaxBps: 200});
  FeeConfig public feeConfig = FeeConfig({
    forfeitFeeBps: 600,
    protocolBps: 200,
    creatorBps: 200,
    validatorsBps: 200,
    rejectFeeBps: 200,
    rejectValidatorsBps: 200,
    cashbackBps: 100
  });

  event FeeCapsSet(uint16 forfeitFeeMaxBps, uint16 charityMaxBps, uint16 cashbackMaxBps);
  event FeeConfigSet(
    uint16 forfeitFeeBps, uint16 protocolBps, uint16 creatorBps, uint16 validatorsBps,
    uint16 rejectFeeBps, uint16 rejectValidatorsBps, uint16 cashbackBps
  );

  function setFeeCaps(FeeCaps calldata caps) external onlyAdmin {
    if (caps.forfeitFeeMaxBps > 10_000 || caps.charityMaxBps > 10_000 || caps.cashbackMaxBps > 10_000) revert InvalidBounds();
    feeCaps = caps;
    emit FeeCapsSet(caps.forfeitFeeMaxBps, caps.charityMaxBps, caps.cashbackMaxBps);
  }

  function setFeeConfig(FeeConfig calldata f) external onlyAdmin {
    if (f.forfeitFeeBps > feeCaps.forfeitFeeMaxBps) revert InvalidBounds();
    if (uint256(f.protocolBps) + f.creatorBps + f.validatorsBps != f.forfeitFeeBps) revert InvalidBounds();
    if (f.rejectFeeBps > 10_000 || f.rejectValidatorsBps > f.rejectFeeBps) revert InvalidBounds();
    if (f.cashbackBps > feeCaps.cashbackMaxBps) revert InvalidBounds();

    feeConfig = f;
    emit FeeConfigSet(
      f.forfeitFeeBps, f.protocolBps, f.creatorBps, f.validatorsBps,
      f.rejectFeeBps, f.rejectValidatorsBps, f.cashbackBps
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // External IDs
  // ────────────────────────────────────────────────────────────────────────────
  mapping(bytes32 => bool) public externalIdUsed;
  mapping(uint256 => bytes32) public externalIdOf;
  mapping(bytes32 => uint256) public idByExternalId;

  // ────────────────────────────────────────────────────────────────────────────
  // Types
  // ────────────────────────────────────────────────────────────────────────────
  enum Currency { NATIVE, ERC20 }
  enum Status   { Pending, Approved, Rejected, Finalized }
  enum Outcome  { None, Success, Fail }

  struct Challenge {
    uint256 id;
    uint8 kind;

    Status status;
    Outcome outcome;

    address challenger;
    Currency currency;
    address token; // zero if native

    uint256 stake;
    uint256 proposalBond;

    uint256 approvalDeadline;
    uint256 startTs;
    uint256 duration;
    uint256 maxParticipants; // 0 = unlimited

    // validator voting
    uint256 yesWeight;
    uint256 noWeight;
    uint256 partWeight;
    mapping(address => bool) voted;
    mapping(address => bool) votedYes;
    address[] voters;
    uint32 votersYesCount;
    uint32 votersNoCount;

    // peers (optional)
    address[] peers;
    mapping(address => bool) isPeer;
    uint8 peerApprovalsNeeded;
    mapping(address => bool) peerVoted;
    uint256 peerApprovals;
    uint256 peerRejections;
    uint256 peerDeadlineTs;

    // charity
    uint16 charityBps;
    address charity;

    // pool + participants
    uint256 pool;
    mapping(address => uint256) contrib;
    mapping(address => bool) participantSeen;
    uint256 participantsCount;

    // proof
    IProofVerifier verifier;
    uint256 proofDeadlineTs;

    // winners
    mapping(address => bool) winner;
    uint32 winnersCount;
    uint256 winnersPool;

    // flags
    bool paused;
    bool canceled;
    bool payoutsDone;

    // snapshotted fees
    uint16 fee_forfeitFeeBps;
    uint16 fee_protocolBps;
    uint16 fee_creatorBps;
    uint16 fee_validatorsBps;
    uint16 fee_cashbackBps;
    uint16 fee_rejectFeeBps;
    uint16 fee_rejectValidatorsBps;

    // optional strategy
    IApprovalStrategy strategy;
    bytes strategyData;
  }

  uint256 public nextChallengeId = 2; // bucketId=1 reserved for VALIDATOR_BUCKET
  mapping(uint256 => Challenge) private challenges;

  // ────────────────────────────────────────────────────────────────────────────
  // Snapshot for claims
  // ────────────────────────────────────────────────────────────────────────────
  struct Snapshot {
    bool set;
    bool success;
    uint32 eligibleValidators;

    uint256 committedPool;
    uint256 forfeitedPool;

    uint256 cashback;
    uint256 forfeitedAfterCashback;

    uint256 charityAmt;
    uint256 protocolAmt;
    uint256 creatorAmt;
    uint256 validatorsAmt;

    uint256 perCommittedBonusX; // 1e18
    uint256 perCashbackX;       // 1e18
    uint256 perValidatorAmt;

    mapping(address => bool) committedClaimed;
    mapping(address => bool) cashbackClaimed;
    mapping(address => bool) validatorClaimed;
  }

  mapping(uint256 => Snapshot) private snapshots;

  // Reject path
  mapping(uint256 => uint256) private rejectPerValidatorAmt;
  mapping(uint256 => mapping(address => bool)) private rejectValidatorClaimed;
  mapping(uint256 => bool) private rejectSet;
  mapping(uint256 => bool) private rejectCreatorClaimed;
  mapping(uint256 => mapping(address => bool)) private rejectContributorClaimed;

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────
  event ChallengeCreated(
    uint256 indexed id,
    address indexed challenger,
    uint8 kind,
    uint8 currency,
    address token,
    uint256 startTs,
    bytes32 externalId,
    bool fastTracked
  );

  event StrategySet(uint256 indexed id, address indexed strategy);

  event ChallengeVoted(uint256 indexed id, address indexed by, bool yes, uint256 weight, uint256 yesWeight, uint256 noWeight, uint256 partWeight);
  event StatusBecameApproved(uint256 indexed id);
  event StatusBecameRejected(uint256 indexed id);

  event PeerAssigned(uint256 indexed id, address[] peers, uint8 approvalsNeeded);
  event PeerVoted(uint256 indexed id, address indexed peer, bool pass);

  event Joined(uint256 indexed id, address indexed user, uint256 amount);

  event ParticipantProofSubmitted(uint256 indexed id, address indexed participant, address indexed verifier, bool ok);
  event WinnerMarked(uint256 indexed id, address indexed participant, uint256 contrib, uint256 winnersPool, uint32 winnersCount);

  event VerificationConfigUpdated(uint256 indexed id, address verifier, uint256 proofDeadlineTs, uint256 peerDeadlineTs);

  event Finalized(uint256 indexed id, uint8 status, uint8 outcome);
  event Paused(uint256 indexed id, bool paused);
  event Canceled(uint256 indexed id);

  event FeesBooked(uint256 indexed id, uint256 protocolAmt, uint256 creatorAmt, uint256 validatorsAmt, uint256 charityAmt, uint256 cashback);
  event SnapshotSet(uint256 indexed id, bool success, uint32 eligibleValidators);

  event PrincipalClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event CashbackClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event ValidatorClaimed(uint256 indexed id, address indexed validator, uint256 amount);

  event RejectStaged(uint256 indexed id, uint256 perValidatorAmount);
  event RejectContributionClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event RejectCreatorClaimed(uint256 indexed id, address indexed creator, uint256 amount);
  event ValidatorRejectClaimed(uint256 indexed id, address indexed validator, uint256 amount);

  // ────────────────────────────────────────────────────────────────────────────
  // Constructor
  // ────────────────────────────────────────────────────────────────────────────
  constructor(address _treasury, address _protocol) {
    if (_treasury == address(0) || _protocol == address(0)) revert ZeroAddress();
    admin = msg.sender;
    treasury = _treasury;
    protocol = _protocol;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Challenge views (minimal)
  // ────────────────────────────────────────────────────────────────────────────
  struct ChallengeView {
    uint256 id;
    uint8 kind;
    uint8 status;
    uint8 outcome;

    address challenger;
    uint8 currency;
    address token;

    uint256 stake;
    uint256 proposalBond;

    uint256 approvalDeadline;
    uint256 startTs;
    uint256 duration;
    uint256 maxParticipants;

    uint256 yesWeight;
    uint256 noWeight;
    uint256 partWeight;

    address[] peers;
    uint8 peerApprovalsNeeded;
    uint256 peerApprovals;
    uint256 peerRejections;
    uint256 peerDeadlineTs;

    uint16 charityBps;
    address charity;

    uint256 pool;
    uint256 participantsCount;

    address verifier;
    uint256 proofDeadlineTs;

    uint32 winnersCount;
    uint256 winnersPool;
  }

  function getChallenge(uint256 id) external view returns (ChallengeView memory out) {
    Challenge storage c = challenges[id];
    out = ChallengeView({
      id: c.id,
      kind: c.kind,
      status: uint8(c.status),
      outcome: uint8(c.outcome),

      challenger: c.challenger,
      currency: uint8(c.currency),
      token: c.token,

      stake: c.stake,
      proposalBond: c.proposalBond,

      approvalDeadline: c.approvalDeadline,
      startTs: c.startTs,
      duration: c.duration,
      maxParticipants: c.maxParticipants,

      yesWeight: c.yesWeight,
      noWeight: c.noWeight,
      partWeight: c.partWeight,

      peers: c.peers,
      peerApprovalsNeeded: c.peerApprovalsNeeded,
      peerApprovals: c.peerApprovals,
      peerRejections: c.peerRejections,
      peerDeadlineTs: c.peerDeadlineTs,

      charityBps: c.charityBps,
      charity: c.charity,

      pool: c.pool,
      participantsCount: c.participantsCount,

      verifier: address(c.verifier),
      proofDeadlineTs: c.proofDeadlineTs,

      winnersCount: c.winnersCount,
      winnersPool: c.winnersPool
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Per-challenge pause/cancel
  // ────────────────────────────────────────────────────────────────────────────
  function pauseChallenge(uint256 id, bool paused_) external onlyAdmin {
    Challenge storage c = challenges[id];
    // allow pausing only while still in Pending/Approved zone
    if (uint8(c.status) > uint8(Status.Approved)) revert NotPending();
    c.paused = paused_;
    emit Paused(id, paused_);
  }

  function cancelChallenge(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();
    Challenge storage c = challenges[id];
    if (sender != c.challenger && sender != admin) revert NotCreatorOrAdmin();
    if (c.status != Status.Pending) revert NotPending();
    if (c.canceled) revert AlreadyCanceled();

    c.canceled = true;
    c.status = Status.Rejected;
    c.outcome = Outcome.None;

    _stageReject(c);
    emit Canceled(id);
  }

  // Tighten-only verification config
  function setVerificationConfig(
    uint256 id,
    address verifier,
    uint256 proofDeadlineTs,
    uint256 peerDeadlineTs
  ) external onlyAdmin {
    Challenge storage c = challenges[id];

    if (verifier == address(0)) revert ZeroAddress();
    if (proofDeadlineTs == 0) revert DeadlineRequired();

    uint256 endTime = c.startTs + c.duration;
    if (proofDeadlineTs < endTime) revert ProofDeadlineBeforeEnd();

    if (c.peerApprovalsNeeded > 0) {
      if (peerDeadlineTs == 0) revert DeadlineRequired();
      if (peerDeadlineTs < endTime) revert PeerDeadlineBeforeEnd();
    }

    if (proofTightenOnly) {
      address prevV = address(c.verifier);
      uint256 prevPD = c.proofDeadlineTs;
      uint256 prevPeerD = c.peerDeadlineTs;

      if (prevV != address(0) && verifier != prevV) revert TightenOnlyViolation();
      if (prevPD != 0 && proofDeadlineTs > prevPD) revert TightenOnlyViolation();
      if (prevPeerD != 0 && peerDeadlineTs > prevPeerD) revert TightenOnlyViolation();
    }

    c.verifier = IProofVerifier(verifier);
    c.proofDeadlineTs = proofDeadlineTs;
    c.peerDeadlineTs = peerDeadlineTs;

    emit VerificationConfigUpdated(id, verifier, proofDeadlineTs, peerDeadlineTs);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────────────────────────────────────
  struct CreateParams {
    uint8 kind;

    Currency currency;
    address token;

    uint256 stakeAmount;
    uint256 proposalBond;

    uint256 approvalDeadline;
    uint256 startTs;
    uint256 duration;

    uint256 maxParticipants;

    address[] peers;
    uint8 peerApprovalsNeeded;
    uint256 peerDeadlineTs;

    uint16 charityBps;
    address charity;

    address verifier;
    uint256 proofDeadlineTs;

    bytes32 externalId;
    uint256 leadTime;
    bytes fastTrackData;

    address strategy;
    bytes strategyData;
  }

  function createChallenge(CreateParams calldata p)
    external
    payable
    nonReentrant
    notPaused
    returns (uint256 id)
  {
    address sender = _msgSender2771();

    if (p.charityBps > feeCaps.charityMaxBps) revert CharityTooHigh();
    if (p.charityBps > 0 && p.charity == address(0)) revert CharityAddressRequired();

    if (p.peerApprovalsNeeded > p.peers.length) revert PeerQuorumInvalid();

    if (p.approvalDeadline <= block.timestamp) revert ApprovalWindowTooShort();
    if (p.startTs <= block.timestamp) revert StartTooSoon();

    if (p.leadTime < minLeadTime || p.leadTime > maxLeadTime) revert LeadTimeOutOfBounds();
    if (p.startTs < block.timestamp + p.leadTime) revert StartTooSoon();
    if (p.approvalDeadline >= p.startTs) revert ApprovalDeadlineAfterStart();
    if (p.duration == 0) revert InvalidBounds();

    if (p.verifier == address(0)) revert ZeroAddress();
    if (p.proofDeadlineTs == 0) revert DeadlineRequired();

    uint256 endTime = p.startTs + p.duration;
    if (p.proofDeadlineTs < endTime) revert ProofDeadlineBeforeEnd();
    if (p.peerApprovalsNeeded > 0) {
      if (p.peerDeadlineTs == 0) revert DeadlineRequired();
      if (p.peerDeadlineTs < endTime) revert PeerDeadlineBeforeEnd();
    }

    if (p.currency == Currency.ERC20) {
      if (p.token == address(0)) revert ZeroAddress();
      if (useTokenAllowlist && !allowedToken[p.token]) revert TokenNotAllowed();
    }

    if (p.externalId != bytes32(0)) {
      if (externalIdUsed[p.externalId]) revert ExternalIdAlreadyUsed();
      externalIdUsed[p.externalId] = true;
    }

    id = nextChallengeId++;
    Challenge storage c = challenges[id];

    c.id = id;
    c.kind = p.kind;

    c.status = Status.Pending;
    c.outcome = Outcome.None;

    c.challenger = sender;
    c.currency = p.currency;
    c.token = (p.currency == Currency.ERC20) ? p.token : address(0);

    c.stake = p.stakeAmount;
    c.proposalBond = p.proposalBond;

    c.approvalDeadline = p.approvalDeadline;
    c.startTs = p.startTs;
    c.duration = p.duration;
    c.maxParticipants = p.maxParticipants;

    c.peers = p.peers;
    c.peerApprovalsNeeded = p.peerApprovalsNeeded;
    c.peerDeadlineTs = p.peerDeadlineTs;
    for (uint256 i = 0; i < p.peers.length; i++) c.isPeer[p.peers[i]] = true;

    c.charityBps = p.charityBps;
    c.charity = p.charity;

    c.verifier = IProofVerifier(p.verifier);
    c.proofDeadlineTs = p.proofDeadlineTs;

    // Snapshot fees at creation
    c.fee_forfeitFeeBps = feeConfig.forfeitFeeBps;
    c.fee_protocolBps = feeConfig.protocolBps;
    c.fee_creatorBps = feeConfig.creatorBps;
    c.fee_validatorsBps = feeConfig.validatorsBps;
    c.fee_cashbackBps = feeConfig.cashbackBps;
    c.fee_rejectFeeBps = feeConfig.rejectFeeBps;
    c.fee_rejectValidatorsBps = feeConfig.rejectValidatorsBps;

    // Deposit stake + bond into Treasury bucket (bucketId = id)
    uint256 base = p.stakeAmount + p.proposalBond;
    if (p.currency == Currency.NATIVE) {
      if (msg.value != base) revert WrongMsgValue();
      if (base > 0) ITreasury(treasury).depositETH{value: base}(id);
    } else {
      if (msg.value != 0) revert WrongMsgValue();
      if (base > 0) ITreasury(treasury).depositERC20From(id, p.token, sender, base);
    }

    // stakeAmount participates in pool/contrib
    if (p.stakeAmount > 0) {
      c.pool += p.stakeAmount;
      c.contrib[sender] += p.stakeAmount;
      _markParticipant(c, sender);
    }

    // Optional strategy
    if (p.strategy != address(0)) {
      c.strategy = IApprovalStrategy(p.strategy);
      c.strategyData = p.strategyData;
      emit StrategySet(id, p.strategy);

      (bool allow, bool autoApprove) = c.strategy.onCreate(
        id,
        sender,
        c.token,
        uint8(c.currency),
        c.startTs,
        c.duration,
        p.strategyData
      );
      if (!allow) revert StrategyRejected();
      if (autoApprove) c.status = Status.Approved;
    }

    bool fastTracked = false;
    if (c.status == Status.Pending && p.fastTrackData.length > 0) {
      IFastTrackVerifier ft = fastTrackVerifier;
      if (address(ft) == address(0)) revert ZeroAddress();
      if (p.externalId == bytes32(0)) revert FastTrackInvalid();
      if (!ft.verify(p.fastTrackData, sender, p.externalId)) revert FastTrackInvalid();
      c.status = Status.Approved;
      fastTracked = true;
    }

    if (p.externalId != bytes32(0)) {
      externalIdOf[id] = p.externalId;
      idByExternalId[p.externalId] = id;
    }

    emit ChallengeCreated(id, sender, p.kind, uint8(p.currency), c.token, c.startTs, p.externalId, fastTracked);
    if (p.peers.length > 0) emit PeerAssigned(id, p.peers, p.peerApprovalsNeeded);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Voting (weight derived from Treasury-held stake mirror)
  // ────────────────────────────────────────────────────────────────────────────
  function approveChallenge(uint256 id, bool yes) external notPaused {
    address sender = _msgSender2771();
    uint256 weight = validatorStake[sender];
    if (weight < minValidatorStake) revert NotValidator();

    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert ChallengePaused();
if (c.status != Status.Pending) revert NotPending();
    if (block.timestamp >= c.approvalDeadline) revert AfterDeadline();
    if (c.voted[sender]) revert AlreadyVoted();
    if (c.voters.length >= maxVotersPerChallenge) revert MaxVotersReached();

    c.voted[sender] = true;
    c.votedYes[sender] = yes;
    c.voters.push(sender);

    if (!voteLockedFor[id][sender]) {
      voteLockedFor[id][sender] = true;
      voteLocks[sender]++;
    }

    c.partWeight += weight;
    if (yes) {
      c.yesWeight += weight;
      c.votersYesCount++;
    } else {
      c.noWeight += weight;
      c.votersNoCount++;
    }

    emit ChallengeVoted(id, sender, yes, weight, c.yesWeight, c.noWeight, c.partWeight);

    if (totalValidatorStake == 0) return;

    bool hasQuorum = (c.partWeight * 10_000 / totalValidatorStake) >= quorumBps;
    if (!hasQuorum) return;

    uint256 yesPct = c.yesWeight * 10_000 / totalValidatorStake;
    uint256 noPct  = c.noWeight  * 10_000 / totalValidatorStake;

    if (yesPct >= approvalThresholdBps) {
      c.status = Status.Approved;
      emit StatusBecameApproved(id);
    } else if (noPct >= approvalThresholdBps) {
      c.status = Status.Rejected;
      emit StatusBecameRejected(id);
      _stageReject(c);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Peer voting
  // ────────────────────────────────────────────────────────────────────────────
  function peerVote(uint256 id, bool pass) external notPaused {
    address sender = _msgSender2771();
    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert ChallengePaused();
if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp < c.startTs) revert BeforeDeadline();
    if (!c.isPeer[sender]) revert NotPeer();
    if (c.peerVoted[sender]) revert AlreadyVoted();

    c.peerVoted[sender] = true;
    if (pass) c.peerApprovals++;
    else c.peerRejections++;

    emit PeerVoted(id, sender, pass);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Joining (deposits credit the challenge bucket in Treasury)
  // ────────────────────────────────────────────────────────────────────────────
  function joinChallengeNative(uint256 id) external payable nonReentrant notPaused {
    address sender = _msgSender2771();
    if (msg.value == 0) revert AmountZero();

    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert ChallengePaused();
if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp >= c.startTs) revert JoinWindowClosed();
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
    if (c.paused || c.canceled) revert ChallengePaused();
if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp >= c.startTs) revert JoinWindowClosed();
    if (c.currency != Currency.ERC20) revert TokenNotAllowed();
    if (useTokenAllowlist && !allowedToken[c.token]) revert TokenNotAllowed();

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
    if (c.paused || c.canceled) revert ChallengePaused();
if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp >= c.startTs) revert JoinWindowClosed();
    if (c.currency != Currency.ERC20) revert TokenNotAllowed();
    if (useTokenAllowlist && !allowedToken[c.token]) revert TokenNotAllowed();

    _enforceParticipantCap(c, sender);

    ITreasury(treasury).depositERC20Permit(id, c.token, sender, amount, deadline, v, r, s);

    c.pool += amount;
    c.contrib[sender] += amount;

    emit Joined(id, sender, amount);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proof submission
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Standard "self proof" entry point (works for both normal tx and meta-tx).
   */
  function submitMyProof(uint256 id, bytes calldata proof) external nonReentrant notPaused {
    address sender = _msgSender2771();
    _submitProofInternal(id, sender, proof);
  }

  /**
   * Convenience selector for meta-tx flows (some UIs prefer dedicated method name).
   * Behavior is identical to submitMyProof().
   */
  function submitMyProofMeta(uint256 id, bytes calldata proof) external nonReentrant notPaused {
    address sender = _msgSender2771();
    _submitProofInternal(id, sender, proof);
  }

  function submitProofFor(uint256 id, address participant, bytes calldata proof)
    external
    nonReentrant
    notPaused
  {
    if (participant == address(0)) revert ZeroAddress();
    _submitProofInternal(id, participant, proof);
  }

  function submitProofForBatch(uint256 id, address[] calldata participants, bytes[] calldata proofs)
    external
    nonReentrant
    notPaused
  {
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
if (c.status != Status.Approved) revert NotApproved();
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
  // Finalize + snapshot + book (grants from bucketId=id)
  // ────────────────────────────────────────────────────────────────────────────
  function finalize(uint256 id) external nonReentrant notPaused {
    Challenge storage c = challenges[id];
    if (c.payoutsDone) revert AlreadyFinalized();

    if (c.status == Status.Pending) {
      if (block.timestamp <= c.approvalDeadline) revert BeforeDeadline();
      c.status = Status.Rejected;
      c.outcome = Outcome.None;
      _stageReject(c);
      emit Finalized(id, uint8(c.status), uint8(c.outcome));
      return;
    }

    if (c.status == Status.Rejected) {
      _stageReject(c);
      emit Finalized(id, uint8(c.status), uint8(c.outcome));
      return;
    }

    if (c.status != Status.Approved) revert NotApproved();

    uint256 endTime = c.startTs + c.duration;
    if (block.timestamp < endTime) revert BeforeDeadline();
    if (block.timestamp < c.proofDeadlineTs) revert BeforeDeadline(); // proof window must close

    bool peerGateFailed = false;
    if (c.peerApprovalsNeeded > 0) {
      if (block.timestamp > c.peerDeadlineTs && c.peerApprovals < c.peerApprovalsNeeded) {
        peerGateFailed = true;
      } else if (block.timestamp <= c.peerDeadlineTs && c.peerApprovals < c.peerApprovalsNeeded) {
        revert NotEligible();
      }
    }

    c.status = Status.Finalized;
    c.outcome = (!peerGateFailed && c.winnersPool > 0) ? Outcome.Success : Outcome.Fail;

    _snapshotAndBook(c, peerGateFailed);
    emit Finalized(id, uint8(c.status), uint8(c.outcome));
  }

  struct SnapshotView {
    bool set;
    bool success;
    uint32 eligibleValidators;

    uint256 committedPool;
    uint256 forfeitedPool;

    uint256 cashback;
    uint256 forfeitedAfterCashback;

    uint256 charityAmt;
    uint256 protocolAmt;
    uint256 creatorAmt;
    uint256 validatorsAmt;

    uint256 perCommittedBonusX;
    uint256 perCashbackX;
    uint256 perValidatorAmt;
  }

  function getSnapshot(uint256 id) external view returns (SnapshotView memory out) {
    Snapshot storage s = snapshots[id];
    out = SnapshotView({
      set: s.set,
      success: s.success,
      eligibleValidators: s.eligibleValidators,
      committedPool: s.committedPool,
      forfeitedPool: s.forfeitedPool,
      cashback: s.cashback,
      forfeitedAfterCashback: s.forfeitedAfterCashback,
      charityAmt: s.charityAmt,
      protocolAmt: s.protocolAmt,
      creatorAmt: s.creatorAmt,
      validatorsAmt: s.validatorsAmt,
      perCommittedBonusX: s.perCommittedBonusX,
      perCashbackX: s.perCashbackX,
      perValidatorAmt: s.perValidatorAmt
    });
  }

  function _snapshotAndBook(Challenge storage c, bool peerGateFailed) internal {
    c.payoutsDone = true;

    Snapshot storage s = snapshots[c.id];
    s.set = true;

    uint32 eligibleValidators = c.votersYesCount;
    s.eligibleValidators = eligibleValidators;

    uint256 totalPool = c.pool;

    uint256 winnersPool = (!peerGateFailed) ? c.winnersPool : 0;
    uint256 losersPool  = (totalPool > winnersPool) ? (totalPool - winnersPool) : 0;

    s.committedPool = winnersPool;
    s.forfeitedPool = losersPool;

    bool hasWinners = winnersPool > 0;
    s.success = hasWinners;

    c.pool = 0;

    uint16 forfeitFeeBps = c.fee_forfeitFeeBps;
    uint16 protocolBps   = c.fee_protocolBps;
    uint16 creatorBps    = c.fee_creatorBps;
    uint16 validatorsBps = c.fee_validatorsBps;
    uint16 cashbackBps   = c.fee_cashbackBps;

    uint256 cashback = (losersPool * cashbackBps) / 10_000;
    uint256 losersAfterCashback = losersPool - cashback;

    uint256 charityAmt = (losersAfterCashback * c.charityBps) / 10_000;
    uint256 feeGross   = (losersAfterCashback * forfeitFeeBps) / 10_000;

    uint256 protocolAmt   = (losersAfterCashback * protocolBps) / 10_000;
    uint256 creatorAmt    = (losersAfterCashback * creatorBps) / 10_000;
    uint256 validatorsAmt = (losersAfterCashback * validatorsBps) / 10_000;

    if (eligibleValidators == 0 && validatorsAmt > 0) {
      protocolAmt += validatorsAmt;
      validatorsAmt = 0;
    }

    uint256 dust = feeGross - (protocolAmt + creatorAmt + validatorsAmt);
    protocolAmt += dust;

    uint256 distributable = losersAfterCashback - feeGross - charityAmt;

    s.cashback = cashback;
    s.forfeitedAfterCashback = losersAfterCashback;

    s.charityAmt = charityAmt;
    s.protocolAmt = protocolAmt;
    s.creatorAmt = creatorAmt;
    s.validatorsAmt = validatorsAmt;

    if (winnersPool > 0 && distributable > 0) {
      s.perCommittedBonusX = (distributable * 1e18) / winnersPool;
    } else {
      s.perCommittedBonusX = 0;
    }

    s.perCashbackX = (losersPool > 0 && cashback > 0) ? (cashback * 1e18) / losersPool : 0;
    s.perValidatorAmt = (eligibleValidators > 0) ? (validatorsAmt / eligibleValidators) : 0;

    // If no winners, route distributable to protocol to prevent stuck funds
    if (distributable > 0 && winnersPool == 0) {
      _grantFromBucket(c.id, protocol, distributable, c.currency, c.token);
      s.perCommittedBonusX = 0;
    }

    if (protocolAmt > 0) _grantFromBucket(c.id, protocol, protocolAmt, c.currency, c.token);
    if (creatorAmt  > 0) _grantFromBucket(c.id, c.challenger, creatorAmt, c.currency, c.token);
    if (charityAmt  > 0 && c.charity != address(0)) _grantFromBucket(c.id, c.charity, charityAmt, c.currency, c.token);

    emit FeesBooked(c.id, protocolAmt, creatorAmt, validatorsAmt, charityAmt, cashback);
    emit SnapshotSet(c.id, hasWinners, eligibleValidators);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims (Treasury allowances FROM the challenge bucket)
  // ────────────────────────────────────────────────────────────────────────────
  function claimPrincipal(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Snapshot storage s = snapshots[id];
    if (!s.set) revert NotEligible();

    Challenge storage c = challenges[id];
    if (!c.winner[sender]) revert NotEligible();

    uint256 principal = c.contrib[sender];
    if (principal == 0) revert NotEligible();
    if (s.committedClaimed[sender]) revert NotEligible();
    s.committedClaimed[sender] = true;

    uint256 amount = principal;
    if (s.perCommittedBonusX > 0) amount = principal + (principal * s.perCommittedBonusX / 1e18);

    _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit PrincipalClaimed(id, sender, amount);
  }

  function claimCashback(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Snapshot storage s = snapshots[id];
    if (!s.set || s.perCashbackX == 0) revert NotEligible();

    Challenge storage c = challenges[id];
    if (c.winner[sender]) revert NotEligible();

    uint256 principal = c.contrib[sender];
    if (principal == 0) revert NotEligible();
    if (s.cashbackClaimed[sender]) revert NotEligible();
    s.cashbackClaimed[sender] = true;

    uint256 amount = principal * s.perCashbackX / 1e18;
    if (amount > 0) _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit CashbackClaimed(id, sender, amount);
  }

  function claimValidatorReward(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Snapshot storage s = snapshots[id];
    if (!s.set || s.perValidatorAmt == 0) revert NotEligible();

    Challenge storage c = challenges[id];
    if (!c.voted[sender]) revert NotEligible();
    if (!c.votedYes[sender]) revert NotEligible();
    if (s.validatorClaimed[sender]) revert NotEligible();

    s.validatorClaimed[sender] = true;
    _grantFromBucket(id, sender, s.perValidatorAmt, c.currency, c.token);
    emit ValidatorClaimed(id, sender, s.perValidatorAmt);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Reject path staging + claims
  // ────────────────────────────────────────────────────────────────────────────
  function claimRejectContribution(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Challenge storage c = challenges[id];
    if (c.status != Status.Rejected) revert NotPending();
    if (!rejectSet[id]) revert RejectNotStaged();

    if (sender == c.challenger) revert NotEligible();
    if (rejectContributorClaimed[id][sender]) revert NotEligible();

    uint256 amount = c.contrib[sender];
    if (amount == 0) revert NotEligible();

    rejectContributorClaimed[id][sender] = true;
    _grantFromBucket(id, sender, amount, c.currency, c.token);
    emit RejectContributionClaimed(id, sender, amount);
  }

  function claimRejectCreator(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    Challenge storage c = challenges[id];
    if (c.status != Status.Rejected) revert NotPending();
    if (!rejectSet[id]) revert RejectNotStaged();
    if (sender != c.challenger) revert NotCreatorOnly();
    if (rejectCreatorClaimed[id]) revert NotEligible();

    uint256 base = c.stake + c.proposalBond;
    uint256 fee  = (base * c.fee_rejectFeeBps) / 10_000;

    uint256 creatorContrib = c.contrib[c.challenger];
    uint256 owed = creatorContrib + c.proposalBond;
    if (fee > owed) fee = owed;
    owed -= fee;

    rejectCreatorClaimed[id] = true;
    _grantFromBucket(id, c.challenger, owed, c.currency, c.token);
    emit RejectCreatorClaimed(id, c.challenger, owed);
  }

  function claimValidatorReject(uint256 id) external nonReentrant notPaused {
    address sender = _msgSender2771();

    uint256 per = rejectPerValidatorAmt[id];
    if (per == 0) revert NotEligible();

    Challenge storage c = challenges[id];
    if (c.status != Status.Rejected) revert NotPending();

    if (!c.voted[sender]) revert NotEligible();
    if (c.votedYes[sender]) revert NotEligible();
    if (rejectValidatorClaimed[id][sender]) revert NotEligible();

    rejectValidatorClaimed[id][sender] = true;
    _grantFromBucket(id, sender, per, c.currency, c.token);
    emit ValidatorRejectClaimed(id, sender, per);
  }

  function _stageReject(Challenge storage c) internal {
    if (rejectSet[c.id]) return;
    rejectSet[c.id] = true;

    if (c.payoutsDone) return;
    c.payoutsDone = true;

    uint256 base = c.stake + c.proposalBond;
    uint256 fee = (base * c.fee_rejectFeeBps) / 10_000;
    uint256 validatorsShare = (base * c.fee_rejectValidatorsBps) / 10_000;
    if (validatorsShare > fee) validatorsShare = fee;

    uint256 eligible = uint256(c.votersNoCount);

    if (validatorsShare > 0) {
      if (eligible == 0) {
        _grantFromBucket(c.id, protocol, validatorsShare, c.currency, c.token);
      } else {
        uint256 per = validatorsShare / eligible;
        uint256 remainder = validatorsShare % eligible;
        if (per > 0) rejectPerValidatorAmt[c.id] = per;
        if (remainder > 0) _grantFromBucket(c.id, protocol, remainder, c.currency, c.token);
      }
    }

    uint256 protocolShare = fee - validatorsShare;
    if (protocolShare > 0) _grantFromBucket(c.id, protocol, protocolShare, c.currency, c.token);

    emit RejectStaged(c.id, rejectPerValidatorAmt[c.id]);
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