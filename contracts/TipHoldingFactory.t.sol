// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TipHoldingWallet} from "./TipHoldingWallet.sol";
import {TipHoldingFactory} from "./TipHoldingFactory.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract TipHoldingFactoryTest is Test {
    TipHoldingFactory factory;
    MockUSDC usdc;

    address treasury = makeAddr("treasury");
    address owner = makeAddr("owner");
    address creator = makeAddr("creator");
    address stranger = makeAddr("stranger");
    address payer = makeAddr("payer");
    address keeper = makeAddr("keeper");
    address gatewayWallet = makeAddr("gatewayWallet");
    address gatewayMinter = makeAddr("gatewayMinter");
    uint16 constant FEE_BPS = 500;
    uint32 constant DOMAIN = 26;

    bytes32 domainHash = keccak256(bytes("example.com"));

    function setUp() public {
        usdc = new MockUSDC();
        factory = new TipHoldingFactory(treasury, address(usdc), FEE_BPS, owner, gatewayWallet, gatewayMinter, DOMAIN);
    }

    function _intent(address wallet, bool selfRecipient) internal view returns (TipHoldingWallet.BurnIntent memory, TipHoldingWallet.TransferSpec memory) {
        bytes32 self = bytes32(uint256(uint160(wallet)));
        TipHoldingWallet.TransferSpec memory spec = TipHoldingWallet.TransferSpec({
            version: 1,
            sourceDomain: DOMAIN,
            destinationDomain: DOMAIN,
            sourceContract: bytes32(uint256(uint160(gatewayWallet))),
            destinationContract: bytes32(uint256(uint160(gatewayMinter))),
            sourceToken: bytes32(uint256(uint160(address(usdc)))),
            destinationToken: bytes32(uint256(uint160(address(usdc)))),
            sourceDepositor: self,
            destinationRecipient: selfRecipient ? self : bytes32(uint256(uint160(stranger))),
            sourceSigner: self,
            destinationCaller: bytes32(0),
            value: 100,
            salt: bytes32(0),
            hookData: ""
        });
        TipHoldingWallet.BurnIntent memory intent = TipHoldingWallet.BurnIntent({maxBlockHeight: 1, maxFee: 1, spec: spec});
        return (intent, spec);
    }

    function test_IsValidSignatureSelfTransfer() public {
        address wallet = factory.deploy(domainHash);
        TipHoldingWallet w = TipHoldingWallet(wallet);
        (TipHoldingWallet.BurnIntent memory intent, TipHoldingWallet.TransferSpec memory spec) = _intent(wallet, true);
        bytes32 digest = w.digestOf(intent);
        bytes4 magic = w.isValidSignature(digest, abi.encode(uint256(1), uint256(1), spec));
        assertEq(magic, bytes4(0x1626ba7e));
    }

    function test_RejectsForeignRecipient() public {
        address wallet = factory.deploy(domainHash);
        TipHoldingWallet w = TipHoldingWallet(wallet);
        (TipHoldingWallet.BurnIntent memory intent, TipHoldingWallet.TransferSpec memory spec) = _intent(wallet, false);
        bytes32 digest = w.digestOf(intent);
        vm.expectRevert(bytes("recipient"));
        w.isValidSignature(digest, abi.encode(uint256(1), uint256(1), spec));
    }

    function test_PredictDeterministic() public view {
        assertEq(factory.predict(domainHash), factory.predict(domainHash));
        assertTrue(factory.predict(domainHash) != factory.predict(keccak256(bytes("other.com"))));
    }

    function test_FundBeforeDeployThenRelease() public {
        address predicted = factory.predict(domainHash);
        assertEq(predicted.code.length, 0);
        // Payer funds the box before any contract exists there.
        usdc.mint(predicted, 1_000_000); // 1.00 USDC
        // Claim: owner releases to the verified creator.
        vm.prank(owner);
        address wallet = factory.release(domainHash, creator);
        assertEq(wallet, predicted);
        // 5% fee: creator 0.95, treasury 0.05.
        assertEq(usdc.balanceOf(creator), 950_000);
        assertEq(usdc.balanceOf(treasury), 50_000);
        assertEq(usdc.balanceOf(wallet), 0);
    }

    function test_RevertNonOwnerRelease() public {
        vm.expectRevert(bytes("owner"));
        vm.prank(stranger);
        factory.release(domainHash, creator);
    }

    function test_RevertDirectWalletRelease() public {
        vm.prank(owner);
        address wallet = factory.deploy(domainHash);
        vm.expectRevert(bytes("factory-only"));
        vm.prank(stranger);
        TipHoldingWallet(wallet).release(domainHash, creator);
    }

    function test_RevertEmptyRelease() public {
        vm.expectRevert(bytes("empty"));
        vm.prank(owner);
        factory.release(domainHash, creator);
    }

    function test_RevertZeroCreator() public {
        vm.expectRevert(bytes("creator"));
        vm.prank(owner);
        factory.release(domainHash, address(0));
    }

    function test_DeployIdempotent() public {
        vm.prank(owner);
        address first = factory.deploy(domainHash);
        vm.prank(stranger);
        address second = factory.deploy(domainHash);
        assertEq(first, second);
    }

    function test_RefundPayerBeforeRelease() public {
        address predicted = factory.predict(domainHash);
        usdc.mint(predicted, 1_000_000);
        vm.prank(owner);
        factory.setKeeper(keeper);
        vm.prank(keeper);
        address wallet = factory.refund(domainHash, payer, 1_000_000);
        assertEq(wallet, predicted);
        // Full refund, no fee: payer whole, treasury zero, box empty.
        assertEq(usdc.balanceOf(payer), 1_000_000);
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(wallet), 0);
    }

    function test_RevertNonOwnerNonKeeperRefund() public {
        address predicted = factory.predict(domainHash);
        usdc.mint(predicted, 1_000_000);
        vm.expectRevert(bytes("owner-or-keeper"));
        vm.prank(stranger);
        factory.refund(domainHash, payer, 1_000_000);
    }

    function test_RefundAfterReleaseEmpty() public {
        address predicted = factory.predict(domainHash);
        usdc.mint(predicted, 1_000_000);
        vm.prank(owner);
        factory.release(domainHash, creator);
        vm.prank(owner);
        vm.expectRevert(bytes("empty"));
        factory.refund(domainHash, payer, 1_000_000);
    }
}
