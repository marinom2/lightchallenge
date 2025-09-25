// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ChallengePay — scalable (claim-based) payouts
 * - Finalize path: snapshot + O(1) claims (winners/losers/validators)
 * - Reject path (never-approved / canceled / expired): now claim-based for contributors & creator too (no loops)
 * - Validators always claim individually (finalized or reject)
 * - DAO & creator & charity are paid immediately on finalize snapshot; on reject, DAO gets its portion immediately,
 *   validators get per-cap claim, creator/contributors claim their refunds without loops.
 */

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProofVerifier {
  function verify(uint256 challengeId, address subject, bytes calldata proof) external returns (bool);
}

contract ChallengePay is ReentrancyGuard {
  // ────────────────────────────────────────────────────────────────────────────
  // Errors
  // ────────────────────────────────────────────────────────────────────────────
  error NotAdmin();
  error StartTooSoon();
  error ApprovalWindowTooShort();
  error PeerQuorumInvalid();
  error CharityTooHigh();
  error WrongMsgValue();
  error NotPending();
  error AlreadyCanceled();
  error PausedOrCanceled();
  error NotApproved();
  error AlreadyVoted();
  error NotPeer();
  error BeforeDeadline();
  error AfterDeadline();
  error PeersNotMet();
  error NativeSendFailed();
  error NotValidator();
  error MinStakeNotMet();
  error CooldownNotElapsed();
  error HasOpenVoteLocks();
  error AmountZero();
  error QuorumOrThresholdInvalid();
  error MaxParticipantsReached();
  error AlreadyParticipant();
  error ProofRequired();
  error ProofNotSet();
  error JoinWindowClosed();
  error SnapshotNotSet();
  error AlreadyClaimed();
  error NotEligible();

  // ────────────────────────────────────────────────────────────────────────────
  // Admin / DAO
  // ────────────────────────────────────────────────────────────────────────────
  address public admin;
  address public daoTreasury;

  modifier onlyAdmin() {
    if (msg.sender != admin) revert NotAdmin();
    _;
  }

  constructor(address _daoTreasury) {
    admin = msg.sender;
    daoTreasury = _daoTreasury;

    approvalLeadTime = 72 hours;
    minValidatorStake = 5e13;     // 0.00005 native
    approvalThresholdBps = 5000;  // 50%
    quorumBps = 300;              // 3%
    unstakeCooldownSec = 3 days;

    feeCaps = FeeCaps({
      losersFeeMaxBps: 1000,      // 10%
      charityMaxBps: 500,         // 5%
      loserCashbackMaxBps: 200    // 2%
    });

    feeConfig = FeeConfig({
      losersFeeBps: 600,          // 6%
      daoBps: 200,                // 2%
      creatorBps: 200,            // 2%
      validatorsBps: 200,         // 2%
      rejectFeeBps: 200,          // 2% on never-approved/canceled
      rejectDaoBps: 200,          // 2% → DAO
      rejectValidatorsBps: 0,     // 0% → validators (can change later)
      loserCashbackBps: 100       // 1%
    });
  }

  function setAdmin(address a) external onlyAdmin { admin = a; }
  function setDaoTreasury(address t) external onlyAdmin { daoTreasury = t; }

  // ────────────────────────────────────────────────────────────────────────────
  // Validator Registry
  // ────────────────────────────────────────────────────────────────────────────
  uint256 public totalValidatorStake;
  uint256 public minValidatorStake;
  uint256 public approvalThresholdBps;
  uint256 public quorumBps;
  uint256 public unstakeCooldownSec;

  mapping(address => uint256) public validatorStake;
  mapping(address => uint256) public pendingUnstake;
  mapping(address => uint256) public pendingUnstakeUnlockAt;
  mapping(address => uint256) public voteLocks;

  event ValidatorStaked(address indexed v, uint256 amount);
  event ValidatorUnstakeRequested(address indexed v, uint256 amount, uint256 unlockAt);
  event ValidatorUnstaked(address indexed v, uint256 amount);
  event ValidatorParamsSet(uint256 minStake, uint256 thresholdBps, uint256 quorumBps, uint256 cooldownSec);

  function setValidatorParams(
    uint256 _minStake,
    uint256 _thresholdBps,
    uint256 _quorumBps,
    uint256 _cooldownSec
  ) external onlyAdmin {
    if (_thresholdBps == 0 || _thresholdBps > 10_000) revert QuorumOrThresholdInvalid();
    if (_quorumBps > 10_000) revert QuorumOrThresholdInvalid();

    minValidatorStake = _minStake;
    approvalThresholdBps = _thresholdBps;
    quorumBps = _quorumBps;
    unstakeCooldownSec = _cooldownSec;
    emit ValidatorParamsSet(_minStake, _thresholdBps, _quorumBps, _cooldownSec);
  }

  function stakeValidator() external payable nonReentrant {
    if (msg.value == 0) revert AmountZero();
    uint256 nv = validatorStake[msg.sender] + msg.value;
    validatorStake[msg.sender] = nv;
    totalValidatorStake += msg.value;
    if (nv < minValidatorStake) revert MinStakeNotMet();
    emit ValidatorStaked(msg.sender, msg.value);
  }

  function requestUnstake(uint256 amount) external nonReentrant {
    if (amount == 0) revert AmountZero();
    if (voteLocks[msg.sender] > 0) revert HasOpenVoteLocks();
    uint256 st = validatorStake[msg.sender];
    if (st < amount) revert MinStakeNotMet();

    validatorStake[msg.sender] = st - amount;
    totalValidatorStake -= amount;

    pendingUnstake[msg.sender] += amount;
    pendingUnstakeUnlockAt[msg.sender] = block.timestamp + unstakeCooldownSec;
    emit ValidatorUnstakeRequested(msg.sender, amount, pendingUnstakeUnlockAt[msg.sender]);
  }

  function withdrawUnstaked() external nonReentrant {
    uint256 amt = pendingUnstake[msg.sender];
    if (amt == 0) revert AmountZero();
    if (block.timestamp < pendingUnstakeUnlockAt[msg.sender]) revert CooldownNotElapsed();

    pendingUnstake[msg.sender] = 0;
    pendingUnstakeUnlockAt[msg.sender] = 0;
    (bool ok, ) = payable(msg.sender).call{value: amt}("");
    if (!ok) revert NativeSendFailed();
    emit ValidatorUnstaked(msg.sender, amt);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fees & Rules
  // ────────────────────────────────────────────────────────────────────────────
  struct FeeCaps {
    uint16 losersFeeMaxBps;
    uint16 charityMaxBps;
    uint16 loserCashbackMaxBps;
  }
  FeeCaps public feeCaps;

  struct FeeConfig {
    uint16 losersFeeBps;
    uint16 daoBps;
    uint16 creatorBps;
    uint16 validatorsBps;
    uint16 rejectFeeBps;
    uint16 rejectDaoBps;
    uint16 rejectValidatorsBps;
    uint16 loserCashbackBps;
  }
  FeeConfig public feeConfig;

  event FeeCapsSet(uint16 losersFeeMaxBps, uint16 charityMaxBps, uint16 loserCashbackMaxBps);
  event FeeConfigSet(
    uint16 losersFeeBps, uint16 daoBps, uint16 creatorBps, uint16 validatorsBps,
    uint16 rejectFeeBps, uint16 rejectDaoBps, uint16 rejectValidatorsBps, uint16 loserCashbackBps
  );

  function setFeeCaps(FeeCaps calldata caps) external onlyAdmin {
    require(caps.losersFeeMaxBps <= 10_000, "cap>100%");
    require(caps.charityMaxBps <= 10_000, "cap>100%");
    require(caps.loserCashbackMaxBps <= 10_000, "cap>100%");
    feeCaps = caps;
    emit FeeCapsSet(caps.losersFeeMaxBps, caps.charityMaxBps, caps.loserCashbackMaxBps);
  }

  function setFeeConfig(FeeConfig calldata f) external onlyAdmin {
    require(f.losersFeeBps <= feeCaps.losersFeeMaxBps, "losers fee cap");
    require(uint256(f.daoBps) + f.creatorBps + f.validatorsBps == f.losersFeeBps, "loser fee split");
    require(f.rejectFeeBps <= 10_000, "reject>100%");
    require(uint256(f.rejectDaoBps) + f.rejectValidatorsBps == f.rejectFeeBps, "reject split");
    require(f.loserCashbackBps <= feeCaps.loserCashbackMaxBps, "cashback cap");
    feeConfig = f;
    emit FeeConfigSet(
      f.losersFeeBps, f.daoBps, f.creatorBps, f.validatorsBps,
      f.rejectFeeBps, f.rejectDaoBps, f.rejectValidatorsBps, f.loserCashbackBps
    );
  }

  uint256 public approvalLeadTime;
  function setApprovalLeadTime(uint256 s) external onlyAdmin { approvalLeadTime = s; }

  // ────────────────────────────────────────────────────────────────────────────
  // Types
  // ────────────────────────────────────────────────────────────────────────────
  enum Currency { NATIVE, ERC20 }
  enum Outcome  { None, Success, Fail }
  enum Status   { Pending, Approved, Rejected, Finalized }
  enum RightSide { None, Approval, Reject } // validator side that was "right"

  struct Challenge {
    uint256 id;
    uint8   kind;
    Status  status;
    Outcome outcome;

    address challenger;
    address daoTreasurySnapshot;

    Currency currency;

    uint256 stake;
    uint256 proposalBond;

    uint256 approvalDeadline;
    uint256 startTs;
    uint256 maxParticipants; // 0 = unlimited

    // validator approvals (stake-weighted)
    uint256 yesWeight;
    uint256 noWeight;
    uint256 partWeight;
    mapping(address => bool) voted;
    mapping(address => bool) votedYes;
    address[] voters;

    // peers (verification)
    address[] peers;
    uint8 peerApprovalsNeeded;
    mapping(address => bool) peerVoted;
    uint256 peerApprovals;
    uint256 peerRejections;

    // optional charity
    uint16 charityBps;
    address charity;

    // pools
    uint256 poolSuccess;
    uint256 poolFail;

    // contributor accounting
    address[] successContribs; // kept for historic/audit; not used for payments now in reject path
    address[] failContribs;
    mapping(address => bool) successSeen;
    mapping(address => bool) failSeen;
    mapping(address => uint256) contribSuccess;
    mapping(address => uint256) contribFail;

    // participant cap
    mapping(address => bool) participantSeen;
    uint256 participantsCount;

    // proof (oracle) config
    bool proofRequired;
    address verifier;         // IProofVerifier
    bool proofOk;

    // flags
    bool paused;
    bool canceled;
    bool payoutsDone;         // snapshot taken (Approved path) OR reject staged
  }

  uint256 public nextChallengeId;
  mapping(uint256 => Challenge) private challenges;

  struct ChallengeView {
    uint256 id; uint8 kind; uint8 status; uint8 outcome;
    address challenger; address daoTreasury;
    uint8 currency; uint256 stake; uint256 proposalBond;
    uint256 approvalDeadline; uint256 startTs; uint256 maxParticipants;
    uint256 yesWeight; uint256 noWeight; uint256 partWeight;
    address[] peers; uint8 peerApprovalsNeeded; uint256 peerApprovals; uint256 peerRejections;
    uint16 charityBps; address charity;
    uint256 poolSuccess; uint256 poolFail;
    bool proofRequired; address verifier; bool proofOk;
    uint256 participantsCount;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Finalized snapshot (claim-based)
  // ────────────────────────────────────────────────────────────────────────────
  struct Snapshot {
    bool set;
    bool success;                  // final outcome == Success ?
    uint8 rightSide;               // RightSide
    uint32 eligibleValidators;     // count of validators on right side (equal split)

    uint256 winnersPool;
    uint256 losersPool;

    uint256 loserCashback;
    uint256 losersAfterCashback;

    uint256 charityAmt;
    uint256 daoAmt;
    uint256 creatorAmt;
    uint256 validatorsAmt;

    // precomputed constants
    uint256 perWinnerBonusX;       // = distributable * 1e18 / winnersPool
    uint256 perLoserCashbackX;     // = loserCashback * 1e18 / losersPool
    uint256 perValidatorAmt;       // = validatorsAmt / eligibleValidators

    // claim flags
    mapping(address => bool) winnerClaimed;
    mapping(address => bool) loserCashbackClaimed;
    mapping(address => bool) validatorClaimed;
  }
  mapping(uint256 => Snapshot) private snapshots;

  struct SnapshotView {
    bool set;
    bool success;
    uint8 rightSide;
    uint32 eligibleValidators;
    uint256 winnersPool;
    uint256 losersPool;
    uint256 loserCashback;
    uint256 losersAfterCashback;
    uint256 charityAmt;
    uint256 daoAmt;
    uint256 creatorAmt;
    uint256 validatorsAmt;
    uint256 perWinnerBonusX;
    uint256 perLoserCashbackX;
    uint256 perValidatorAmt;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Reject snapshot (claim-based)
  // ────────────────────────────────────────────────────────────────────────────
  mapping(uint256 => uint256) private rejectPerValidatorAmt;                 // per-cap for validators
  mapping(uint256 => mapping(address => bool)) private rejectValidatorClaimed;

  // NEW: claim-based contributors & creator on reject
  mapping(uint256 => bool) private rejectSet;                                // reject staged
  mapping(uint256 => bool) private rejectCreatorClaimed;
  mapping(uint256 => mapping(address => bool)) private rejectContributorClaimed;

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────
  event ChallengeCreated(uint256 indexed id, address indexed challenger, uint8 kind, uint256 startTs);
  event ChallengeApproved(uint256 indexed id, address indexed by, uint256 weightYes, uint256 weightNo, uint256 part);
  event ChallengeRejected(uint256 indexed id, address indexed by, uint256 weightYes, uint256 weightNo, uint256 part);
  event StatusBecameApproved(uint256 indexed id);
  event StatusBecameRejected(uint256 indexed id);
  event PeerAssigned(uint256 indexed id, address[] peers, uint8 approvalsNeeded);
  event PeerVoted(uint256 indexed id, address indexed peer, bool pass);
  event Joined(uint256 indexed id, address indexed user, uint256 amount);
  event BetPlaced(uint256 indexed id, address indexed user, uint8 outcome, uint256 amount);
  event Finalized(uint256 indexed id, uint8 status, uint8 outcome);
  event Paused(uint256 indexed id, bool paused);
  event Canceled(uint256 indexed id);
  event FeesPaid(uint256 indexed id, uint256 dao, uint256 creator, uint256 validators, uint256 charity, uint256 loserCashback);
  event SnapshotSet(uint256 indexed id, bool success, uint8 rightSide, uint32 eligibleValidators);
  event WinnerClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event LoserCashbackClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event ValidatorClaimed(uint256 indexed id, address indexed v, uint256 amount);
  event ValidatorRejectClaimed(uint256 indexed id, address indexed v, uint256 amount);
  event ProofSubmitted(uint256 indexed id, address indexed verifier, bool ok);

  event ProofConfigUpdated(uint256 indexed challengeId, bool required, address verifier);
  // NEW reject-claim events
  event RejectStaged(uint256 indexed id, uint256 dao, uint256 validatorsPerCap);
  event RejectContributionClaimed(uint256 indexed id, address indexed user, uint256 amount);
  event RejectCreatorClaimed(uint256 indexed id, address indexed creator, uint256 amount);

  // ────────────────────────────────────────────────────────────────────────────
  // Admin rescue
  // ────────────────────────────────────────────────────────────────────────────
  function rescueNative(address payable to, uint256 amount) external onlyAdmin nonReentrant {
    require(to != address(0), "to=0");
    (bool ok, ) = to.call{value: amount}("");
    if (!ok) revert NativeSendFailed();
  }

  function pauseChallenge(uint256 id, bool p) external onlyAdmin {
    Challenge storage c = challenges[id];
    if (!(c.status == Status.Pending || c.status == Status.Approved)) revert NotPending();
    c.paused = p;
    emit Paused(id, p);
  }

  function cancelChallenge(uint256 id) external nonReentrant {
    Challenge storage c = challenges[id];
    if (msg.sender != c.challenger && msg.sender != admin) revert NotAdmin();
    if (c.status != Status.Pending) revert NotPending();
    if (c.canceled) revert AlreadyCanceled();

    c.canceled = true;
    c.status = Status.Rejected;
    c.outcome = Outcome.None;

    _unlockValidatorVotes(c);
    _refundNotApproved(c); // now claim-based
    emit Canceled(id);
  }

  function setProofConfig(uint256 id, bool required, address v) external onlyAdmin {
    if (required && v == address(0)) revert ProofNotSet();
    Challenge storage c = challenges[id];
    c.proofRequired = required;
    c.verifier = v;
    emit ProofConfigUpdated(id, required, v);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Views
  // ────────────────────────────────────────────────────────────────────────────
  function getChallenge(uint256 id) external view returns (ChallengeView memory out) {
    Challenge storage c = challenges[id];
    out = ChallengeView({
      id: c.id,
      kind: c.kind,
      status: uint8(c.status),
      outcome: uint8(c.outcome),
      challenger: c.challenger,
      daoTreasury: c.daoTreasurySnapshot,
      currency: uint8(c.currency),
      stake: c.stake,
      proposalBond: c.proposalBond,
      approvalDeadline: c.approvalDeadline,
      startTs: c.startTs,
      maxParticipants: c.maxParticipants,
      yesWeight: c.yesWeight,
      noWeight: c.noWeight,
      partWeight: c.partWeight,
      peers: c.peers,
      peerApprovalsNeeded: c.peerApprovalsNeeded,
      peerApprovals: c.peerApprovals,
      peerRejections: c.peerRejections,
      charityBps: c.charityBps,
      charity: c.charity,
      poolSuccess: c.poolSuccess,
      poolFail: c.poolFail,
      proofRequired: c.proofRequired,
      verifier: c.verifier,
      proofOk: c.proofOk,
      participantsCount: c.participantsCount
    });
  }

  function nextChallengeIdView() external view returns (uint256) { return nextChallengeId; }

  function getSnapshot(uint256 id) external view returns (SnapshotView memory v) {
    Snapshot storage s = snapshots[id];
    v = SnapshotView({
      set: s.set,
      success: s.success,
      rightSide: s.rightSide,
      eligibleValidators: s.eligibleValidators,
      winnersPool: s.winnersPool,
      losersPool: s.losersPool,
      loserCashback: s.loserCashback,
      losersAfterCashback: s.losersAfterCashback,
      charityAmt: s.charityAmt,
      daoAmt: s.daoAmt,
      creatorAmt: s.creatorAmt,
      validatorsAmt: s.validatorsAmt,
      perWinnerBonusX: s.perWinnerBonusX,
      perLoserCashbackX: s.perLoserCashbackX,
      perValidatorAmt: s.perValidatorAmt
    });
  }

  function contribOf(uint256 id, address u) external view returns (uint256 successAmt, uint256 failAmt) {
    Challenge storage c = challenges[id];
    successAmt = c.contribSuccess[u];
    failAmt = c.contribFail[u];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────────────────────────────────────
  struct CreateParams {
    uint8 kind;
    Currency currency;            // expect NATIVE
    address token;                // ignored for NATIVE
    uint256 stakeAmount;
    uint256 proposalBond;
    uint256 approvalDeadline;
    uint256 startTs;
    uint256 maxParticipants;      // 0 = unlimited
    address[] peers;
    uint8 peerApprovalsNeeded;
    uint16 charityBps;
    address charity;
    bool    proofRequired;
    address verifier;
  }

  function createChallenge(CreateParams calldata p)
    external
    payable
    nonReentrant
    returns (uint256 id)
  {
    if (p.charityBps > feeCaps.charityMaxBps) revert CharityTooHigh();
    if (p.peerApprovalsNeeded > p.peers.length) revert PeerQuorumInvalid();
    if (p.approvalDeadline <= block.timestamp) revert ApprovalWindowTooShort();
    if (p.startTs < block.timestamp + approvalLeadTime) revert StartTooSoon();
    if (p.approvalDeadline >= p.startTs) revert ApprovalWindowTooShort();

    // NEW: input safety (no global cap; 0 means unlimited)
    if (p.charityBps > 0 && p.charity == address(0)) revert CharityTooHigh();
    if (p.proofRequired && p.verifier == address(0)) revert ProofNotSet();

    if (p.currency != Currency.NATIVE) revert WrongMsgValue();
    uint256 expected = p.stakeAmount + p.proposalBond;
    if (msg.value != expected) revert WrongMsgValue();

    id = nextChallengeId++;
    Challenge storage c = challenges[id];
    c.id = id;
    c.kind = p.kind;
    c.status = Status.Pending;
    c.outcome = Outcome.None;
    c.challenger = msg.sender;
    c.daoTreasurySnapshot = daoTreasury;
    c.currency = Currency.NATIVE;
    c.stake = p.stakeAmount;
    c.proposalBond = p.proposalBond;
    c.approvalDeadline = p.approvalDeadline;
    c.startTs = p.startTs;
    c.maxParticipants = p.maxParticipants;
    c.peers = p.peers;
    c.peerApprovalsNeeded = p.peerApprovalsNeeded;
    c.charityBps = p.charityBps;
    c.charity = p.charity;
    c.proofRequired = p.proofRequired;
    c.verifier = p.verifier;

    if (p.stakeAmount > 0) {
      c.poolSuccess += p.stakeAmount;
      _addSuccess(c, msg.sender, p.stakeAmount);
      _markParticipant(c, msg.sender);
    }

    emit ChallengeCreated(id, msg.sender, p.kind, p.startTs);
    if (p.peers.length > 0) emit PeerAssigned(id, p.peers, p.peerApprovalsNeeded);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Validator approvals
  // ────────────────────────────────────────────────────────────────────────────
  function approveChallenge(uint256 id, bool yes) external {
    uint256 w = validatorStake[msg.sender];
    if (w < minValidatorStake) revert NotValidator();

    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert PausedOrCanceled();
    if (c.status != Status.Pending) revert NotPending();
    if (block.timestamp >= c.approvalDeadline) revert AfterDeadline();
    if (c.voted[msg.sender]) revert AlreadyVoted();

    c.voted[msg.sender] = true;
    c.votedYes[msg.sender] = yes;
    c.voters.push(msg.sender);
    voteLocks[msg.sender] += 1;

    c.partWeight += w;
    if (yes) c.yesWeight += w; else c.noWeight += w;

    if (yes) {
      emit ChallengeApproved(id, msg.sender, c.yesWeight, c.noWeight, c.partWeight);
    } else {
      emit ChallengeRejected(id, msg.sender, c.yesWeight, c.noWeight, c.partWeight);
    }

    if (totalValidatorStake > 0) {
      bool hasQuorum = (c.partWeight * 10_000 / totalValidatorStake) >= quorumBps;
      if (hasQuorum) {
        uint256 yesPct = (c.yesWeight * 10_000) / totalValidatorStake;
        uint256 noPct  = (c.noWeight  * 10_000) / totalValidatorStake;
        if (yesPct >= approvalThresholdBps) {
          c.status = Status.Approved;
          _unlockValidatorVotes(c);
          emit StatusBecameApproved(id);
        } else if (noPct >= approvalThresholdBps) {
          c.status = Status.Rejected;
          c.outcome = Outcome.None;
          _unlockValidatorVotes(c);
          emit StatusBecameRejected(id);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Peer voting (post-start)
  // ────────────────────────────────────────────────────────────────────────────
  function peerVote(uint256 id, bool pass) external {
    Challenge storage c = challenges[id];
    require(!c.paused && !c.canceled, "paused/canceled");
    require(c.status == Status.Approved, "not approved yet");
    require(block.timestamp >= c.startTs, "before start");

    bool assigned = false;
    for (uint i = 0; i < c.peers.length; i++) {
      if (c.peers[i] == msg.sender) { assigned = true; break; }
    }
    require(assigned, "not peer");
    require(!c.peerVoted[msg.sender], "already voted");
    c.peerVoted[msg.sender] = true;

    if (pass) c.peerApprovals += 1; else c.peerRejections += 1;
    emit PeerVoted(id, msg.sender, pass);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Join / Bet
  // ────────────────────────────────────────────────────────────────────────────
  function joinChallenge(uint256 id) external payable nonReentrant {
    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert PausedOrCanceled();
    if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp >= c.startTs) revert JoinWindowClosed();
    if (msg.value == 0) revert WrongMsgValue();

    _enforceParticipantCap(c, msg.sender);

    c.poolSuccess += msg.value;
    _addSuccess(c, msg.sender, msg.value);
    emit Joined(id, msg.sender, msg.value);
  }

  function betOn(uint256 id, uint8 outcome) external payable nonReentrant {
    require(outcome == uint8(Outcome.Success) || outcome == uint8(Outcome.Fail), "bad outcome");
    Challenge storage c = challenges[id];
    if (c.paused || c.canceled) revert PausedOrCanceled();
    if (c.status != Status.Approved) revert NotApproved();
    if (block.timestamp >= c.startTs) revert JoinWindowClosed();
    if (msg.value == 0) revert WrongMsgValue();

    _enforceParticipantCap(c, msg.sender);

    if (outcome == uint8(Outcome.Success)) {
      c.poolSuccess += msg.value;
      _addSuccess(c, msg.sender, msg.value);
    } else {
      c.poolFail += msg.value;
      _addFail(c, msg.sender, msg.value);
    }
    emit BetPlaced(id, msg.sender, outcome, msg.value);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proof submission (oracle adapter)
  // ────────────────────────────────────────────────────────────────────────────
  function submitProof(uint256 id, bytes calldata proof) external nonReentrant {
    Challenge storage c = challenges[id];
    if (!c.proofRequired) revert ProofNotSet();
    if (c.verifier == address(0)) revert ProofNotSet();
    bool ok = IProofVerifier(c.verifier).verify(id, c.challenger, proof);
    c.proofOk = ok;
    emit ProofSubmitted(id, c.verifier, ok);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Finalize + snapshot (claim-based)
  // ────────────────────────────────────────────────────────────────────────────
  function finalize(uint256 id) external nonReentrant {
    Challenge storage c = challenges[id];
    if (c.status == Status.Pending) {
      if (block.timestamp <= c.approvalDeadline) revert BeforeDeadline();
      c.status = Status.Rejected;
      c.outcome = Outcome.None;
      _unlockValidatorVotes(c);
      _refundNotApproved(c);
      emit Finalized(id, uint8(c.status), uint8(c.outcome));
      return;
    }

    if (c.status == Status.Rejected) {
      if (block.timestamp < c.startTs) {
        c.outcome = Outcome.None;
        _unlockValidatorVotes(c);
        _refundNotApproved(c);
      } else {
        c.outcome = Outcome.Fail;
        _snapshotAndFreeze(c); // fail outcome uses snapshot path
      }
      emit Finalized(id, uint8(c.status), uint8(c.outcome));
      return;
    }

    // Approved → check proof/peers
    if (c.peerApprovalsNeeded > 0) {
      if (c.peerApprovals < c.peerApprovalsNeeded) revert PeersNotMet();
    }
    if (c.proofRequired) {
      if (!c.proofOk) revert ProofRequired();
    }

    c.status = Status.Finalized;
    c.outcome = Outcome.Success;
    _snapshotAndFreeze(c);
    emit Finalized(id, uint8(c.status), uint8(c.outcome));
  }

  // Take snapshot and pay DAO/creator/charity immediately; others move to claims.
  function _snapshotAndFreeze(Challenge storage c) internal {
    require(!c.payoutsDone, "dup payouts");
    c.payoutsDone = true;

    bool success = (c.outcome == Outcome.Success);
    uint256 winnersPool = success ? c.poolSuccess : c.poolFail;
    uint256 losersPool  = success ? c.poolFail   : c.poolSuccess;

    // Fees math
    uint256 loserCashback = (losersPool * feeConfig.loserCashbackBps) / 10_000;
    uint256 losersAfterCashback = losersPool - loserCashback;

    uint256 charityAmt = (losersAfterCashback * c.charityBps) / 10_000;
    uint256 totalFee   = (losersAfterCashback * feeConfig.losersFeeBps) / 10_000;
    uint256 daoAmt     = (losersAfterCashback * feeConfig.daoBps) / 10_000;
    uint256 creatorAmt = (losersAfterCashback * feeConfig.creatorBps) / 10_000;
    uint256 validatorsAmt = (losersAfterCashback * feeConfig.validatorsBps) / 10_000;
    require(daoAmt + creatorAmt + validatorsAmt == totalFee, "fee split mismatch");

    uint256 distributable = losersAfterCashback - totalFee - charityAmt;

    // Determine validator "right side"
    RightSide rs = success ? RightSide.Approval : RightSide.Reject;

    // Count eligible validators
    uint32 eligible;
    for (uint256 i=0; i<c.voters.length; ++i) {
      address v = c.voters[i];
      bool vy = c.votedYes[v];
      if ((rs == RightSide.Approval && vy) || (rs == RightSide.Reject && !vy)) {
        unchecked { ++eligible; }
      }
    }

    // Set snapshot
    Snapshot storage s = snapshots[c.id];
    s.set = true;
    s.success = success;
    s.rightSide = uint8(rs);
    s.eligibleValidators = eligible;
    s.winnersPool = winnersPool;
    s.losersPool = losersPool;
    s.loserCashback = loserCashback;
    s.losersAfterCashback = losersAfterCashback;
    s.charityAmt = charityAmt;
    s.daoAmt = daoAmt;
    s.creatorAmt = creatorAmt;
    s.validatorsAmt = validatorsAmt;

    // Precompute constants
    if (winnersPool > 0 && distributable > 0) {
      s.perWinnerBonusX = (distributable * 1e18) / winnersPool;
    } else {
      s.perWinnerBonusX = 0;
    }
    if (losersPool > 0 && loserCashback > 0) {
      s.perLoserCashbackX = (loserCashback * 1e18) / losersPool;
    } else {
      s.perLoserCashbackX = 0;
    }
    if (eligible > 0 && validatorsAmt > 0) {
      s.perValidatorAmt = validatorsAmt / uint256(eligible);
    } else {
      s.perValidatorAmt = 0;
    }

    // Pay fixed recipients immediately
    if (daoAmt > 0) _pay(c.daoTreasurySnapshot, daoAmt);
    if (creatorAmt > 0) _pay(c.challenger, creatorAmt);
    if (charityAmt > 0 && c.charity != address(0)) _pay(c.charity, charityAmt);

    emit FeesPaid(c.id, daoAmt, creatorAmt, validatorsAmt, charityAmt, loserCashback);
    emit SnapshotSet(c.id, success, uint8(rs), eligible);

    // Freeze pools and principal; funds remain for claims
    c.poolSuccess = 0;
    c.poolFail    = 0;
    c.stake       = 0;
    c.proposalBond= 0;

    _unlockValidatorVotes(c);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims (finalized)
  // ────────────────────────────────────────────────────────────────────────────
  function claimWinner(uint256 id) external nonReentrant {
    Snapshot storage s = snapshots[id];
    if (!s.set) revert SnapshotNotSet();

    Challenge storage c = challenges[id];
    bool success = s.success;

    uint256 principal = success ? c.contribSuccess[msg.sender] : c.contribFail[msg.sender];
    if (principal == 0) revert NotEligible();
    if (s.winnerClaimed[msg.sender]) revert AlreadyClaimed();
    s.winnerClaimed[msg.sender] = true;

    uint256 amt = principal;
    if (s.perWinnerBonusX > 0) {
        amt += (principal * s.perWinnerBonusX) / 1e18;
    }
    _pay(msg.sender, amt);
    emit WinnerClaimed(id, msg.sender, amt);
  }

  function claimLoserCashback(uint256 id) external nonReentrant {
    Snapshot storage s = snapshots[id];
    if (!s.set) revert SnapshotNotSet();

    Challenge storage c = challenges[id];
    bool success = s.success;

    uint256 principal = success ? c.contribFail[msg.sender] : c.contribSuccess[msg.sender];
    if (principal == 0) revert NotEligible();
    if (s.loserCashbackClaimed[msg.sender]) revert AlreadyClaimed();
    s.loserCashbackClaimed[msg.sender] = true;

    uint256 amt = 0;
    if (s.perLoserCashbackX > 0) {
        amt = (principal * s.perLoserCashbackX) / 1e18;
        if (amt > 0) _pay(msg.sender, amt);
    }
    emit LoserCashbackClaimed(id, msg.sender, amt);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims (validator reward — finalized)
  // ────────────────────────────────────────────────────────────────────────────
  function _claimValidatorReward(uint256 id, address v) internal {
    Snapshot storage s = snapshots[id];
    if (!s.set) revert SnapshotNotSet();
    if (s.perValidatorAmt == 0) revert NotEligible();

    Challenge storage c = challenges[id];
    if (!c.voted[v]) revert NotEligible();
    if (s.validatorClaimed[v]) revert AlreadyClaimed();

    bool vy = c.votedYes[v];
    RightSide rs = RightSide(s.rightSide);
    bool right = (rs == RightSide.Approval && vy) || (rs == RightSide.Reject && !vy);
    if (!right) revert NotEligible();

    s.validatorClaimed[v] = true;
    _pay(v, s.perValidatorAmt);
    emit ValidatorClaimed(id, v, s.perValidatorAmt);
  }

  function claimValidatorReward(uint256 id) public nonReentrant {
    _claimValidatorReward(id, msg.sender);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Claims (reject path — claim-based, no loops)
  // ────────────────────────────────────────────────────────────────────────────

  function _claimValidatorReject(uint256 id, address v) internal {
    uint256 per = rejectPerValidatorAmt[id];
    require(per > 0, "no reject share");

    Challenge storage c = challenges[id];
    require(c.status == Status.Rejected, "not rejected");
    require(c.voted[v], "not a voter");
    if (rejectValidatorClaimed[id][v]) revert AlreadyClaimed();

    rejectValidatorClaimed[id][v] = true;
    _pay(v, per);
    emit ValidatorRejectClaimed(id, v, per);
  }

  function claimValidatorReject(uint256 id) public nonReentrant {
    _claimValidatorReject(id, msg.sender);
  }

  function claimValidator(uint256 id) external nonReentrant {
    if (snapshots[id].set) {
        _claimValidatorReward(id, msg.sender);
    } else {
        _claimValidatorReject(id, msg.sender);
    }
  }

  /// Any non-creator contributor claims full refund of their contribs (success + fail) on reject.
  /// Creator's *extra* success (beyond stake) is included here as well (so creator can claim that part too),
  /// while the creator's (stake + bond - reject fee) is claimed via `claimRejectCreator`.
  function claimRejectContribution(uint256 id) external nonReentrant {
    Challenge storage c = challenges[id];
    require(c.status == Status.Rejected, "not rejected");
    require(rejectSet[id], "reject not staged");

    if (rejectContributorClaimed[id][msg.sender]) revert AlreadyClaimed();
    uint256 successAmt = c.contribSuccess[msg.sender];
    uint256 failAmt = c.contribFail[msg.sender];

    // For the creator, this function should only pay "extra success" beyond stake.
    // But computing "extra" here would require stake info; simpler approach:
    // We pay FULL contribSuccess + contribFail to everyone, EXCEPT we will
    // subtract the creator's "stake + bond - fee" from the creator's *creator* claim below.
    // To avoid double paying the creator, we handle it like this:
    // - This function pays ALL contribs (including creator's success and fail).
    // - The creator claim function pays ONLY (stake + bond - fee) MINUS creator's success already refunded (i.e., we correct).
    // However, the original design paid creator: (contribSuccess[creator] + bond - fee).
    // We'll match that by making this function pay everyone EXCEPT the creator's success portion;
    // and the creator's success portion will be included in creator claim to keep totals identical.

    uint256 amt;
    if (msg.sender == c.challenger) {
      // Creator: only refund their fail contributions here; success part handled in creator claim for exact math.
      amt = failAmt;
    } else {
      amt = successAmt + failAmt;
    }

    if (amt == 0) revert NotEligible();
    rejectContributorClaimed[id][msg.sender] = true;
    _pay(msg.sender, amt);
    emit RejectContributionClaimed(id, msg.sender, amt);
  }

  /// Creator claims: (stake + bond - fee) + creator's success contributions
  /// to match the original total paid to creator on reject:
  /// totalCreator = contribSuccess[creator] + proposalBond - fee.
  function claimRejectCreator(uint256 id) external nonReentrant {
    Challenge storage c = challenges[id];
    require(c.status == Status.Rejected, "not rejected");
    require(rejectSet[id], "reject not staged");
    if (msg.sender != c.challenger) revert NotAdmin(); // reuse error; or define NotCreator()

    if (rejectCreatorClaimed[id]) revert AlreadyClaimed();

    // Compute the amounts exactly as in original design:
    // contributors (non-creator): refunded elsewhere
    // creator: contribSuccess[creator] + proposalBond - fee
    uint256 base = c.stake + c.proposalBond;
    uint256 fee  = (base * feeConfig.rejectFeeBps) / 10_000;

    uint256 owed = c.contribSuccess[c.challenger] + c.proposalBond;
    if (fee > owed) revert NotEligible(); // sanity
    owed -= fee;

    // Mark claimed and pay
    rejectCreatorClaimed[id] = true;
    _pay(c.challenger, owed);
    emit RejectCreatorClaimed(id, c.challenger, owed);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────
  function _addSuccess(Challenge storage c, address u, uint256 amt) internal {
    if (!c.successSeen[u]) { c.successSeen[u] = true; c.successContribs.push(u); }
    c.contribSuccess[u] += amt;
  }

  function _addFail(Challenge storage c, address u, uint256 amt) internal {
    if (!c.failSeen[u]) { c.failSeen[u] = true; c.failContribs.push(u); }
    c.contribFail[u] += amt;
  }

  function _markParticipant(Challenge storage c, address u) internal {
    if (!c.participantSeen[u]) {
      c.participantSeen[u] = true;
      c.participantsCount += 1;
    }
  }

  function _enforceParticipantCap(Challenge storage c, address u) internal {
    if (!c.participantSeen[u]) {
      if (c.maxParticipants > 0 && c.participantsCount >= c.maxParticipants) revert MaxParticipantsReached();
      c.participantSeen[u] = true;
      c.participantsCount += 1;
    }
  }

  function _unlockValidatorVotes(Challenge storage c) internal {
    for (uint256 i=0; i<c.voters.length; ++i) {
      address v = c.voters[i];
      if (voteLocks[v] > 0) voteLocks[v] -= 1;
    }
    // keep voters[] for auditing / claims
  }

  // Reject path — now **claim-based** for contributors & creator, **no loops**
  function _refundNotApproved(Challenge storage c) internal {
    require(!c.payoutsDone, "dup");
    c.payoutsDone = true;

    // platform fee on (stake + bond)
    uint256 base = c.stake + c.proposalBond;
    uint256 fee  = (base * feeConfig.rejectFeeBps) / 10_000;
    uint256 dao  = (base * feeConfig.rejectDaoBps) / 10_000;
    uint256 validators = (base * feeConfig.rejectValidatorsBps) / 10_000;
    require(dao + validators == fee, "reject fee split");

    // Save per-cap validator share for claim; remainder to DAO
    uint256 voters = c.voters.length;
    if (validators > 0) {
      if (voters == 0) {
        _pay(c.daoTreasurySnapshot, validators);
      } else {
        uint256 per = validators / voters;
        uint256 rem = validators - per * voters;
        if (per > 0) {
          rejectPerValidatorAmt[c.id] = per;
        }
        if (rem > 0) {
          _pay(c.daoTreasurySnapshot, rem);
        }
      }
    }

    if (dao > 0) _pay(c.daoTreasurySnapshot, dao);

    // Stage reject — contributors and creator will claim individually.
    rejectSet[c.id] = true;
    emit RejectStaged(c.id, dao, rejectPerValidatorAmt[c.id]);

    // Leave pools, stake, bond values intact for claim math;
    // we do NOT zero them here to allow exact computation at claim time.
    // (No further writes occur on rejected challenges besides claim flags.)
  }

  function _pay(address to, uint256 amount) internal {
    if (amount == 0) return;
    (bool ok, ) = payable(to).call{value: amount}("");
    if (!ok) revert NativeSendFailed();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Read-only helpers
  // ────────────────────────────────────────────────────────────────────────────
  function hasSnapshot(uint256 id) external view returns (bool) {
    return snapshots[id].set;
  }

  function getRejectPerValidatorAmt(uint256 id) external view returns (uint256) {
    return rejectPerValidatorAmt[id];
  }

  function getValidatorClaimInfo(uint256 id, address v)
    external
    view
    returns (
      bool snapshotSet,
      bool isRejected,
      bool voted,
      bool rightSide,
      bool alreadyClaimedFinal,
      bool alreadyClaimedReject,
      uint256 perValidatorFinal,
      uint256 perValidatorReject
    )
  {
    Challenge storage c = challenges[id];
    Snapshot storage s = snapshots[id];

    snapshotSet = s.set;
    isRejected = (c.status == Status.Rejected);
    voted = c.voted[v];

    if (snapshotSet) {
      bool vy = c.votedYes[v];
      RightSide rs = RightSide(s.rightSide);
      rightSide = (rs == RightSide.Approval && vy) || (rs == RightSide.Reject && !vy);
      alreadyClaimedFinal = s.validatorClaimed[v];
      perValidatorFinal = s.perValidatorAmt;
    } else {
      rightSide = false;
      alreadyClaimedFinal = false;
      perValidatorFinal = 0;
    }

    alreadyClaimedReject = rejectValidatorClaimed[id][v];
    perValidatorReject = rejectPerValidatorAmt[id];
  }

  receive() external payable {}
}