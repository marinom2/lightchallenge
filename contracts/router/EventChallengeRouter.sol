// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IChallengePay {
  function submitProof(uint256 id, bytes calldata proof) external;
  function finalize(uint256 id) external;
}

interface IMetadataRegistry {
  function ownerSet(address contractAddr, uint256 id, string calldata uri) external;
}

error NotOwner();
error EventExists();
error EventMissing();
error AlreadyFinalized();
error BadIndex();
error ZeroAddress();

contract EventChallengeRouter is IERC165 {
  address public owner;
  IChallengePay public immutable challenge;
  IMetadataRegistry public immutable registry;

  struct Outcome {
    string name;
    uint256 challengeId;
    address subject; // for UI; ChallengePay binds to challenger internally
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
  event EventRegistered(bytes32 indexed eventId, string title);
  event OutcomeAdded(bytes32 indexed eventId, uint8 index, string name, uint256 challengeId, address subject);
  event EventURISet(bytes32 indexed eventId, string uri);
  event EventFinalized(bytes32 indexed eventId, uint8 winnerIndex);

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  constructor(address challengePay, address metadataRegistry) {
    if (challengePay == address(0) || metadataRegistry == address(0)) revert ZeroAddress();
    owner = msg.sender;
    challenge = IChallengePay(challengePay);
    registry = IMetadataRegistry(metadataRegistry);
    emit OwnerChanged(address(0), msg.sender);
  }

  function transferOwnership(address n) external onlyOwner {
    if (n == address(0)) revert ZeroAddress();
    emit OwnerChanged(owner, n);
    owner = n;
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
    // Best-effort mirror into external registry
    try registry.ownerSet(address(this), uint256(eventId), uri) {} catch {}
    emit EventURISet(eventId, uri);
  }

  function finalizeEvent(bytes32 eventId, uint8 winnerIndex, bytes calldata proof) external onlyOwner {
    EventInfo storage e = events[eventId];
    if (bytes(e.title).length == 0) revert EventMissing();
    if (e.finalized) revert AlreadyFinalized();
    if (winnerIndex >= e.outcomes.length) revert BadIndex();

    Outcome storage w = e.outcomes[winnerIndex];

    // Step 1: submit proof (if the challenge requires one)
    // Safe to try/catch: some challenges may not require proof or may reject empty proof.
    try challenge.submitProof(w.challengeId, proof) { } catch { }

    // Step 2: finalize challenge
    challenge.finalize(w.challengeId);

    e.finalized = true;
    e.winnerIndex = winnerIndex;
    emit EventFinalized(eventId, winnerIndex);
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