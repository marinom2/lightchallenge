// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MetadataRegistry
 * @notice Minimal sidecar registry to associate metadata URIs with challenges
 *         created by ANY ChallengePay instance (or any contract).
 *
 *         Key is (challengeContract, challengeId) -> uri string.
 *         Permissions:
 *           - The "owner" may set or overwrite any URI.
 *           - The "challenger" address (as declared by the challenge contract)
 *             may set the URI for their own challenge once; the owner may
 *             overwrite later if needed.
 *
 *         To keep this registry decoupled from your core, we query the
 *         challenger address via a tiny interface (IChallengeCore) that only
 *         needs a single view method: getChallenge(uint256).
 */
interface IChallengeCore {
    struct ChallengeView {
        uint8  status;     // 0=pending,1=approved,2=rejected,3=finalized
        uint8  outcome;    // 0=None,1=Success,2=Fail
        address challenger;
        uint8  currency;   // 0=native,1=erc20 (kept for layout similarity; unused)
        address token;
        uint256 stakeAmount;
        uint256 proposalBond;
        uint256 approvalDeadline;
        uint256 startTs;
        uint8  peerApprovalsNeeded;
        uint16 charityBps;
        address charity;
        uint256 poolSuccess;
        uint256 poolFail;
        // We only read "challenger".
    }

    function getChallenge(uint256 id) external view returns (ChallengeView memory);
}

contract MetadataRegistry {
    event MetadataSet(address indexed challengeContract, uint256 indexed challengeId, address indexed setter, string newUri);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public owner;

    // challengeContract => challengeId => uri
    mapping(address => mapping(uint256 => string)) private _uri;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Owner can set/overwrite any metadata.
    function ownerSet(address challengeContract, uint256 challengeId, string calldata newUri) external onlyOwner {
        _set(challengeContract, challengeId, newUri);
    }

    /// @notice Challenger (as returned by challengeContract.getChallenge) can set metadata once.
    function challengerSet(address challengeContract, uint256 challengeId, string calldata newUri) external {
        address ch = _readChallenger(challengeContract, challengeId);
        require(ch != address(0), "no challenger");
        require(msg.sender == ch, "not challenger");
        // allow challenger to set only if empty (owner can later overwrite if needed)
        require(bytes(_uri[challengeContract][challengeId]).length == 0, "already set");
        _set(challengeContract, challengeId, newUri);
    }

    function _readChallenger(address challengeContract, uint256 challengeId) internal view returns (address) {
        IChallengeCore.ChallengeView memory ch = IChallengeCore(challengeContract).getChallenge(challengeId);
        return ch.challenger;
    }

    function _set(address challengeContract, uint256 challengeId, string calldata newUri) internal {
        _uri[challengeContract][challengeId] = newUri;
        emit MetadataSet(challengeContract, challengeId, msg.sender, newUri);
    }

    /// @notice Read back the URI (empty string if unset).
    function uri(address challengeContract, uint256 challengeId) external view returns (string memory) {
        return _uri[challengeContract][challengeId];
    }
}