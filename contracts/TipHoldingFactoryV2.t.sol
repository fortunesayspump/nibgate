// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TipHoldingFactoryV2} from "./TipHoldingFactoryV2.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract TipHoldingFactoryV2Test is Test {
    TipHoldingFactoryV2 factory;
    MockUSDC usdc;
    address treasury = makeAddr("treasury");
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    bytes32 domainHash = keccak256(bytes("example.com"));

    function setUp() public {
        usdc = new MockUSDC();
        factory = new TipHoldingFactoryV2(treasury, address(usdc), 500, owner, makeAddr("gatewayWallet"), makeAddr("gatewayMinter"), 26);
        vm.prank(owner);
        factory.setKeeper(keeper);
    }

    function test_ReleaseExactPaysOnlyTheSnapshot() public {
        address box = factory.predict(domainHash);
        usdc.mint(box, 1_000_000);
        vm.prank(keeper);
        factory.releaseExact(domainHash, creator, 1_000_000);
        assertEq(usdc.balanceOf(creator), 950_000);
        assertEq(usdc.balanceOf(treasury), 50_000);
        assertEq(usdc.balanceOf(box), 0);
    }

    function test_ReleaseExactRevertsIfFundsArriveAfterSnapshot() public {
        address box = factory.predict(domainHash);
        usdc.mint(box, 1_000_000);
        // A new direct transfer arrives after the Hub snapshots 1 USDC.
        usdc.mint(box, 100_000);
        vm.expectRevert(bytes("balance-mismatch"));
        vm.prank(keeper);
        factory.releaseExact(domainHash, creator, 1_000_000);
        assertEq(usdc.balanceOf(box), 1_100_000);
        assertEq(usdc.balanceOf(creator), 0);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_ReleaseExactRevertsIfSnapshotExceedsBalance() public {
        address box = factory.predict(domainHash);
        usdc.mint(box, 900_000);
        vm.expectRevert(bytes("balance-mismatch"));
        vm.prank(owner);
        factory.releaseExact(domainHash, creator, 1_000_000);
        assertEq(usdc.balanceOf(box), 900_000);
    }
}
