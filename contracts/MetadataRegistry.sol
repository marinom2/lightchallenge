// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// ──────────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────────

error NotOwner();
error ZeroAddress();
error LenMismatch();
error AlreadySet();
error EmptyUri();

/// @notice Public interface for ERC-165 discovery
interface IMetadataRegistry is IERC165 {
    // ── Views ────────────────────────────────────────────────────────────────
    function uri(address challengeContract, uint256 challengeId) external view returns (string memory);
    function hasUri(address challengeContract, uint256 challengeId) external view returns (bool);
    function getMany(
        address[] calldata challengeContracts,
        uint256[] calldata challengeIds
    ) external view returns (string[] memory out);

    // ── Ownership ────────────────────────────────────────────────────────────
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function transferOwnership(address newOwner) external;
    function acceptOwnership() external;

    // ── Write-once (normal path) ─────────────────────────────────────────────
    function ownerSet(address challengeContract, uint256 challengeId, string calldata newUri) external;
    function ownerSetBatch(address[] calldata challengeContracts, uint256[] calldata challengeIds, string[] calldata uris) external;

    // ── Force overwrite (corrections only — distinct audit event) ────────────
    function ownerForceSet(address challengeContract, uint256 challengeId, string calldata newUri) external;

    // ── Clear ────────────────────────────────────────────────────────────────
    function ownerClear(address challengeContract, uint256 challengeId) external;
}

/**
 * @title MetadataRegistry
 * @notice Pointer registry: (challengeContract, challengeId) -> metadata URI.
 *
 * Write-once by default: ownerSet() reverts if a URI already exists.
 * Corrections use ownerForceSet(), which emits a distinct MetadataForceSet
 * event logging both old and new URIs for full auditability.
 *
 * Write access is owner-only. The owner is the system/admin wallet that manages
 * metadata on behalf of the product backend. Two-step ownership transfer.
 *
 * No on-chain introspection of ChallengePay or any other contract.
 * No creator/challenger write paths.
 */
contract MetadataRegistry is IMetadataRegistry {
    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Emitted on initial write (ownerSet / ownerSetBatch)
    event MetadataSet(
        address indexed challengeContract,
        uint256 indexed challengeId,
        address indexed setter,
        string newUri
    );

    /// @notice Emitted when ownerForceSet overwrites an existing URI.
    ///         Logs both previous and new URI for audit.
    event MetadataForceSet(
        address indexed challengeContract,
        uint256 indexed challengeId,
        address indexed setter,
        string previousUri,
        string newUri
    );

    /// @notice Emitted when ownerClear removes a URI.
    event MetadataCleared(
        address indexed challengeContract,
        uint256 indexed challengeId,
        address indexed clearer
    );

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ──────────────────────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────────────────────

    address public override owner;
    address public override pendingOwner;

    // challengeContract => challengeId => uri
    mapping(address => mapping(uint256 => string)) private _uri;

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Ownership (two-step)
    // ──────────────────────────────────────────────────────────────────────────

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

    // ──────────────────────────────────────────────────────────────────────────
    // Write-once (normal path)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Set metadata URI. Reverts if already set (write-once).
    function ownerSet(
        address challengeContract,
        uint256 challengeId,
        string calldata newUri
    ) external override onlyOwner {
        if (bytes(newUri).length == 0) revert EmptyUri();
        if (bytes(_uri[challengeContract][challengeId]).length != 0) revert AlreadySet();
        _uri[challengeContract][challengeId] = newUri;
        emit MetadataSet(challengeContract, challengeId, msg.sender, newUri);
    }

    /// @notice Batch write-once. Reverts if any entry is already set.
    function ownerSetBatch(
        address[] calldata challengeContracts,
        uint256[] calldata challengeIds,
        string[] calldata uris
    ) external override onlyOwner {
        uint256 n = challengeContracts.length;
        if (n != challengeIds.length || n != uris.length) revert LenMismatch();
        for (uint256 i = 0; i < n; i++) {
            if (bytes(uris[i]).length == 0) revert EmptyUri();
            if (bytes(_uri[challengeContracts[i]][challengeIds[i]]).length != 0) revert AlreadySet();
            _uri[challengeContracts[i]][challengeIds[i]] = uris[i];
            emit MetadataSet(challengeContracts[i], challengeIds[i], msg.sender, uris[i]);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Force overwrite (corrections)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Overwrite an existing URI. Emits MetadataForceSet with old+new for audit.
    ///         Use only for corrections — normal writes should use ownerSet.
    function ownerForceSet(
        address challengeContract,
        uint256 challengeId,
        string calldata newUri
    ) external override onlyOwner {
        if (bytes(newUri).length == 0) revert EmptyUri();
        string memory prev = _uri[challengeContract][challengeId];
        _uri[challengeContract][challengeId] = newUri;
        emit MetadataForceSet(challengeContract, challengeId, msg.sender, prev, newUri);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Clear
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Remove a metadata URI. Emits MetadataCleared.
    function ownerClear(
        address challengeContract,
        uint256 challengeId
    ) external override onlyOwner {
        delete _uri[challengeContract][challengeId];
        emit MetadataCleared(challengeContract, challengeId, msg.sender);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────────────────

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

    // ──────────────────────────────────────────────────────────────────────────
    // ERC-165
    // ──────────────────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IMetadataRegistry).interfaceId;
    }
}
