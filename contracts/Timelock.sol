// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Timelock — minimal delay vault for protocol-controlled parameters.
//
// Nibgate hands this contract the `feeSetter` role on GatewayFeeWalletFactory,
// so the protocol fee can only move through a queued, publicly visible operation
// after a fixed delay. No upgrades, no role shuffling, no dependency on OZ:
// one governance address schedules and executes hashed calldata against a
// target; everything else is rejected. The delay is immutable by design —
// changing it would mean deploying a new timelock and a new factory, which is
// exactly the kind of change that deserves to be visible.
//
// Threat model this closes: a leaked or rogue feeSetter EOA instantly rewriting
// the revenue split on every creator wallet (feeBps is capped by maxFeeBps at
// the wallet level; this adds time + transparency on top of the cap).
contract Timelock {
    // After this window an unexecuted operation expires and must be rescheduled
    // (Uniswap-governance pattern): queued calldata must never become a
    // permanent landmine that anyone can fire years later.
    uint256 public constant GRACE_PERIOD = 14 days;

    address public immutable governance;
    uint256 public immutable delay;

    mapping(bytes32 => uint256) public readyAt; // id -> executable timestamp
    mapping(bytes32 => bool) public cancelled;

    event Scheduled(bytes32 indexed id, address indexed target, bytes callData, uint256 value, uint256 readyAt);
    event Executed(bytes32 indexed id);
    event Cancelled(bytes32 indexed id);

    error NotGovernance();
    error NotScheduled();
    error NotReady();
    error Expired();
    error AlreadyScheduled();
    error CallFailed();
    error ZeroDelay();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(address governance_, uint256 delay_) {
        require(governance_ != address(0), "governance");
        if (delay_ == 0) revert ZeroDelay();
        governance = governance_;
        delay = delay_;
    }

    function idFor(address target, bytes calldata callData, uint256 value) public view returns (bytes32) {
        return keccak256(abi.encode(target, callData, value, block.chainid));
    }

    function schedule(address target, bytes calldata callData, uint256 value) external onlyGovernance returns (bytes32 id) {
        id = idFor(target, callData, value);
        uint256 existing = readyAt[id];
        bool live = existing != 0 && !cancelled[id] && block.timestamp <= existing + GRACE_PERIOD;
        if (live) revert AlreadyScheduled();
        readyAt[id] = block.timestamp + delay;
        cancelled[id] = false;
        emit Scheduled(id, target, callData, value, readyAt[id]);
    }

    function execute(address target, bytes calldata callData, uint256 value) external payable returns (bytes memory) {
        bytes32 id = idFor(target, callData, value);
        uint256 ready = readyAt[id];
        if (ready == 0) revert NotScheduled();
        if (cancelled[id]) revert NotScheduled();
        if (block.timestamp < ready) revert NotReady();
        if (block.timestamp > ready + GRACE_PERIOD) revert Expired();
        delete readyAt[id];
        (bool ok, bytes memory ret) = target.call{value: value}(callData);
        if (!ok) revert CallFailed();
        emit Executed(id);
        return ret;
    }

    function cancel(bytes32 id) external onlyGovernance {
        if (readyAt[id] == 0 || cancelled[id]) revert NotScheduled();
        cancelled[id] = true;
        emit Cancelled(id);
    }

    function isPending(address target, bytes calldata callData, uint256 value) external view returns (bool) {
        bytes32 id = idFor(target, callData, value);
        return readyAt[id] != 0 && !cancelled[id];
    }
}
