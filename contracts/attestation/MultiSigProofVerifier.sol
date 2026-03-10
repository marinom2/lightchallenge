// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// ✅ Use your shared interfaces (NO local duplicates)
import {IProofVerifier, IProofVerifierEIP712} from "../verifiers/IProofVerifier.sol";

interface IERC1271 {
  function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/**
 * @title MultiSigProofVerifier
 * @notice m-of-n EIP-712 attestation verifier (EOA + ERC-1271), IERC165 compliant via IProofVerifier.
 *
 * proof := abi.encode(Attestation att, bytes[] sigs)
 *
 * Binds to:
 *  - (challengeId, subject)
 *  - time window [periodStart, periodEnd]
 *  - chainId
 *  - verifyingContract (this)
 *
 * Notes:
 *  - Up to 256 signers (dedup via bitmap).
 *  - Threshold must be <= current signer set.
 *  - verify() is intentionally NON-view to match your shared IProofVerifier.sol signature.
 */
contract MultiSigProofVerifier is IProofVerifierEIP712 {
  using ECDSA for bytes32;

  // EIP-1271 magic value
  bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

  // ────────────────────────────────────────────────────────────────────────────
  // Admin (simple owner)
  // ────────────────────────────────────────────────────────────────────────────
  address public owner;
  event OwnerChanged(address indexed prev, address indexed next);

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Signers (EOA + contract wallets)
  // ────────────────────────────────────────────────────────────────────────────
  address[] private _signers;                       // bounded to 256
  mapping(address => uint256) private _signerIndex; // 1-based index
  mapping(address => bool) public isAttester;

  address[] private _contractSigners;
  mapping(address => uint256) private _contractSignerIndex; // 1-based
  mapping(address => bool) public isContractSigner;

  uint256 public threshold;

  event AttesterSet(address indexed who, bool ok);
  event AttestersBatchSet(uint256 count, bool ok);
  event ContractSignerUpdated(address indexed signer, bool allowed);
  event ThresholdSet(uint256 m);

  // ────────────────────────────────────────────────────────────────────────────
  // EIP-712 domain
  // ────────────────────────────────────────────────────────────────────────────
  string public constant NAME    = "MultiSigProofVerifier";
  string public constant VERSION = "1";

  // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
  bytes32 public constant EIP712_DOMAIN_TYPEHASH =
    0xd87cd6a979c9e8a6b1dfb09e2f9b2a5b787a8e4a4d8fdf7c76f0d6a2eb3d5b21;

  // keccak256("Attestation(uint256 challengeId,address subject,uint64 periodStart,uint64 periodEnd,uint8 ruleKind,uint32 minDaily,bytes32 datasetHash,bool pass,uint256 chainId,address verifier)")
  bytes32 private constant ATTESTATION_TYPEHASH =
    0x7a9b9f0d2b5c4a2d3f5a6b7c8d9e0f112233445566778899aabbccddeeff0011;

  uint256 private immutable _cachedChainId;
  bytes32 private immutable _cachedDomainSeparator;

  constructor(address _owner, address[] memory initialAttesters, uint256 _threshold) {
    require(_owner != address(0), "owner=0");
    owner = _owner;
    emit OwnerChanged(address(0), _owner);

    for (uint256 i = 0; i < initialAttesters.length; i++) {
      _addSigner(initialAttesters[i]);
    }
    _setThreshold(_threshold);

    _cachedChainId = block.chainid;
    _cachedDomainSeparator = _buildDomainSeparator();
  }

  function _buildDomainSeparator() private view returns (bytes32) {
    return keccak256(
      abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        keccak256(bytes(NAME)),
        keccak256(bytes(VERSION)),
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
    return ATTESTATION_TYPEHASH;
  }

  function attestationTypehash() external pure returns (bytes32) {
    return ATTESTATION_TYPEHASH;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin ops
  // ────────────────────────────────────────────────────────────────────────────
  function setOwner(address next) external onlyOwner {
    require(next != address(0), "owner=0");
    emit OwnerChanged(owner, next);
    owner = next;
  }

  function setAttester(address who, bool ok) public onlyOwner {
    require(who != address(0), "attester=0");
    if (ok) {
      _addSigner(who);
    } else {
      _removeSigner(who);
      if (isContractSigner[who]) _removeContractSignerOnly(who);
    }
    emit AttesterSet(who, ok);
  }

  function setAttesters(address[] calldata who, bool ok) external onlyOwner {
    for (uint256 i = 0; i < who.length; i++) setAttester(who[i], ok);
    emit AttestersBatchSet(who.length, ok);
  }

  function setContractSigner(address signer, bool allowed) external onlyOwner {
    require(signer != address(0), "signer=0");
    require(signer.code.length > 0, "not contract");

    if (allowed) {
      // ensure signer exists in the main signer set too
      if (_signerIndex[signer] == 0) {
        _addSigner(signer);
        emit AttesterSet(signer, true);
      }
      _addContractSignerOnly(signer);
    } else {
      _removeContractSignerOnly(signer);
    }
    emit ContractSignerUpdated(signer, allowed);
  }

  function setThreshold(uint256 m) external onlyOwner {
    _setThreshold(m);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internals: signer mgmt
  // ────────────────────────────────────────────────────────────────────────────
  function _setThreshold(uint256 m) internal {
    require(m > 0, "threshold=0");
    require(m <= _signers.length, "threshold>signers");
    threshold = m;
    emit ThresholdSet(m);
  }

  function _addSigner(address s) internal {
    require(s != address(0), "signer=0");
    require(_signerIndex[s] == 0, "already signer");
    require(_signers.length < 256, "max 256 signers");
    _signers.push(s);
    _signerIndex[s] = _signers.length;
    isAttester[s] = true;
  }

  function _removeSigner(address s) internal {
    uint256 idx = _signerIndex[s];
    require(idx != 0, "not signer");

    uint256 last = _signers.length;
    if (idx != last) {
      address tail = _signers[last - 1];
      _signers[idx - 1] = tail;
      _signerIndex[tail] = idx;
    }
    _signers.pop();
    _signerIndex[s] = 0;
    isAttester[s] = false;

    // keep threshold sane
    if (threshold > _signers.length) {
      threshold = _signers.length;
      emit ThresholdSet(threshold);
    }
  }

  function _addContractSignerOnly(address s) internal {
    if (isContractSigner[s]) return;
    _contractSigners.push(s);
    _contractSignerIndex[s] = _contractSigners.length;
    isContractSigner[s] = true;
  }

  function _removeContractSignerOnly(address s) internal {
    if (!isContractSigner[s]) return;

    uint256 idx = _contractSignerIndex[s];
    uint256 last = _contractSigners.length;
    if (idx != last) {
      address tail = _contractSigners[last - 1];
      _contractSigners[idx - 1] = tail;
      _contractSignerIndex[tail] = idx;
    }
    _contractSigners.pop();
    _contractSignerIndex[s] = 0;
    isContractSigner[s] = false;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Attestation & hashing
  // ────────────────────────────────────────────────────────────────────────────
  struct Attestation {
    uint256 challengeId;
    address subject;
    uint64  periodStart;
    uint64  periodEnd;
    uint8   ruleKind;
    uint32  minDaily;
    bytes32 datasetHash;
    bool    pass;
    uint256 chainId;
    address verifier;
  }

  function _attStructHash(Attestation memory a) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        ATTESTATION_TYPEHASH,
        a.challengeId,
        a.subject,
        a.periodStart,
        a.periodEnd,
        a.ruleKind,
        a.minDaily,
        a.datasetHash,
        a.pass,
        a.chainId,
        a.verifier
      )
    );
  }

  function _attDigest(Attestation memory a) internal view returns (bytes32) {
    return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), _attStructHash(a)));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IProofVerifier (NON-VIEW per your shared interface)
  // ────────────────────────────────────────────────────────────────────────────
  function verify(
    uint256 challengeId,
    address subject,
    bytes calldata proof
  ) external override returns (bool) {
    (Attestation memory att, bytes[] memory sigs) = abi.decode(proof, (Attestation, bytes[]));

    // Binding/time checks
    if (att.challengeId != challengeId) return false;
    if (att.subject != subject) return false;
    if (att.periodStart > att.periodEnd) return false;
    if (block.timestamp > uint256(att.periodEnd)) return false;
    if (att.chainId != block.chainid) return false;
    if (att.verifier != address(this)) return false;
    if (!att.pass) return false;
    if (sigs.length < threshold) return false;

    bytes32 digest = _attDigest(att);

    uint256 approvals = 0;
    uint256 seenBitmap = 0; // up to 256 signers

    for (uint256 i = 0; i < sigs.length; i++) {
      address recovered = _recoverAny(digest, sigs[i]);
      if (recovered == address(0)) continue;

      uint256 idx = _signerIndex[recovered];
      if (idx == 0) continue; // not active signer

      uint256 bit = (1 << (idx - 1));
      if ((seenBitmap & bit) != 0) continue; // duplicate signer

      seenBitmap |= bit;
      approvals++;
      if (approvals >= threshold) return true;
    }
    return false;
  }

