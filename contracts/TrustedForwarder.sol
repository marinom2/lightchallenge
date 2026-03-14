// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title TrustedForwarder
 * @notice EIP-2771 style forwarder with EIP-712 signed requests.
 *
 * STATUS: Deployed but DORMANT. No target contracts are currently allowed.
 * The forwarder is retained for future gasless transaction support.
 * To activate: owner must call setTargetAllowed() for each target contract.
 *
 * Security features:
 * - Ownable2Step ownership transfer (prevents accidental lockout)
 * - Nonce per signer (replay protection)
 * - Optional deadline (0 = no deadline)
 * - Allowed target allowlist (critical — empty by default)
 * - Optional relayer allowlist (recommended for production)
 *
 * Target contracts must:
 * - trust this forwarder address
 * - decode original sender from the last 20 bytes of calldata (ERC2771Context does this)
 */
contract TrustedForwarder is EIP712, Ownable2Step {
  using ECDSA for bytes32;

  struct ForwardRequest {
    address from;
    address to;
    uint256 value;
    uint256 gas;
    uint256 nonce;
    uint256 deadline; // 0 = no deadline
    bytes data;
  }

  bytes32 private constant _TYPEHASH =
    keccak256(
      "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,bytes data)"
    );

  mapping(address => uint256) public nonces;

  // Target allowlist
  mapping(address => bool) public isTargetAllowed;

  // Optional relayer allowlist
  bool public restrictRelayers;
  mapping(address => bool) public isRelayerAllowed;

  event TargetAllowed(address indexed target, bool allowed);
  event RelayerRestrictionSet(bool restricted);
  event RelayerAllowed(address indexed relayer, bool allowed);

  event Executed(
    address indexed relayer,
    address indexed from,
    address indexed to,
    bytes4 selector,
    bool success
  );

  error BadTarget();
  error Expired();
  error BadNonce();
  error BadSig();
  error RelayerNotAllowed();
  error CallFailed();

  constructor(address initialOwner)
    EIP712("TrustedForwarder", "1")
    Ownable(initialOwner)
  {}

  receive() external payable {}

  // ────────────────────────────────────────────────────────────────────────────
  // Admin controls
  // ────────────────────────────────────────────────────────────────────────────
  function setTargetAllowed(address target, bool allowed) external onlyOwner {
    isTargetAllowed[target] = allowed;
    emit TargetAllowed(target, allowed);
  }

  function setRestrictRelayers(bool restricted) external onlyOwner {
    restrictRelayers = restricted;
    emit RelayerRestrictionSet(restricted);
  }

  function setRelayerAllowed(address relayer, bool allowed) external onlyOwner {
    isRelayerAllowed[relayer] = allowed;
    emit RelayerAllowed(relayer, allowed);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-712 helpers
  // ────────────────────────────────────────────────────────────────────────────
  function getDigest(ForwardRequest calldata req) public view returns (bytes32) {
    bytes32 structHash = keccak256(
      abi.encode(
        _TYPEHASH,
        req.from,
        req.to,
        req.value,
        req.gas,
        req.nonce,
        req.deadline,
        keccak256(req.data)
      )
    );
    return _hashTypedDataV4(structHash);
  }

  function verify(ForwardRequest calldata req, bytes calldata sig) public view returns (bool) {
    if (!isTargetAllowed[req.to]) return false;
    if (req.deadline != 0 && block.timestamp > req.deadline) return false;
    if (nonces[req.from] != req.nonce) return false;

    address recovered = getDigest(req).recover(sig);
    return recovered == req.from;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Execute
  // ────────────────────────────────────────────────────────────────────────────
  function execute(ForwardRequest calldata req, bytes calldata sig)
    external
    payable
    returns (bytes memory ret)
  {
    if (restrictRelayers && !isRelayerAllowed[msg.sender]) revert RelayerNotAllowed();
    if (!isTargetAllowed[req.to]) revert BadTarget();
    if (req.deadline != 0 && block.timestamp > req.deadline) revert Expired();
    if (nonces[req.from] != req.nonce) revert BadNonce();

    address recovered = getDigest(req).recover(sig);
    if (recovered != req.from) revert BadSig();

    // consume nonce before external call
    nonces[req.from] = req.nonce + 1;

    // EIP-2771: append `from` to calldata
    bytes memory callData = abi.encodePacked(req.data, req.from);

    (bool ok, bytes memory res) = req.to.call{value: req.value, gas: req.gas}(callData);
    if (!ok) revert CallFailed();

    emit Executed(msg.sender, req.from, req.to, _selector(req.data), ok);
    return res;
  }

  function _selector(bytes calldata data) private pure returns (bytes4 sel) {
    if (data.length >= 4) {
      assembly {
        sel := calldataload(data.offset)
      }
    }
  }
}