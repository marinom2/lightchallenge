// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ChallengeTaskRegistry is Ownable {
    struct Binding {
        uint256 requestId;
        bytes32 taskId;
        bytes32 modelDigest;     // should match AIVM request.modelDigest
        bytes32 paramsHash;      // should match AIVM request.detConfigHash
        bytes32 benchmarkHash;   // optional benchmark/ruleset binding
        uint16 schemaVersion;    // result schema version
        bool exists;
    }

    mapping(address => bool) public dispatchers;
    mapping(uint256 => mapping(address => Binding)) private _bindings;

    event DispatcherSet(address indexed dispatcher, bool allowed);

    event BindingRecorded(
        uint256 indexed challengeId,
        address indexed subject,
        uint256 requestId,
        bytes32 taskId,
        bytes32 modelDigest,
        bytes32 paramsHash,
        bytes32 benchmarkHash,
        uint16 schemaVersion
    );

    event BindingCleared(
        uint256 indexed challengeId,
        address indexed subject
    );

    error NotAuthorized();
    error InvalidSubject();
    error InvalidTask();
    error InvalidRequestId();
    error InvalidModelDigest();
    error InvalidSchemaVersion();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyDispatcherOrOwner() {
        if (msg.sender != owner() && !dispatchers[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    function setDispatcher(address dispatcher, bool allowed) external onlyOwner {
        dispatchers[dispatcher] = allowed;
        emit DispatcherSet(dispatcher, allowed);
    }

    function recordBinding(
        uint256 challengeId,
        address subject,
        uint256 requestId,
        bytes32 taskId,
        bytes32 modelDigest,
        bytes32 paramsHash,
        bytes32 benchmarkHash,
        uint16 schemaVersion
    ) external onlyDispatcherOrOwner {
        if (subject == address(0)) revert InvalidSubject();
        if (requestId == 0) revert InvalidRequestId();
        if (taskId == bytes32(0)) revert InvalidTask();
        if (modelDigest == bytes32(0)) revert InvalidModelDigest();
        if (schemaVersion == 0) revert InvalidSchemaVersion();

        _bindings[challengeId][subject] = Binding({
            requestId: requestId,
            taskId: taskId,
            modelDigest: modelDigest,
            paramsHash: paramsHash,
            benchmarkHash: benchmarkHash,
            schemaVersion: schemaVersion,
            exists: true
        });

        emit BindingRecorded(
            challengeId,
            subject,
            requestId,
            taskId,
            modelDigest,
            paramsHash,
            benchmarkHash,
            schemaVersion
        );
    }

    function clearBinding(
        uint256 challengeId,
        address subject
    ) external onlyDispatcherOrOwner {
        delete _bindings[challengeId][subject];
        emit BindingCleared(challengeId, subject);
    }

    function getBinding(
        uint256 challengeId,
        address subject
    )
        external
        view
        returns (
            uint256 requestId,
            bytes32 taskId,
            bytes32 modelDigest,
            bytes32 paramsHash,
            bytes32 benchmarkHash,
            uint16 schemaVersion,
            bool exists
        )
    {
        Binding memory b = _bindings[challengeId][subject];
        return (
            b.requestId,
            b.taskId,
            b.modelDigest,
            b.paramsHash,
            b.benchmarkHash,
            b.schemaVersion,
            b.exists
        );
    }

    function bindingExists(
        uint256 challengeId,
        address subject
    ) external view returns (bool) {
        return _bindings[challengeId][subject].exists;
    }
}