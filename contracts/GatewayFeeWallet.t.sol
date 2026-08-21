// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GatewayFeeWallet} from "./GatewayFeeWallet.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract GatewayFeeWalletTest is Test {
    GatewayFeeWallet wallet;
    MockUSDC usdc;

    address creator = makeAddr("creator");
    address treasury = makeAddr("treasury");
    address feeSetter = makeAddr("feeSetter");
    address gatewayWalletAddr = makeAddr("gatewayWallet");
    address gatewayMinterAddr = makeAddr("gatewayMinter");
    uint32 constant DOMAIN = 26;
    uint16 constant MAX_FEE_BPS = 5000;
    uint16 constant FEE_BPS = 100; // 1%

    // Build a fresh wallet with standard params.
    function _deploy() internal {
        wallet = new GatewayFeeWallet(
            creator, treasury, feeSetter, address(usdc),
            gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, FEE_BPS
        );
    }

    function _burnIntent() internal view returns (GatewayFeeWallet.BurnIntent memory) {
        bytes32 self = bytes32(uint256(uint160(address(wallet))));
        GatewayFeeWallet.TransferSpec memory spec = GatewayFeeWallet.TransferSpec({
            version: 1,
            sourceDomain: DOMAIN,
            destinationDomain: DOMAIN,
            sourceContract: bytes32(uint256(uint160(gatewayWalletAddr))),
            destinationContract: bytes32(uint256(uint160(gatewayMinterAddr))),
            sourceToken: bytes32(uint256(uint160(address(usdc)))),
            destinationToken: bytes32(uint256(uint160(address(usdc)))),
            sourceDepositor: self,
            destinationRecipient: self,
            sourceSigner: self,
            destinationCaller: bytes32(0),
            value: 1_000_000,
            salt: keccak256("salt"),
            hookData: ""
        });
        return GatewayFeeWallet.BurnIntent({maxBlockHeight: 1000, maxFee: 5000, spec: spec});
    }

    function setUp() public {
        usdc = new MockUSDC();
        _deploy();
    }

    // ── constructor validation ────────────────────────────────────────────

    function test_RevertZeroCreator() public {
        vm.expectRevert(bytes("addr"));
        new GatewayFeeWallet(address(0), treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, FEE_BPS);
    }

    function test_RevertZeroTreasury() public {
        vm.expectRevert(bytes("addr"));
        new GatewayFeeWallet(creator, address(0), feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, FEE_BPS);
    }

    function test_RevertZeroFeeSetter() public {
        vm.expectRevert(bytes("feeSetter"));
        new GatewayFeeWallet(creator, treasury, address(0), address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, FEE_BPS);
    }

    function test_RevertZeroCap() public {
        vm.expectRevert(bytes("cap"));
        new GatewayFeeWallet(creator, treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, 0, 0);
    }

    function test_RevertCapAboveLimit() public {
        vm.expectRevert(bytes("cap"));
        new GatewayFeeWallet(creator, treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, 5001, 0);
    }

    function test_RevertInitialFeeAboveCap() public {
        vm.expectRevert(bytes("feeBps"));
        new GatewayFeeWallet(creator, treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, 100, 101);
    }

    // ── setFeeBps ─────────────────────────────────────────────────────────

    function test_SetFeeBpsByFeeSetter() public {
        vm.prank(feeSetter);
        vm.expectEmit(true, true, true, true);
        emit GatewayFeeWallet.FeeBpsSet(FEE_BPS, 250);
        wallet.setFeeBps(250);
        assertEq(wallet.feeBps(), 250);
    }

    function test_RevertSetFeeBpsNotFeeSetter() public {
        vm.prank(creator);
        vm.expectRevert(bytes("feeSetter"));
        wallet.setFeeBps(250);
    }

    function test_SetFeeBpsBoundaries() public {
        vm.startPrank(feeSetter);
        wallet.setFeeBps(0); // free promo
        assertEq(wallet.feeBps(), 0);
        wallet.setFeeBps(MAX_FEE_BPS); // hard cap reachable
        assertEq(wallet.feeBps(), MAX_FEE_BPS);
        vm.stopPrank();
    }

    function test_RevertSetFeeBpsAboveCap() public {
        vm.prank(feeSetter);
        vm.expectRevert(bytes("cap"));
        wallet.setFeeBps(MAX_FEE_BPS + 1);
    }

    // ── distribute (both rails land USDC here) ────────────────────────────

    function test_DistributeExactSplit() public {
        usdc.mint(address(wallet), 1_000_000);
        vm.expectEmit(true, true, true, true);
        emit GatewayFeeWallet.Distributed(990_000, 10_000);
        wallet.distribute();
        assertEq(usdc.balanceOf(creator), 990_000, "creator gets 99%");
        assertEq(usdc.balanceOf(treasury), 10_000, "treasury gets 1%");
        assertEq(usdc.balanceOf(address(wallet)), 0, "wallet drained");
    }

    function test_DistributeRoundingFavorsCreator() public {
        usdc.mint(address(wallet), 9_999); // 9999*100/10000 = 99 (floor)
        wallet.distribute();
        assertEq(usdc.balanceOf(treasury), 99);
        assertEq(usdc.balanceOf(creator), 9_900);
        assertEq(usdc.balanceOf(address(wallet)), 0, "no dust left behind");
    }

    function test_DistributeZeroFeeAllToCreator() public {
        vm.prank(feeSetter);
        wallet.setFeeBps(0);
        usdc.mint(address(wallet), 5_000);
        wallet.distribute();
        assertEq(usdc.balanceOf(creator), 5_000);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_DistributeMaxFeeHalfHalf() public {
        vm.prank(feeSetter);
        wallet.setFeeBps(MAX_FEE_BPS);
        usdc.mint(address(wallet), 1_000_001);
        wallet.distribute();
        assertEq(usdc.balanceOf(treasury), 500_000);
        assertEq(usdc.balanceOf(creator), 500_001);
    }

    function test_DistributeEmptyBalanceNoOp() public {
        vm.expectEmit(true, true, true, true);
        emit GatewayFeeWallet.Distributed(0, 0);
        wallet.distribute();
        assertEq(usdc.balanceOf(creator), 0);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_DistributeIsPermissionlessButPaysPolicy() public {
        // Anyone can trigger the split; the caller receives nothing.
        usdc.mint(address(wallet), 1_000_000);
        address random = makeAddr("random");
        vm.prank(random);
        wallet.distribute();
        assertEq(usdc.balanceOf(random), 0);
        assertEq(usdc.balanceOf(creator), 990_000);
        assertEq(usdc.balanceOf(treasury), 10_000);
    }

    function test_DirectRailTransferThenDistribute() public {
        // Direct rail: buyer transfers USDC straight into the wallet on-chain.
        address buyer = makeAddr("buyer");
        usdc.mint(buyer, 2_000_000);
        vm.prank(buyer);
        usdc.transfer(address(wallet), 2_000_000);
        wallet.distribute();
        assertEq(usdc.balanceOf(creator), 1_980_000);
        assertEq(usdc.balanceOf(treasury), 20_000);
    }

    // ── ERC-1271 isValidSignature ─────────────────────────────────────────

    function _encodeSig(GatewayFeeWallet.BurnIntent memory intent) internal pure returns (bytes memory) {
        return abi.encode(intent.maxBlockHeight, intent.maxFee, intent.spec);
    }

    function test_IsValidSignatureAcceptsSelfTransferIntent() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        bytes32 digest = wallet.digestOf(intent);
        assertEq(wallet.isValidSignature(digest, _encodeSig(intent)), bytes4(0x1626ba7e));
    }

    function test_RevertWrongDigest() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        vm.expectRevert(bytes("digest"));
        wallet.isValidSignature(bytes32(uint256(1)), _encodeSig(intent));
    }

    function test_RevertWrongVersion() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.version = 2;
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("version"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertForeignDepositor() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.sourceDepositor = bytes32(uint256(123));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("depositor"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertForeignSigner() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.sourceSigner = bytes32(uint256(123));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("signer"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertForeignRecipient() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.destinationRecipient = bytes32(uint256(123));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("recipient"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertNonZeroDestinationCaller() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.destinationCaller = bytes32(uint256(1));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("caller"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertWrongDomain() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.destinationDomain = DOMAIN + 1;
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("domain"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertWrongContracts() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.destinationContract = bytes32(uint256(9));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("contracts"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    function test_RevertWrongToken() public {
        GatewayFeeWallet.BurnIntent memory intent = _burnIntent();
        intent.spec.sourceToken = bytes32(uint256(9));
        bytes32 digest = wallet.digestOf(intent);
        vm.expectRevert(bytes("token"));
        wallet.isValidSignature(digest, _encodeSig(intent));
    }

    // ── EIP-712 encoding sanity ───────────────────────────────────────────

    function test_DomainSeparatorMatchesCanonicalEncoding() public {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256(bytes("GatewayWallet")),
                keccak256(bytes("1"))
            )
        );
        assertEq(wallet.domainSeparator(), expected);
    }

    function test_DigestIsDeterministicAndSaltSensitive() public {
        GatewayFeeWallet.BurnIntent memory a = _burnIntent();
        GatewayFeeWallet.BurnIntent memory b = _burnIntent();
        b.spec.salt = keccak256("other");
        assertTrue(wallet.digestOf(a) == wallet.digestOf(a));
        assertTrue(wallet.digestOf(a) != wallet.digestOf(b));
    }
}
