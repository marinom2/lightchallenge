// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProofVerifier} from "../IProofVerifier.sol";
import {IPlonkVerifier} from "./IPlonkVerifier.sol";

/**
 * @title ZkProofVerifier
 * @notice Generic zk verifier that plugs into ChallengePay via IProofVerifier.
 *         Owner registers allowed model hashes and their PLONK verifier contracts.
 *
 * Proof bytes layout (ABI-encoded):
 *   (bytes32 modelHash, bytes proofData, uint256[] publicSignals)
 *
 * Binding (recommended):
 *   If enforceBinding=true for a model, publicSignals[0] MUST equal
 *   uint256(keccak256(abi.encode(challengeId, subject))).
 *
 * NOTE: This contract is PLONK-only for now. Add Groth16 adapter later if needed.
 */
contract ZkProofVerifier is IProofVerifier {
    event ModelSet(bytes32 indexed modelHash, address verifier, bool active, bool enforceBinding);
    event Verified(uint256 indexed challengeId, address indexed subject, bytes32 indexed modelHash, bool ok);

    address public owner;

    enum Flavor { PLONK } // extendable

    struct ModelCfg {
        address verifier;   // IPlonkVerifier
        Flavor  flavor;     // future-proof enum
        bool    active;
        bool    enforceBinding; // require pubSignals[0] == keccak(challengeId, subject)
    }

    mapping(bytes32 => ModelCfg) public models;

    modifier onlyOwner() {
        require(msg.sender == owner, "not-owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address n) external onlyOwner {
        owner = n;
    }

    /// @notice Register/activate a model hash with a verifier.
    function setModel(bytes32 modelHash, address verifier, bool active, bool enforceBinding) external onlyOwner {
        require(verifier != address(0), "verifier=0");
        models[modelHash] = ModelCfg({verifier: verifier, flavor: Flavor.PLONK, active: active, enforceBinding: enforceBinding});
        emit ModelSet(modelHash, verifier, active, enforceBinding);
    }

    /// @inheritdoc IProofVerifier
    function verify(uint256 challengeId, address subject, bytes calldata proof) external override returns (bool) {
        (bytes32 modelHash, bytes memory proofData, uint256[] memory publicSignals) =
            abi.decode(proof, (bytes32, bytes, uint256[]));

        ModelCfg memory cfg = models[modelHash];
        if (!cfg.active) {
            emit Verified(challengeId, subject, modelHash, false);
            return false;
        }

        if (cfg.enforceBinding) {
            require(publicSignals.length > 0, "no-pubs");
            uint256 bind = uint256(keccak256(abi.encode(challengeId, subject)));
            require(publicSignals[0] == bind, "binding-mismatch");
        }

        bool ok = IPlonkVerifier(cfg.verifier).verifyProof(proofData, publicSignals);
        emit Verified(challengeId, subject, modelHash, ok);
        return ok;
    }
}