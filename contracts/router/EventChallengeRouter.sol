// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title EventChallengeRouter
 * @notice Routes multi-outcome events to individual ChallengePay challenges.
 *
 * An "event" (e.g., "Team A vs Team B") maps to N outcomes, each bound to a
 * ChallengePay challenge ID and a subject address. When the event outcome is
 * known, the owner calls `finalizeEvent` which submits the winning proof and
 * finalizes the corresponding challenge on-chain.
 *
 * Admin-only: all mutating functions are restricted to the owner.
 */

interface IChallengePay {
  /// @notice Submit a proof on behalf of a participant (subject).
  function submitProofFor(uint256 id, address participant, bytes calldata proof) external;
  /// @notice Finalize a challenge after the proof/deadline window closes.
  function finalize(uint256 id) external;
}

interface IMetadataRegistry {
  function ownerSet(address contractAddr, uint256 id, string calldata uri) external;
}

error NotOwner();
error NotPendingOwner();
error EventExists();
error EventMissing();
error AlreadyFinalized();
error NotFinalized();
error BadIndex();
error ZeroAddress();

contract EventChallengeRouter is IERC165 {
  address public owner;
  address public pendingOwner;
  IChallengePay public immutable challengePay;
  IMetadataRegistry public immutable registry;

  struct Outcome {
    string name;
    uint256 challengeId;
    address subject; // the participant whose proof is submitted on win
  }

  struct EventInfo {
    string title;
    string metaURI;
    bool finalized;
    uint8 winnerIndex;
    Outcome[] outcomes;
  }

  mapping(bytes32 => EventInfo) private events;

  event OwnerChanged(address indexed prev, address indexed next);
  event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
  event EventRegistered(bytes32 indexed eventId, string title);
  event OutcomeAdded(bytes32 indexed eventId, uint8 index, string name, uint256 challengeId, address subject);
  event EventURISet(bytes32 indexed eventId, string uri);
  event EventFinalized(bytes32 indexed eventId, uint8 winnerIndex);

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  constructor(address _challengePay, address _metadataRegistry) {
    if (_challengePay == address(0) || _metadataRegistry == address(0)) revert ZeroAddress();
    owner = msg.sender;
    challengePay = IChallengePay(_challengePay);
    registry = IMetadataRegistry(_metadataRegistry);
    emit OwnerChanged(address(0), msg.sender);
  }

  function transferOwnership(address n) external onlyOwner {
    if (n == address(0)) revert ZeroAddress();
    pendingOwner = n;
    emit OwnershipTransferStarted(owner, n);
  }

  function acceptOwnership() external {
    if (msg.sender != pendingOwner) revert NotPendingOwner();
    emit OwnerChanged(owner, msg.sender);
    owner = msg.sender;
    pendingOwner = address(0);
  }

  function registerEvent(bytes32 eventId, string calldata title) external onlyOwner {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length != 0) revert EventExists();
    e.title = title;
    emit EventRegistered(eventId, title);
  }

  function addOutcome(bytes32 eventId, string calldata name, uint256 challengeId, address subject)
    external
    onlyOwner
  {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length == 0) revert EventMissing();
    e.outcomes.push(Outcome(name, challengeId, subject));
    emit OutcomeAdded(eventId, uint8(e.outcomes.length - 1), name, challengeId, subject);
  }

  function setEventURI(bytes32 eventId, string calldata uri) external onlyOwner {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length == 0) revert EventMissing();
    e.metaURI = uri;
    // Best-effort mirror into external metadata registry
    try registry.ownerSet(address(this), uint256(eventId), uri) {} catch {}
    emit EventURISet(eventId, uri);
  }

  /**
   * @notice Finalize an event by declaring the winning outcome.
   * @param eventId  The event identifier.
   * @param winnerIndex  Index into the outcomes array for the winner.
   * @param proof  Proof payload passed to ChallengePay.submitProofFor for the winning subject.
   *
   * Step 1: Submit proof for the winning outcome's subject via submitProofFor.
   *         This is try/catch because the challenge may already have a proof,
   *         the proof window may have closed, or the verifier may reject.
   * Step 2: Finalize the challenge. This will revert if the challenge is not
   *         yet ready to finalize (e.g., proof deadline hasn't passed).
   */
  function finalizeEvent(bytes32 eventId, uint8 winnerIndex, bytes calldata proof) external onlyOwner {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length == 0) revert EventMissing();
    if (e.finalized) revert AlreadyFinalized();
    if (winnerIndex >= e.outcomes.length) revert BadIndex();

    Outcome storage w = e.outcomes[winnerIndex];

    // Submit proof on behalf of the winning subject
    try challengePay.submitProofFor(w.challengeId, w.subject, proof) {} catch {}

    // Finalize the challenge (determines outcome based on winners)
    challengePay.finalize(w.challengeId);

    e.finalized = true;
    e.winnerIndex = winnerIndex;
    emit EventFinalized(eventId, winnerIndex);
  }

  /**
   * @notice Finalize losing outcomes after the event has been resolved.
   * Losing challenges are finalized with no proof submission, resulting
   * in Outcome.Fail (no winners = all participants are losers).
   * This is optional — challenges will also finalize naturally after
   * their proof deadline passes. This function just accelerates it.
   */
  function finalizeLosingOutcomes(bytes32 eventId) external onlyOwner {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length == 0) revert EventMissing();
    if (!e.finalized) revert NotFinalized(); // must resolve winner first

    for (uint256 i = 0; i < e.outcomes.length; i++) {
      if (i == e.winnerIndex) continue; // skip winner
      try challengePay.finalize(e.outcomes[i].challengeId) {} catch {}
    }
  }

  function getEvent(bytes32 eventId) external view returns (
    string memory title,
    string memory metaURI,
    bool finalized,
    uint8 winnerIndex,
    Outcome[] memory outcomes
  ) {
    EventInfo storage e = events[eventId];
    return (e.title, e.metaURI, e.finalized, e.winnerIndex, e.outcomes);
  }

  function outcomesCount(bytes32 eventId) external view returns (uint256) {
    return events[eventId].outcomes.length;
  }

  // IERC165
  function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
    return interfaceId == type(IERC165).interfaceId;
  }
}
