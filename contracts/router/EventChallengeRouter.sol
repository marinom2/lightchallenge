// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChallengePay {
    function finalize(uint256 challengeId, address subject, bytes calldata proof) external;
    function paused() external view returns (bool);
}

interface IMetadataRegistry {
    function setURI(address contractAddr, uint256 id, string calldata uri) external;
}

contract EventChallengeRouter {
    address public owner;
    IChallengePay public immutable challenge;
    IMetadataRegistry public immutable registry;

    struct Outcome {
        string name;            // e.g., "Canelo", "Crawford", "Draw"
        uint256 challengeId;    // underlying ChallengePay challenge
        address subject;        // subject/right side address used at finalize time
    }

    struct EventInfo {
        string title;           // "Canelo vs Crawford"
        string metaURI;         // ipfs://... (optional)
        bool finalized;
        uint8 winnerIndex;      // index into outcomes[]
        Outcome[] outcomes;
    }

    mapping(bytes32 => EventInfo) private events; // eventId => info

    event OwnerChanged(address indexed prev, address indexed next);
    event EventRegistered(bytes32 indexed eventId, string title);
    event OutcomeAdded(bytes32 indexed eventId, uint8 index, string name, uint256 challengeId, address subject);
    event EventURISet(bytes32 indexed eventId, string uri);
    event EventFinalized(bytes32 indexed eventId, uint8 winnerIndex);

    modifier onlyOwner() { require(msg.sender == owner, "not-owner"); _; }

    constructor(address challengePay, address metadataRegistry) {
        owner = msg.sender;
        challenge = IChallengePay(challengePay);
        registry = IMetadataRegistry(metadataRegistry);
    }

    function transferOwnership(address n) external onlyOwner { emit OwnerChanged(owner, n); owner = n; }

    function registerEvent(bytes32 eventId, string calldata title) external onlyOwner {
        EventInfo storage e = events[eventId];
        require(bytes(e.title).length == 0, "exists");
        e.title = title;
        emit EventRegistered(eventId, title);
    }

    function addOutcome(bytes32 eventId, string calldata name, uint256 challengeId, address subject) external onlyOwner {
        EventInfo storage e = events[eventId];
        require(bytes(e.title).length != 0, "event-missing");
        e.outcomes.push(Outcome(name, challengeId, subject));
        emit OutcomeAdded(eventId, uint8(e.outcomes.length-1), name, challengeId, subject);
    }

    function setEventURI(bytes32 eventId, string calldata uri) external onlyOwner {
        EventInfo storage e = events[eventId];
        require(bytes(e.title).length != 0, "event-missing");
        e.metaURI = uri;
        // Optionally write into MetadataRegistry using (this,eventIndex) as key 0
        registry.setURI(address(this), uint256(eventId), uri);
        emit EventURISet(eventId, uri);
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

    /**
     * @notice Finalize winning outcome by forwarding proof to underlying ChallengePay.
     * @dev Owner-mediated by default. You can extend with m-of-n or verifier gating later.
     */
    function finalizeEvent(bytes32 eventId, uint8 winnerIndex, bytes calldata proof) external onlyOwner {
        EventInfo storage e = events[eventId];
        require(!e.finalized, "finalized");
        require(winnerIndex < e.outcomes.length, "bad-index");

        Outcome storage w = e.outcomes[winnerIndex];
        // Forward finalize to underlying ChallengePay
        challenge.finalize(w.challengeId, w.subject, proof);

        e.finalized = true;
        e.winnerIndex = winnerIndex;
        emit EventFinalized(eventId, winnerIndex);
    }
}
