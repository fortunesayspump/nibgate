// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test-only USDC used by the revenue e2e (scripts/e2e-revenue-factory.mjs)
// to exercise distribute() splits on a local anvil node.
contract MockUSDC {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}