// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IProofVerifier} from "../verifiers/IProofVerifier.sol";
import {IPlonkVerifier} from "./IPlonkVerifier.sol";

error NotOwner();
error ZeroAddress();
error ModelInactive();
error BindingMismatch();
error NoPublicSignals();

/**
 * @title ZkProofVerifier
 * @notice Adapter that plugs Plonk verifiers into ChallengePay.
 *         Binds challengeId+subject to public signals if enforceBinding=true.
 */
contract ZkProofVerifier is IProofVerifier {
    event ModelSet(bytes32 indexed modelHash, address verifier, bool active, bool enforceBinding);
    event Verified(uint256 indexed challengeId, address indexed subject, bytes32 indexed modelHash, bool ok);
    event OwnershipTransferred(address indexed prev, address indexed next);

    address public owner;

    enum Flavor { PLONK }

    struct ModelCfg {
        address verifier;
        Flavor  flavor;
        bool    active;
        bool    enforceBinding;
    }

    mapping(bytes32 => ModelCfg) public models;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address n) external onlyOwner {
        if (n == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, n);
        owner = n;
    }

    function setModel(bytes32 modelHash, address verifier, bool active, bool enforceBinding) external onlyOwner {
        if (verifier == address(0)) revert ZeroAddress();
        models[modelHash] = ModelCfg({
            verifier: verifier,
            flavor: Flavor.PLONK,
            active: active,
            enforceBinding: enforceBinding
        });
        emit ModelSet(modelHash, verifier, active, enforceBinding);
    }

    /// @inheritdoc IProofVerifier
    function verify(uint256 challengeId, address subject, bytes calldata proof)
        external
        override
        returns (bool)
    {
        (bytes32 modelHash, bytes memory proofData, uint256[] memory publicSignals) =
            abi.decode(proof, (bytes32, bytes, uint256[]));

        ModelCfg memory cfg = models[modelHash];
        if (!cfg.active) {
            return false;
        }

        if (cfg.enforceBinding) {
            if (publicSignals.length == 0) revert NoPublicSignals();
            uint256 bind = uint256(keccak256(abi.encode(challengeId, subject)));
            if (publicSignals[0] != bind) revert BindingMismatch();
        }

        bool ok;
        try IPlonkVerifier(cfg.verifier).verifyProof(proofData, publicSignals) returns (bool v) {
            ok = v;
        } catch {
            ok = false; // fail-closed on verifier exceptions
        }

        emit Verified(challengeId, subject, modelHash, ok);
        return ok;
    }

    // IMPORTANT: match IERC165 signature
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
         return
             interfaceId == type(IProofVerifier).interfaceId ||
             interfaceId == type(IERC165).interfaceId;
     }
}