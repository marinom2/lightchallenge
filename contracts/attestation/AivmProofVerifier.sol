// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IProofVerifier, IProofVerifierEIP712} from "../verifiers/IProofVerifier.sol";

interface IERC1271 {
  function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/**
 * @title AivmProofVerifier
 * @notice Verifies EIP-712 typed "Inference" payloads signed by approved AIVM signers.
 *
 * proof := abi.encode(bytes32 modelId, uint256 modelVersion, bytes payload, bytes signature)
 *
 * Typed data:
 *   Inference(address user,uint256 challengeId,bytes32 modelId,uint256 modelVersion,bytes payload)
 */
contract AivmProofVerifier is Ownable, IProofVerifierEIP712 {
  using ECDSA for bytes32;

  // ────────────────────────────────────────────────────────────────────────────
  // Errors (cheaper than revert strings)
  // ────────────────────────────────────────────────────────────────────────────
  error NotContract();
  error AlreadyListed();
  error NotListed();
  error ZeroAddress();

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-712 constants (compile-time)
  // ────────────────────────────────────────────────────────────────────────────
  string public constant NAME = "AivmProofVerifier";
  string public constant VERSION = "1";

  bytes32 private constant _NAME_HASH = keccak256(bytes("AivmProofVerifier"));
  bytes32 private constant _VERSION_HASH = keccak256(bytes("1"));

  // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
  bytes32 private constant EIP712_DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

  // keccak256("Inference(address user,uint256 challengeId,bytes32 modelId,uint256 modelVersion,bytes payload)")
  bytes32 private constant INFERENCE_TYPEHASH =
    keccak256("Inference(address user,uint256 challengeId,bytes32 modelId,uint256 modelVersion,bytes payload)");

  bytes4 private constant ERC1271_MAGICVALUE = 0x1626ba7e;

  uint256 private immutable _cachedChainId;
  bytes32 private immutable _cachedDomainSeparator;

  constructor(address initialOwner) Ownable(initialOwner) {
    _cachedChainId = block.chainid;
    _cachedDomainSeparator = _buildDomainSeparator();
  }

  function _buildDomainSeparator() private view returns (bytes32) {
    return keccak256(
      abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        _NAME_HASH,
        _VERSION_HASH,
        block.chainid,
        address(this)
      )
    );
  }

  /// @inheritdoc IProofVerifierEIP712
  function domainSeparator() public view override returns (bytes32) {
    return (block.chainid == _cachedChainId) ? _cachedDomainSeparator : _buildDomainSeparator();
  }

  /// @inheritdoc IProofVerifierEIP712
  function structTypehash() public pure override returns (bytes32) {
    return INFERENCE_TYPEHASH;
  }

