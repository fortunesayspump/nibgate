// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// NibgateSpenderV2 — Gate 2 for the agent's direct-tip float.
//
// Direct-tip operating USDC lives in THIS contract; the agent key can move
// this balance only through spend(), bounded by:
//   - optional recipient allowlist (owner can enable when a fixed set fits)
//   - rolling daily cap (resets 24h after the window opens)
//   - pause (owner halts all spending instantly)
//
// Owner (keeper): funds, sets agent/cap/allowlist, pauses, withdraws.
// Open recipients let the research agent tip newly discovered creators. A
// compromised agent key can send up to the daily cap anywhere; the owner can
// pause or enable the allowlist for a narrower operating mode. EOA-held funds
// are outside this contract's bound.
//
// Explicit non-goals: this is NOT a session-key system and does NOT cover
// Circle Gateway EIP-3009 flows (a contract cannot sign authorizations).
// Direct USDC transfers only (tips, payouts). Gateway float stays in the
// EOA, kept minimal by procedure until a signing upgrade lands.
//
// Authorization model mirrors NibgateRunSplitter: minimal, auditable, no
// dependencies. Provenance: written for Nibgate.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract NibgateSpenderV2 {
    IERC20 public immutable usdc;
    address public owner;
    address public agent;
    uint256 public dailyCap;
    bool public paused;
    bool public restrictRecipients;

    mapping(address => bool) public allowed;

    uint256 public windowStart;
    uint256 public spentInWindow;

    event Spend(address indexed to, uint256 amount, uint256 spentInWindow);
    event AgentSet(address indexed agent);
    event CapSet(uint256 dailyCap);
    event AllowlistSet(address indexed recipient, bool allowed);
    event Withdraw(address indexed to, uint256 amount);
    event Paused(bool paused);
    event RecipientRestrictionSet(bool restrictRecipients);
    event OwnershipTransferred(address indexed owner);

    modifier onlyOwner() {
        require(msg.sender == owner, 'not owner');
        _;
    }

    constructor(address usdc_, address owner_, address agent_, uint256 dailyCap_, bool restrictRecipients_) {
        require(usdc_ != address(0) && owner_ != address(0) && agent_ != address(0), 'zero address');
        usdc = IERC20(usdc_);
        owner = owner_;
        agent = agent_;
        dailyCap = dailyCap_;
        restrictRecipients = restrictRecipients_;
        emit OwnershipTransferred(owner_);
        emit AgentSet(agent_);
        emit CapSet(dailyCap_);
        emit RecipientRestrictionSet(restrictRecipients_);
    }

    /// @notice Agent-only spend within the daily cap and optional recipient restriction.
    function spend(address to, uint256 amount) external returns (bool) {
        require(msg.sender == agent, 'not agent');
        require(!paused, 'paused');
        require(to != address(0), 'zero recipient');
        require(!restrictRecipients || allowed[to], 'recipient not allowlisted');
        require(amount > 0, 'zero amount');
        if (block.timestamp >= windowStart + 1 days) {
            windowStart = block.timestamp;
            spentInWindow = 0;
        }
        require(spentInWindow + amount <= dailyCap, 'daily cap exceeded');
        spentInWindow += amount;
        emit Spend(to, amount, spentInWindow);
        return _safeTransfer(usdc, to, amount);
    }

    // ——— owner administration ———

    function setAgent(address agent_) external onlyOwner {
        require(agent_ != address(0), 'zero address');
        agent = agent_;
        emit AgentSet(agent_);
    }

    function setDailyCap(uint256 cap_) external onlyOwner {
        dailyCap = cap_;
        emit CapSet(cap_);
    }

    function setAllowed(address recipient, bool ok) external onlyOwner {
        allowed[recipient] = ok;
        emit AllowlistSet(recipient, ok);
    }

    function setRecipientRestriction(bool restricted) external onlyOwner {
        restrictRecipients = restricted;
        emit RecipientRestrictionSet(restricted);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function transferOwnership(address owner_) external onlyOwner {
        require(owner_ != address(0), 'zero address');
        owner = owner_;
        emit OwnershipTransferred(owner_);
    }

    /// @notice Owner reclaims funds (rotation, decommission, over-funding).
    function withdraw(address to, uint256 amount) external onlyOwner returns (bool) {
        emit Withdraw(to, amount);
        return _safeTransfer(usdc, to, amount);
    }

    function _safeTransfer(IERC20 token, address to, uint256 amount) private returns (bool) {
        (bool ok, bytes memory ret) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), 'transfer failed');
        return true;
    }
}
