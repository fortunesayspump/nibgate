// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import './NibgateSpenderV2.sol';
import '../MockUSDC.sol';

contract NibgateSpenderV2Test is Test {
    MockUSDC usdc;
    NibgateSpenderV2 spender;
    address owner = address(0x1001);
    address agent = address(0x2002);
    address creator = address(0x3003);
    address stranger = address(0x4004);

    uint256 constant DAY_CAP = 2_000_000; // $2/day

    function setUp() public {
        usdc = new MockUSDC();
        spender = new NibgateSpenderV2(address(usdc), owner, agent, DAY_CAP, false);
        usdc.mint(address(spender), 100_000_000); // $100 float
    }

    function test_agentSpendsWithinCapToAnyRecipient() public {
        vm.prank(agent);
        assertTrue(spender.spend(creator, 500_000));
        assertEq(usdc.balanceOf(creator), 500_000);
        assertEq(spender.spentInWindow(), 500_000);
    }

    function test_nonAgentCannotSpend() public {
        vm.prank(stranger);
        vm.expectRevert('not agent');
        spender.spend(creator, 100_000);
    }

    function test_optionalRecipientRestriction() public {
        vm.prank(owner);
        spender.setRecipientRestriction(true);
        vm.prank(agent);
        vm.expectRevert('recipient not allowlisted');
        spender.spend(stranger, 100_000);
        vm.prank(owner);
        spender.setAllowed(creator, true);
        vm.prank(agent);
        assertTrue(spender.spend(creator, 100_000));
        vm.prank(owner);
        spender.setRecipientRestriction(false);
        vm.prank(agent);
        assertTrue(spender.spend(stranger, 100_000));
    }

    function test_dailyCapEnforced() public {
        vm.prank(agent);
        spender.spend(creator, 1_500_000);
        vm.prank(agent);
        vm.expectRevert('daily cap exceeded');
        spender.spend(creator, 600_000);
    }

    function test_windowRolloverResets() public {
        vm.prank(agent);
        spender.spend(creator, DAY_CAP);
        uint256 t = vm.getBlockTimestamp();
        vm.warp(t + 1 days);
        vm.prank(agent);
        assertTrue(spender.spend(creator, DAY_CAP));
    }

    function test_pauseBlocksSpending() public {
        vm.prank(owner);
        spender.setPaused(true);
        vm.prank(agent);
        vm.expectRevert('paused');
        spender.spend(creator, 100_000);
    }

    function test_ownerWithdrawsAndRotatesAgent() public {
        vm.prank(owner);
        assertTrue(spender.withdraw(owner, 10_000_000));
        assertEq(usdc.balanceOf(owner), 10_000_000);
        address agent2 = address(0x5005);
        vm.prank(owner);
        spender.setAgent(agent2);
        vm.prank(agent2);
        assertTrue(spender.spend(creator, 100_000));
        vm.prank(agent);
        vm.expectRevert('not agent');
        spender.spend(creator, 100_000);
    }

    function test_zeroAmountReverts() public {
        vm.prank(agent);
        vm.expectRevert('zero amount');
        spender.spend(creator, 0);
    }

    function test_zeroRecipientReverts() public {
        vm.prank(agent);
        vm.expectRevert('zero recipient');
        spender.spend(address(0), 100_000);
    }
}
