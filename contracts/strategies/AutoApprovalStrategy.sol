// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IApprovalStrategy} from "./IApprovalStrategy.sol";

contract AutoApprovalStrategy is IApprovalStrategy {
  event OwnerChanged(address indexed prev, address indexed next);
  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
  address public owner;

  event Paused(bool on);
  bool public paused;

  event LeadAndDurationSet(uint256 minLeadTime, uint256 maxDuration);
  uint256 public minLeadTime;
  uint256 public maxDuration;

  event NativeAllowedSet(bool allowed);
  bool public allowNative;

  event ERC20Allowed(address indexed token, bool allowed);
  mapping(address => bool) public erc20Allowed;

  event CreatorAllowlistMode(bool required);
  event CreatorAllowed(address indexed creator, bool allowed);
  bool public requireCreatorAllowlist;
  mapping(address => bool) public creatorAllowed;

  constructor() {
    owner = msg.sender;
    allowNative = true;
    minLeadTime = 2 minutes;
    maxDuration = 30 days;
    requireCreatorAllowlist = false;
    paused = false;
  }

  function setOwner(address n) external onlyOwner {
    require(n != address(0), "owner=0");
    emit OwnerChanged(owner, n);
    owner = n;
  }

  function setPaused(bool on) external onlyOwner {
    paused = on;
    emit Paused(on);
  }

  function setLeadAndDuration(uint256 _minLead, uint256 _maxDur) external onlyOwner {
    require(_maxDur == 0 || _maxDur >= 1 hours, "maxDur too small");
    minLeadTime = _minLead;
    maxDuration = _maxDur;
    emit LeadAndDurationSet(_minLead, _maxDur);
  }

  function setNativeAllowed(bool allowed) external onlyOwner {
    allowNative = allowed;
    emit NativeAllowedSet(allowed);
  }

  function setERC20Allowed(address token, bool allowed) external onlyOwner {
    require(token != address(0), "token=0");
    erc20Allowed[token] = allowed;
    emit ERC20Allowed(token, allowed);
  }

  function setRequireCreatorAllowlist(bool required) external onlyOwner {
    requireCreatorAllowlist = required;
    emit CreatorAllowlistMode(required);
  }

  function setCreatorAllowed(address creator, bool allowed) external onlyOwner {
    creatorAllowed[creator] = allowed;
    emit CreatorAllowed(creator, allowed);
  }

  // ✅ Signature must match IApprovalStrategy (non-view)
  function onCreate(
    uint256 /*id*/,
    address challenger,
    address token,
    uint8 currency,
    uint256 startTs,
    uint256 duration,
    bytes calldata /*data*/
  ) external returns (bool allow, bool autoApprove) {
    if (paused) return (false, false);
    if (requireCreatorAllowlist && !creatorAllowed[challenger]) return (false, false);

    if (startTs < block.timestamp + minLeadTime) return (false, false);
    if (duration == 0) return (false, false);
    if (maxDuration != 0 && duration > maxDuration) return (false, false);

    if (currency == 0) {
      if (!allowNative) return (false, false);
    } else if (currency == 1) {
      if (!erc20Allowed[token]) return (false, false);
    } else {
      return (false, false);
    }

    return (true, true);
  }
}