// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Treasury that receives fees and pays out to recipients via pull-based claims.
/// Admin (multisig) manages roles; Operators grant allowances; Recipients self-claim.
contract Treasury is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant SWEEPER_ROLE  = keccak256("SWEEPER_ROLE");

    /// token => recipient => remaining allowance
    mapping(address => mapping(address => uint256)) public allowanceOf; // ERC20
    mapping(address => uint256) public ethAllowanceOf;                  // ETH: recipient => allowance

    event Received(address indexed from, uint256 amount);
    event GrantERC20(address indexed token, address indexed to, uint256 amount, address indexed operator);
    event GrantETH(address indexed to, uint256 amount, address indexed operator);
    event ClaimedERC20(address indexed token, address indexed to, uint256 amount);
    event ClaimedETH(address indexed to, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount);

    constructor(address admin, address initialOperator) {
        require(admin != address(0), "admin=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (initialOperator != address(0)) {
            _grantRole(OPERATOR_ROLE, initialOperator);
        }
    }

    // ---- Receiving ETH ----
    receive() external payable { emit Received(msg.sender, msg.value); }
    fallback() external payable { if (msg.value > 0) emit Received(msg.sender, msg.value); }

    // ---- Operator: grant payouts (ERC20) ----
    function grantERC20(address token, address to, uint256 amount) public onlyRole(OPERATOR_ROLE) {
        require(token != address(0), "token=0");
        allowanceOf[token][to] += amount;
        emit GrantERC20(token, to, amount, msg.sender);
    }

    function grantERC20Batch(address token, address[] calldata to, uint256[] calldata amounts)
        external
        onlyRole(OPERATOR_ROLE)
    {
        require(to.length == amounts.length, "len mismatch");
        for (uint256 i = 0; i < to.length; i++) {
            allowanceOf[token][to[i]] += amounts[i];
            emit GrantERC20(token, to[i], amounts[i], msg.sender);
        }
    }

    // ---- Operator: grant payouts (ETH) ----
    function grantETH(address to, uint256 amount) public onlyRole(OPERATOR_ROLE) {
        ethAllowanceOf[to] += amount;
        emit GrantETH(to, amount, msg.sender);
    }

    function grantETHBatch(address[] calldata to, uint256[] calldata amounts)
        external
        onlyRole(OPERATOR_ROLE)
    {
        require(to.length == amounts.length, "len mismatch");
        for (uint256 i = 0; i < to.length; i++) {
            ethAllowanceOf[to[i]] += amounts[i];
            emit GrantETH(to[i], amounts[i], msg.sender);
        }
    }

    // ---- Recipient: claim payouts ----

    function claimERC20(address token, uint256 amount) external nonReentrant {
        uint256 a = allowanceOf[token][msg.sender];
        require(a >= amount, "allowance");
        allowanceOf[token][msg.sender] = a - amount;

        require(IERC20(token).transfer(msg.sender, amount), "transfer failed");
        emit ClaimedERC20(token, msg.sender, amount);
    }

    function claimETH(uint256 amount) external nonReentrant {
        uint256 a = ethAllowanceOf[msg.sender];
        require(a >= amount, "allowance");
        ethAllowanceOf[msg.sender] = a - amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "eth transfer failed");
        emit ClaimedETH(msg.sender, amount);
    }

    // ---- Admin ops ----

    /// @notice Optional: emergency sweep of mistaken tokens/ETH. Restrict SWEEPER_ROLE to multisig.
    function sweep(address token, address to, uint256 amount) external onlyRole(SWEEPER_ROLE) nonReentrant {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "eth sweep failed");
        } else {
            require(IERC20(token).transfer(to, amount), "erc20 sweep failed");
        }
        emit Swept(token, to, amount);
    }
}