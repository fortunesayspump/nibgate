// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Timelock} from "./Timelock.sol";
import {GatewayFeeWallet} from "./GatewayFeeWallet.sol";
import {GatewayFeeWalletFactory} from "./GatewayFeeWalletFactory.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract TimelockTest is Test {
    Timelock timelock;
    GatewayFeeWallet wallet;
    MockUSDC usdc;

    address creator = makeAddr("creator");
    address treasury = makeAddr("treasury");
    address stranger = makeAddr("stranger");
    uint256 constant DELAY = 2 days;
    uint32 constant DOMAIN = 1;

    function setUp() public {
        timelock = new Timelock(treasury, DELAY);
        usdc = new MockUSDC();
        // feeSetter = timelock, exactly like the production factory wiring.
        wallet = new GatewayFeeWallet(
            creator,
            treasury,
            address(timelock),
            address(usdc),
            address(usdc), // gatewayWallet stand-in
            address(usdc), // gatewayMinter stand-in
            DOMAIN,
            2000, // maxFeeBps
            100 // initialFeeBps = 1%
        );
    }

    function _setFeeCall(uint16 bps) internal pure returns (bytes memory) {
        return abi.encodeCall(GatewayFeeWallet.setFeeBps, (bps));
    }

    function test_directSetFeeByGovernanceFails() public {
        vm.prank(treasury);
        (bool ok, ) = address(wallet).call(_setFeeCall(150));
        // treasury is the timelock's governance but NOT the wallet's feeSetter
        assertFalse(ok);
        assertEq(wallet.feeBps(), 100);
    }

    function test_feeChangeRequiresDelayThenWorks() public {
        vm.prank(treasury);
        bytes32 id = timelock.schedule(address(wallet), _setFeeCall(150), 0);
        assertTrue(timelock.isPending(address(wallet), _setFeeCall(150), 0));

        vm.expectRevert(Timelock.NotReady.selector);
        timelock.execute(address(wallet), _setFeeCall(150), 0);

        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(wallet), _setFeeCall(150), 0);
        assertEq(wallet.feeBps(), 150);
        assertFalse(timelock.isPending(address(wallet), _setFeeCall(150), 0));
        assertEq(timelock.readyAt(id), 0);
    }

    function test_anyoneCanExecuteAfterDelay() public {
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(50), 0);
        vm.warp(block.timestamp + DELAY);
        vm.prank(stranger); // permissionless execution after the delay is fine
        timelock.execute(address(wallet), _setFeeCall(50), 0);
        assertEq(wallet.feeBps(), 50);
    }

    function test_strangerCannotScheduleOrCancel() public {
        vm.prank(stranger);
        vm.expectRevert(Timelock.NotGovernance.selector);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);

        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);
        bytes32 cid = timelock.idFor(address(wallet), _setFeeCall(150), 0);
        vm.prank(stranger);
        vm.expectRevert(Timelock.NotGovernance.selector);
        timelock.cancel(cid);
    }

    function test_cancelBlocksExecutionAndRescheduleRevives() public {
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);
        bytes32 cid = timelock.idFor(address(wallet), _setFeeCall(150), 0);
        vm.prank(treasury);
        timelock.cancel(cid);

        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(Timelock.NotScheduled.selector);
        timelock.execute(address(wallet), _setFeeCall(150), 0);

        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0); // revive after cancel
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(wallet), _setFeeCall(150), 0);
        assertEq(wallet.feeBps(), 150);
    }

    function test_replayedOperationIsRejected() public {
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(wallet), _setFeeCall(150), 0);
        vm.expectRevert(Timelock.NotScheduled.selector);
        timelock.execute(address(wallet), _setFeeCall(150), 0);
    }

    function test_failingUnderlyingCallSurfacesAsCallFailed() public {
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(9999), 0); // above maxFeeBps cap
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(Timelock.CallFailed.selector);
        timelock.execute(address(wallet), _setFeeCall(9999), 0);
    }

    function test_factoryWiresTimelockAsFeeSetter() public {
        GatewayFeeWalletFactory factory = new GatewayFeeWalletFactory(
            treasury,
            address(timelock),
            address(usdc),
            address(usdc),
            address(usdc),
            DOMAIN,
            2000,
            100
        );
        address w = factory.deployIfNeeded(creator);
        assertEq(GatewayFeeWallet(w).feeSetter(), address(timelock));
        assertEq(factory.wallets(creator), w);
    }

    function test_zeroDelayRejected() public {
        vm.expectRevert(Timelock.ZeroDelay.selector);
        new Timelock(treasury, 0);
    }

    function test_staleOperationExpiresAfterGracePeriod() public {
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);
        vm.warp(1 + DELAY + 15 days); // past the 14-day grace
        vm.expectRevert(Timelock.Expired.selector);
        timelock.execute(address(wallet), _setFeeCall(150), 0);

        // rescheduling revives it (fresh delay, fresh grace window)
        vm.prank(treasury);
        timelock.schedule(address(wallet), _setFeeCall(150), 0);
        vm.warp(1 + DELAY + 15 days + DELAY);
        timelock.execute(address(wallet), _setFeeCall(150), 0);
        assertEq(wallet.feeBps(), 150);
    }
}
