// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProofVerifier} from "../verifiers/IProofVerifier.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @dev Always returns true — for testing only.
contract MockVerifier is IProofVerifier {
    function verify(uint256, address, bytes calldata) external pure override returns (bool) {
        return true;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IProofVerifier).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

/// @dev Always returns false — for testing only.
contract MockVerifierFalse is IProofVerifier {
    function verify(uint256, address, bytes calldata) external pure override returns (bool) {
        return false;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IProofVerifier).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