  /// Convenience alias (clients often look for this)
  function inferenceTypehash() external pure returns (bytes32) {
    return INFERENCE_TYPEHASH;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Signer policy
  // ────────────────────────────────────────────────────────────────────────────
  mapping(address => bool) public isAivmSigner; // EOAs

  // ERC-1271 contract signers (optional)
  address[] public aivmContractSigners;
  mapping(address => bool) public isAivmContractSigner;
  mapping(address => uint256) private _contractSignerIndex; // 1-based index

  // Model policy
  mapping(bytes32 => bool) public allowedModelId;     // off by default
  mapping(bytes32 => uint256) public minModelVersion; // 0 = none

  bool public enforceModelAllowlist;  // off by default
  bool public enforceMinVersion;      // off by default
  bool public enableERC1271Signers;   // off by default

  event AivmSignerUpdated(address indexed signer, bool allowed);
  event AivmContractSignerUpdated(address indexed signer, bool allowed);
  event ModelAllowlistSet(bytes32 indexed modelId, bool allowed);
  event MinModelVersionSet(bytes32 indexed modelId, uint256 minVersion);
  event EnforceModelAllowlist(bool enabled);
  event EnforceMinVersion(bool enabled);
  event EnableERC1271(bool enabled);

  // ────────────────────────────────────────────────────────────────────────────
  // Admin
  // ────────────────────────────────────────────────────────────────────────────
  function setAivmSigner(address signer, bool allowed) external onlyOwner {
    if (signer == address(0)) revert ZeroAddress();
    isAivmSigner[signer] = allowed;
    emit AivmSignerUpdated(signer, allowed);
  }

  function setAivmSigners(address[] calldata signers, bool allowed) external onlyOwner {
    uint256 n = signers.length;
    for (uint256 i = 0; i < n; ) {
      address s = signers[i];
      if (s == address(0)) revert ZeroAddress();
      isAivmSigner[s] = allowed;
      emit AivmSignerUpdated(s, allowed);
      unchecked { ++i; }
    }
  }

  function setAivmContractSigner(address signer, bool allowed) external onlyOwner {
    if (signer == address(0)) revert ZeroAddress();
    if (signer.code.length == 0) revert NotContract();

    bool curr = isAivmContractSigner[signer];
    if (allowed == curr) {
      emit AivmContractSignerUpdated(signer, allowed);
      return;
    }

    if (allowed) {
      // add
      aivmContractSigners.push(signer);
      _contractSignerIndex[signer] = aivmContractSigners.length; // 1-based
      isAivmContractSigner[signer] = true;
    } else {
      // remove (swap & pop)
      uint256 idx1 = _contractSignerIndex[signer];
      if (idx1 == 0) revert NotListed();

      uint256 last = aivmContractSigners.length;
      if (idx1 != last) {
        address lastSigner = aivmContractSigners[last - 1];
        aivmContractSigners[idx1 - 1] = lastSigner;
        _contractSignerIndex[lastSigner] = idx1;
      }
      aivmContractSigners.pop();
      _contractSignerIndex[signer] = 0;
      isAivmContractSigner[signer] = false;
    }

    emit AivmContractSignerUpdated(signer, allowed);
  }

  function setModelAllowed(bytes32 modelId, bool allowed) external onlyOwner {
    allowedModelId[modelId] = allowed;
    emit ModelAllowlistSet(modelId, allowed);
  }

  function setMinModelVersion(bytes32 modelId, uint256 minVersion_) external onlyOwner {
    minModelVersion[modelId] = minVersion_;
    emit MinModelVersionSet(modelId, minVersion_);
  }

  function setEnforceModelAllowlist(bool enabled) external onlyOwner {
    enforceModelAllowlist = enabled;
    emit EnforceModelAllowlist(enabled);
  }

  function setEnforceMinVersion(bool enabled) external onlyOwner {
    enforceMinVersion = enabled;
    emit EnforceMinVersion(enabled);
  }

  function setEnableERC1271(bool enabled) external onlyOwner {
    enableERC1271Signers = enabled;
    emit EnableERC1271(enabled);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-712 helpers
  // ────────────────────────────────────────────────────────────────────────────
  function _structHash(
    address user,
    uint256 challengeId,
    bytes32 modelId,
    uint256 modelVersion,
    bytes memory payload
  ) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        INFERENCE_TYPEHASH,
        user,
        challengeId,
        modelId,
        modelVersion,
        keccak256(payload)
      )
    );
  }

  function _digest(
    address user,
    uint256 challengeId,
    bytes32 modelId,
    uint256 modelVersion,
    bytes memory payload
  ) internal view returns (bytes32) {
    return keccak256(
      abi.encodePacked(
        "\x19\x01",
        domainSeparator(),
        _structHash(user, challengeId, modelId, modelVersion, payload)
      )
    );
  }

  function hashTypedData(
    address user,
    uint256 challengeId,
    bytes32 modelId,
    uint256 modelVersion,
    bytes calldata payload
  ) external view returns (bytes32) {
    // payload must be copied anyway for keccak256(payload) inside _structHash
    return _digest(user, challengeId, modelId, modelVersion, payload);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IProofVerifier
  // NOTE: Must be NON-VIEW to match your IProofVerifier.sol signature.
  // ────────────────────────────────────────────────────────────────────────────
  function verify(
    uint256 challengeId,
    address user,
    bytes calldata proof
  ) external override returns (bool ok) {
    (bytes32 modelId, uint256 modelVersion, bytes memory payload, bytes memory sig) =
      abi.decode(proof, (bytes32, uint256, bytes, bytes));

    if (enforceModelAllowlist && !allowedModelId[modelId]) return false;

    if (enforceMinVersion) {
      uint256 minV = minModelVersion[modelId];
      if (minV != 0 && modelVersion < minV) return false;
    }

    bytes32 digest = _digest(user, challengeId, modelId, modelVersion, payload);

    // EOA path
    (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
    if (err == ECDSA.RecoverError.NoError && isAivmSigner[recovered]) return true;

    // ERC-1271 path (optional)
    if (!enableERC1271Signers) return false;

    uint256 n = aivmContractSigners.length;
    for (uint256 i = 0; i < n; ) {
      if (_isValid1271(aivmContractSigners[i], digest, sig)) return true;
      unchecked { ++i; }
    }
    return false;
  }

  /// Optional fast path: avoids iterating over all contract signers.
  /// proof := abi.encode(modelId, modelVersion, payload, sig, contractSigner)
  function verifyWith1271Signer(
    uint256 challengeId,
    address user,
    bytes calldata proof
  ) external view returns (bool ok) {
    (bytes32 modelId, uint256 modelVersion, bytes memory payload, bytes memory sig, address wallet) =
      abi.decode(proof, (bytes32, uint256, bytes, bytes, address));

    if (!enableERC1271Signers || !isAivmContractSigner[wallet]) return false;

    if (enforceModelAllowlist && !allowedModelId[modelId]) return false;

    if (enforceMinVersion) {
      uint256 minV = minModelVersion[modelId];
      if (minV != 0 && modelVersion < minV) return false;
    }

    bytes32 digest = _digest(user, challengeId, modelId, modelVersion, payload);
    return _isValid1271(wallet, digest, sig);
  }

  function _isValid1271(address wallet, bytes32 digest, bytes memory sig) internal view returns (bool) {
    // wallet is expected to be a contract; keep the check cheap and safe
    if (wallet.code.length == 0) return false;

    (bool ok, bytes memory ret) =
      wallet.staticcall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, digest, sig));

    return ok && ret.length >= 4 && bytes4(ret) == ERC1271_MAGICVALUE;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ERC-165
  // ────────────────────────────────────────────────────────────────────────────
  function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
    return
      interfaceId == type(IERC165).interfaceId ||
      interfaceId == type(IProofVerifierEIP712).interfaceId ||
      interfaceId == type(IProofVerifier).interfaceId;
  }

  // View helper
  function getContractSigners() external view returns (address[] memory) {
    return aivmContractSigners;
  }
}