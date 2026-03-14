// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/* ══════════════════════════════════════════════════════════════════════════
   Minimal IChallengePay interface — read-only view functions only.
   ══════════════════════════════════════════════════════════════════════════ */

interface IChallengePay {
    struct ChallengeView {
        uint256 id;
        uint8   kind;
        uint8   status;   // 0=Active, 1=Finalized, 2=Canceled
        uint8   outcome;  // 0=None, 1=Success, 2=Fail
        address creator;
        uint8   currency;
        address token;
        uint256 stake;
        uint256 joinClosesTs;
        uint256 startTs;
        uint256 duration;
        uint256 maxParticipants;
        uint256 pool;
        uint256 participantsCount;
        address verifier;
        uint256 proofDeadlineTs;
        uint32  winnersCount;
        uint256 winnersPool;
        bool    paused;
        bool    canceled;
        bool    payoutsDone;
    }

    function getChallenge(uint256 id) external view returns (ChallengeView memory);
    function isWinner(uint256 id, address user) external view returns (bool);
    function contribOf(uint256 id, address user) external view returns (uint256);
}

/* ══════════════════════════════════════════════════════════════════════════
   ERC-5192: Minimal Soulbound NFTs
   ══════════════════════════════════════════════════════════════════════════ */

interface IERC5192 {
    /// @notice Emitted when the locking status is changed to locked.
    event Locked(uint256 tokenId);

    /// @notice Emitted when the locking status is changed to unlocked.
    event Unlocked(uint256 tokenId);

    /// @notice Returns the locking status of an SBT.
    function locked(uint256 tokenId) external view returns (bool);
}

/* ══════════════════════════════════════════════════════════════════════════
   ChallengeAchievement — Soulbound achievement tokens for LightChallenge
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @title ChallengeAchievement
 * @notice Soulbound (non-transferable) ERC-721 tokens representing verified
 *         challenge accomplishments. Reads ChallengePay state to verify
 *         eligibility on-chain. No funds, no payouts — purely additive.
 *
 * Achievement types:
 *   0 = Completion  — participated in a finalized challenge
 *   1 = Victory     — won a finalized challenge
 *
 * Integration:
 *   ChallengeAchievement ──reads──→ ChallengePay (read-only)
 *   ChallengePay knows nothing about this contract.
 */
contract ChallengeAchievement is ERC721, IERC5192 {

    // ─── Types ──────────────────────────────────────────────────────────────

    enum AchievementType { Completion, Victory }

    struct Achievement {
        uint256 challengeId;
        address recipient;
        AchievementType aType;
        uint64  mintedAt;
    }

    // ─── Errors ─────────────────────────────────────────────────────────────

    error SoulboundToken();
    error NotFinalized();
    error NotParticipant();
    error NotWinner();
    error AlreadyMinted();
    error NotAdmin();
    error NotPendingAdmin();
    error ZeroAddress();

    // ─── Events ─────────────────────────────────────────────────────────────

    event AchievementMinted(
        uint256 indexed tokenId,
        uint256 indexed challengeId,
        address indexed recipient,
        AchievementType aType
    );

    event AdminMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 indexed challengeId
    );

    // ─── State ──────────────────────────────────────────────────────────────

    IChallengePay public immutable challengePay;
    string public baseTokenURI;

    uint256 public nextTokenId = 1;

    /// @notice Per-token metadata
    mapping(uint256 => Achievement) public achievements;

    /// @notice Double-mint protection: minted[challengeId][user][type] → tokenId
    ///         Zero means not minted.
    mapping(uint256 => mapping(address => mapping(AchievementType => uint256))) public minted;

    /// @notice 2-step admin
    address public admin;
    address public pendingAdmin;

    // ─── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor(
        address challengePay_,
        address admin_,
        string memory baseTokenURI_
    ) ERC721("LightChallenge Achievement", "LACH") {
        if (challengePay_ == address(0)) revert ZeroAddress();
        if (admin_ == address(0)) revert ZeroAddress();
        challengePay = IChallengePay(challengePay_);
        admin = admin_;
        baseTokenURI = baseTokenURI_;
    }

    // ─── Claim functions (permissionless, on-chain verified) ────────────────

    /**
     * @notice Claim a Completion achievement for a finalized challenge.
     * @param challengeId The challenge ID on ChallengePay.
     */
    function claimCompletion(uint256 challengeId) external returns (uint256) {
        _requireFinalized(challengeId);
        if (challengePay.contribOf(challengeId, msg.sender) == 0) revert NotParticipant();
        return _mintToken(challengeId, msg.sender, AchievementType.Completion);
    }

    /**
     * @notice Claim a Victory achievement for a finalized challenge you won.
     * @param challengeId The challenge ID on ChallengePay.
     */
    function claimVictory(uint256 challengeId) external returns (uint256) {
        _requireFinalized(challengeId);
        if (!challengePay.isWinner(challengeId, msg.sender)) revert NotWinner();
        return _mintToken(challengeId, msg.sender, AchievementType.Victory);
    }

    // ─── Admin functions ────────────────────────────────────────────────────

    /**
     * @notice Admin mint for edge cases (retroactive, special events).
     */
    function adminMint(
        address recipient,
        uint256 challengeId,
        AchievementType aType
    ) external onlyAdmin returns (uint256) {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 tokenId = _mintToken(challengeId, recipient, aType);
        emit AdminMinted(tokenId, recipient, challengeId);
        return tokenId;
    }

    function setBaseTokenURI(string calldata uri) external onlyAdmin {
        baseTokenURI = uri;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    // ─── View functions ─────────────────────────────────────────────────────

    function achievementOf(uint256 tokenId) external view returns (Achievement memory) {
        _requireOwned(tokenId);
        return achievements[tokenId];
    }

    function hasMinted(
        uint256 challengeId,
        address user,
        AchievementType aType
    ) external view returns (bool) {
        return minted[challengeId][user][aType] != 0;
    }

    /// @notice ERC-5192: all tokens are permanently locked (soulbound).
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    // ─── ERC-721 metadata ───────────────────────────────────────────────────

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    // ─── ERC-165 ────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override returns (bool)
    {
        return interfaceId == type(IERC5192).interfaceId
            || super.supportsInterface(interfaceId);
    }

    // ─── Soulbound overrides (disable all transfers) ────────────────────────

    function transferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SoulboundToken();
    }

    function approve(address, uint256) public pure override {
        revert SoulboundToken();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundToken();
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    function _requireFinalized(uint256 challengeId) internal view {
        IChallengePay.ChallengeView memory c = challengePay.getChallenge(challengeId);
        if (c.status != 1) revert NotFinalized(); // 1 = Finalized
    }

    function _mintToken(
        uint256 challengeId,
        address recipient,
        AchievementType aType
    ) internal returns (uint256) {
        if (minted[challengeId][recipient][aType] != 0) revert AlreadyMinted();

        uint256 tokenId = nextTokenId++;
        achievements[tokenId] = Achievement({
            challengeId: challengeId,
            recipient: recipient,
            aType: aType,
            mintedAt: uint64(block.timestamp)
        });
        minted[challengeId][recipient][aType] = tokenId;

        _mint(recipient, tokenId);

        emit Locked(tokenId);
        emit AchievementMinted(tokenId, challengeId, recipient, aType);

        return tokenId;
    }
}