  /// Optional: explicit contract signer variant (avoids iterating).
  /// proof := abi.encode(Attestation att, bytes sig, address contractSigner)
  function verifyWith1271Signer(
    uint256 challengeId,
    address subject,
    bytes calldata proof
  ) external view returns (bool) {
    (Attestation memory att, bytes memory sig, address wallet) =
      abi.decode(proof, (Attestation, bytes, address));

    if (!isContractSigner[wallet]) return false;

    if (att.challengeId != challengeId) return false;
    if (att.subject != subject) return false;
    if (att.periodStart > att.periodEnd) return false;
    if (block.timestamp > uint256(att.periodEnd)) return false;
    if (att.chainId != block.chainid) return false;
    if (att.verifier != address(this)) return false;
    if (!att.pass) return false;

    bytes32 digest = _attDigest(att);
    if (!_isValid1271(wallet, digest, sig)) return false;

    // If threshold>1 you should be using the main multisig proof (bytes[] sigs)
    uint256 idx = _signerIndex[wallet];
    return (idx != 0 && threshold <= 1);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Signature helpers
  // ────────────────────────────────────────────────────────────────────────────
  function _recoverAny(bytes32 digest, bytes memory sig) internal view returns (address) {
    (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
    if (err == ECDSA.RecoverError.NoError) return recovered;

    // Bounded scan over registered contract signers
    for (uint256 i = 0; i < _contractSigners.length; i++) {
      address wallet = _contractSigners[i];
      if (_isValid1271(wallet, digest, sig)) return wallet;
    }
    return address(0);
  }

  function _isValid1271(address wallet, bytes32 digest, bytes memory sig) internal view returns (bool) {
    if (wallet.code.length == 0) return false;
    (bool ok, bytes memory ret) =
      wallet.staticcall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, digest, sig));
    return ok && ret.length >= 4 && bytes4(ret) == EIP1271_MAGIC_VALUE;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Views
  // ────────────────────────────────────────────────────────────────────────────
  function signerCount() external view returns (uint256) { return _signers.length; }
  function getSigners() external view returns (address[] memory) { return _signers; }
  function getContractSigners() external view returns (address[] memory) { return _contractSigners; }
  function isSigner(address a) external view returns (bool) { return _signerIndex[a] != 0; }

  // ────────────────────────────────────────────────────────────────────────────
  // ERC-165 (via IProofVerifier/IERC165)
  // ────────────────────────────────────────────────────────────────────────────
  function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
    return
      interfaceId == type(IProofVerifier).interfaceId ||
      interfaceId == type(IProofVerifierEIP712).interfaceId ||
      interfaceId == 0x01ffc9a7; // IERC165
  }
}