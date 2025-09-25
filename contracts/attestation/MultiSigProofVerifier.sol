// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Your project-wide verifier interface.
// NOTE: keeping `view` — ChallengePay can call a view function just fine.
interface IProofVerifier {
  function verify(uint256 challengeId, address subject, bytes calldata proof) external view returns (bool);
}

/**
 * @title MultiSigProofVerifier
 * @notice m-of-n attestation verifier that plugs into ChallengePay.
 *
 * Off-chain flow:
 *  1) Build an Attestation for (challengeId, subject, rule parameters, dataset hash, pass=true)
 *  2) Attesters sign the EIP-191 digest of the typed hash produced by _attHash()
 *  3) Submit abi.encode(att, sigs[]) as `proof`
 *
 * On-chain:
 *  - verify() checks binding to (challengeId, subject, chainId, this)
 *  - de-duplicates signers
 *  - returns true if unique signer count >= threshold AND att.pass == true
 *
 * Extras:
 *  - hashChallenge(...) helper exposed for convenience in tests/off-chain tooling.
 *    This helper is NOT used by verify(); it returns a simpler digest that some
 *    clients find convenient when they don't want to assemble a full Attestation.
 */
contract MultiSigProofVerifier is IProofVerifier {
  address public owner;
  mapping(address => bool) public isAttester;
  uint256 public threshold; // required unique signatures

  event OwnerChanged(address indexed prev, address indexed next);
  event AttesterSet(address indexed who, bool ok);
  event ThresholdSet(uint256 m);

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  constructor(address _owner, address[] memory initialAttesters, uint256 _threshold) {
    require(_owner != address(0), "owner=0");
    owner = _owner;
    emit OwnerChanged(address(0), _owner);

    for (uint256 i = 0; i < initialAttesters.length; ++i) {
      address a = initialAttesters[i];
      require(a != address(0), "attester=0");
      isAttester[a] = true;
      emit AttesterSet(a, true);
    }

    require(_threshold > 0 && _threshold <= initialAttesters.length, "bad threshold");
    threshold = _threshold;
    emit ThresholdSet(_threshold);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin
  // ────────────────────────────────────────────────────────────────────────────

  function setOwner(address next) external onlyOwner {
    require(next != address(0), "owner=0");
    emit OwnerChanged(owner, next);
    owner = next;
  }

  function setAttester(address who, bool ok) external onlyOwner {
    require(who != address(0), "attester=0");
    isAttester[who] = ok;
    emit AttesterSet(who, ok);
  }

  function setThreshold(uint256 m) external onlyOwner {
    require(m > 0, "threshold=0");
    // NOTE: we can't cheaply count active attesters from a mapping; constructor
    // guards the initial value, and the owner must keep this sensible afterwards.
    threshold = m;
    emit ThresholdSet(m);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Attestation type & hashing
  // ────────────────────────────────────────────────────────────────────────────

  struct Attestation {
    uint256 challengeId;
    address subject;
    uint64  periodStart;
    uint64  periodEnd;
    uint8   ruleKind;     // e.g. 1 = MinDailySteps
    uint32  minDaily;     // e.g. 10000
    bytes32 datasetHash;  // keccak256 of normalized data
    bool    pass;
    uint256 chainId;
    address verifier;
  }

  // keccak256("Attestation(uint256,address,uint64,uint64,uint8,uint32,bytes32,bool,uint256,address)")
  bytes32 private constant TYPEHASH =
    0x3b94011e0cfe69b0a03951dca1e445e2ea0292a290a59e7e1a04e1f2a8b615b3;

  function _attHash(Attestation memory a) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        TYPEHASH,
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

  function _toEthSigned(bytes32 h) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
  }

  function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
    require(sig.length == 65, "sig len");
    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly {
      r := mload(add(sig, 0x20))
      s := mload(add(sig, 0x40))
      v := byte(0, mload(add(sig, 0x60)))
    }
    if (v < 27) v += 27;
    require(v == 27 || v == 28, "bad v");
    return ecrecover(digest, v, r, s);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public helpers (DX)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * @dev Convenience helper for off-chain tools/tests that don't assemble a full Attestation.
   *      This DOES NOT change how verify() works. If you want this digest to be
   *      honored by verify(), you must place it (or its inputs) into Attestation
   *      fields consistently and collect signatures over _toEthSigned(_attHash(att)).
   *
   *      Digest schema (simple, human-friendly):
   *        keccak256(abi.encodePacked(
   *          "LightChallengeProof:",
   *          block.chainid,
   *          challengeContract,
   *          challengeId,
   *          subject
   *        ))
   */
  function hashChallenge(
    uint256 challengeId,
    address challengeContract,
    address subject
  ) external view returns (bytes32) {
    return keccak256(
      abi.encodePacked("LightChallengeProof:", block.chainid, challengeContract, challengeId, subject)
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IProofVerifier
  // ────────────────────────────────────────────────────────────────────────────

  /// @notice `proof` must be: abi.encode(Attestation att, bytes[] sigs)
  function verify(
    uint256 challengeId,
    address subject,
    bytes calldata proof
  ) external view override returns (bool) {
    (Attestation memory att, bytes[] memory sigs) = abi.decode(proof, (Attestation, bytes[]));

    // Binding checks
    if (att.challengeId != challengeId) return false;
    if (att.subject != subject) return false;
    if (att.chainId != block.chainid) return false;
    if (att.verifier != address(this)) return false;
    if (!att.pass) return false;

    // Hash + eth_sign envelope
    bytes32 h = _attHash(att);
    bytes32 digest = _toEthSigned(h);

    // Dedup signers; count approvals
    uint256 approvals = 0;
    address[] memory seen = new address[](sigs.length);
    uint256 seenCount = 0;

    for (uint256 i = 0; i < sigs.length; ++i) {
      address signer = _recover(digest, sigs[i]);
      if (!isAttester[signer]) continue;

      bool dup = false;
      for (uint256 j = 0; j < seenCount; ++j) {
        if (seen[j] == signer) {
          dup = true;
          break;
        }
      }
      if (dup) continue;

      seen[seenCount++] = signer;
      approvals += 1;
      if (approvals >= threshold) return true;
    }
    return false;
  }
}