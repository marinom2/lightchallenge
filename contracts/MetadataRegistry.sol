// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title MetadataRegistry
 * @notice Sidecar registry mapping (challengeContract, challengeId) -> metadata URI.
 *
 * Roles:
 *  - owner: can set/overwrite/clear any URI (and batch set).
 *  - challenger: as reported by the challenge contract, can set once (if empty).
 *  - challenge contract itself: may set once on behalf of challenger (if empty).
 *
 * Integration notes:
 *  - The registry is decoupled from any single ChallengePay version.
 *  - It tries `getChallenge(id)` first, and falls back to `challengerOf(id)` if available.
 *  - If neither is present or the call fails, challenger is treated as address(0).
 */
interface IChallengeCore {
    struct ChallengeView {
        uint8 status;
        uint8 outcome;
        address challenger;
        uint8 currency;
        address token;
        uint256 stakeAmount;
        uint256 proposalBond;
        uint256 approvalDeadline;
        uint256 startTs;
        uint8 peerApprovalsNeeded;
        uint16 charityBps;
        address charity;
        uint256 poolSuccess;
        uint256 poolFail;
    }
    function getChallenge(uint256 id) external view returns (ChallengeView memory);
}

interface IChallengeCoreAlt {
    function challengerOf(uint256 id) external view returns (address);
}

// ──────────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────────

error NotOwner();
error ZeroAddress();
error NotChallenger();
error AlreadySet();
error LenMismatch();
error EmptyUri();

/// @notice Public interface for ERC-165 discovery
interface IMetadataRegistry is IERC165 {
    function uri(address challengeContract, uint256 challengeId) external view returns (string memory);
    function hasUri(address challengeContract, uint256 challengeId) external view returns (bool);

    /// @notice Batch get multiple URIs in one call
    function getMany(
        address[] calldata challengeContracts,
        uint256[] calldata challengeIds
    ) external view returns (string[] memory out);

    // Ownership
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function transferOwnership(address newOwner) external;
    function acceptOwnership() external;

    // Owner writes
    function ownerSet(address challengeContract, uint256 challengeId, string calldata newUri) external;
    function ownerSetBatch(address[] calldata challengeContracts, uint256[] calldata challengeIds, string[] calldata uris) external;
    function ownerClear(address challengeContract, uint256 challengeId) external;

    // Challenger/Contract writes
    function challengerSet(address challengeContract, uint256 challengeId, string calldata newUri) external;
    function contractSet(address challengeContract, uint256 challengeId, string calldata newUri) external;
}

contract MetadataRegistry is IMetadataRegistry {
    // ──────────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────────

    event MetadataSet(
        address indexed challengeContract,
        uint256 indexed challengeId,
        address indexed setter,
        string newUri
    );
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ──────────────────────────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────────────────────────

    address public override owner;
    address public override pendingOwner;

    // challengeContract => challengeId => uri
    mapping(address => mapping(uint256 => string)) private _uri;

    // ──────────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Ownership (two-step)
    // ──────────────────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external override onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external override {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Owner writes
    // ──────────────────────────────────────────────────────────────────────────────

    function ownerSet(
        address challengeContract,
        uint256 challengeId,
        string calldata newUri
    ) external override onlyOwner {
        _set(challengeContract, challengeId, newUri);
    }

    function ownerSetBatch(
        address[] calldata challengeContracts,
        uint256[] calldata challengeIds,
        string[] calldata uris
    ) external override onlyOwner {
        uint256 n = challengeContracts.length;
        if (n != challengeIds.length || n != uris.length) revert LenMismatch();
        for (uint256 i = 0; i < n; i++) {
            _set(challengeContracts[i], challengeIds[i], uris[i]);
        }
    }

    function ownerClear(address challengeContract, uint256 challengeId) external override onlyOwner {
        _set(challengeContract, challengeId, "");
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Challenger / Contract writes (single-shot)
    // ──────────────────────────────────────────────────────────────────────────────

    function challengerSet(
        address challengeContract,
        uint256 challengeId,
        string calldata newUri
        ) external override {
        address ch = _readChallenger(challengeContract, challengeId);
        if (ch == address(0)) revert NotChallenger();
        if (msg.sender != ch) revert NotChallenger();
        if (bytes(_uri[challengeContract][challengeId]).length != 0) revert AlreadySet();
        if (bytes(newUri).length == 0) revert EmptyUri(); // <── added
        _set(challengeContract, challengeId, newUri);
    }

    function contractSet(
        address challengeContract,
        uint256 challengeId,
        string calldata newUri
    ) external override {
        if (msg.sender != challengeContract) revert NotChallenger();
        if (bytes(_uri[challengeContract][challengeId]).length != 0) revert AlreadySet();
        if (bytes(newUri).length == 0) revert EmptyUri(); // <── added
        _set(challengeContract, challengeId, newUri);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────────────────────

    function uri(address challengeContract, uint256 challengeId) external view override returns (string memory) {
        return _uri[challengeContract][challengeId];
    }

    function hasUri(address challengeContract, uint256 challengeId) external view override returns (bool) {
        return bytes(_uri[challengeContract][challengeId]).length != 0;
    }

    function getMany(
        address[] calldata challengeContracts,
        uint256[] calldata challengeIds
    ) external view override returns (string[] memory out) {
        uint256 n = challengeContracts.length;
        if (n != challengeIds.length) revert LenMismatch();
        out = new string[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = _uri[challengeContracts[i]][challengeIds[i]];
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internals
    // ──────────────────────────────────────────────────────────────────────────────

    function _readChallenger(address core, uint256 id) internal view returns (address) {
        if (core == address(0)) return address(0);
        try IChallengeCore(core).getChallenge(id) returns (IChallengeCore.ChallengeView memory cv) {
            return cv.challenger;
        } catch {
            try IChallengeCoreAlt(core).challengerOf(id) returns (address c) {
                return c;
            } catch {
                return address(0);
            }
        }
    }

    function _set(address challengeContract, uint256 challengeId, string memory newUri) internal {
        _uri[challengeContract][challengeId] = newUri;
        emit MetadataSet(challengeContract, challengeId, msg.sender, newUri);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // ERC-165
    // ──────────────────────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IMetadataRegistry).interfaceId;
    }
}