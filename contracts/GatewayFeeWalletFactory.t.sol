// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GatewayFeeWallet} from "./GatewayFeeWallet.sol";
import {GatewayFeeWalletFactory} from "./GatewayFeeWalletFactory.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract GatewayFeeWalletFactoryTest is Test {
    GatewayFeeWalletFactory factory;
    MockUSDC usdc;

    address treasury = makeAddr("treasury");
    address feeSetter = makeAddr("feeSetter");
    address gatewayWalletAddr = makeAddr("gatewayWallet");
    address gatewayMinterAddr = makeAddr("gatewayMinter");
    uint32 constant DOMAIN = 26;
    uint16 constant MAX_FEE_BPS = 5000;
    uint16 constant INITIAL_FEE_BPS = 100;

    function setUp() public {
        usdc = new MockUSDC();
        factory = new GatewayFeeWalletFactory(
            treasury, feeSetter, address(usdc),
            gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS
        );
    }

    // ── constructor validation ────────────────────────────────────────────

    function test_RevertZeroTreasury() public {
        vm.expectRevert(bytes("treasury"));
        new GatewayFeeWalletFactory(address(0), feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS);
    }

    function test_RevertZeroFeeSetter() public {
        vm.expectRevert(bytes("feeSetter"));
        new GatewayFeeWalletFactory(treasury, address(0), address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS);
    }

    function test_RevertBadCap() public {
        vm.expectRevert(bytes("cap"));
        new GatewayFeeWalletFactory(treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, 0, 0);
    }

    function test_RevertInitialFeeAboveCap() public {
        vm.expectRevert(bytes("feeBps"));
        new GatewayFeeWalletFactory(treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, 100, 101);
    }

    // ── CREATE2 prediction + deploy ───────────────────────────────────────

    function test_DeployLandsAtPredictedAddress() public {
        address creator = makeAddr("creator");
        address predicted = factory.predictedWallet(creator);
        vm.prank(makeAddr("anyone")); // permissionless
        address deployed = factory.deploy(creator);
        assertEq(deployed, predicted, "deploy must land at the CREATE2 prediction");
        assertEq(factory.wallets(creator), predicted);
        assertTrue(predicted.code.length > 0);
    }

    function test_PredictedMatchesCanonicalCreate2Math() public {
        address creator = makeAddr("creator");
        bytes32 salt = keccak256(abi.encodePacked(creator));
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(GatewayFeeWallet).creationCode,
                abi.encode(creator, treasury, feeSetter, address(usdc), gatewayWalletAddr, gatewayMinterAddr, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS)
            )
        );
        address expected = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), salt, initCodeHash)))));
        assertEq(factory.predictedWallet(creator), expected);
        assertEq(factory.saltFor(creator), salt);
        assertEq(factory.initCodeHash(creator), initCodeHash);
    }

    function test_DeployedWalletHasFrozenPolicy() public {
        address creator = makeAddr("creator");
        GatewayFeeWallet wallet = GatewayFeeWallet(factory.deploy(creator));
        assertEq(wallet.creator(), creator);
        assertEq(wallet.treasury(), treasury);
        assertEq(wallet.feeSetter(), feeSetter);
        assertEq(address(wallet.usdc()), address(usdc));
        assertEq(address(wallet.gatewayWallet()), gatewayWalletAddr);
        assertEq(address(wallet.gatewayMinter()), gatewayMinterAddr);
        assertEq(wallet.domain(), DOMAIN);
        assertEq(wallet.maxFeeBps(), MAX_FEE_BPS);
        assertEq(wallet.feeBps(), INITIAL_FEE_BPS);
    }

    function test_EmitWalletDeployed() public {
        address creator = makeAddr("creator");
        address predicted = factory.predictedWallet(creator);
        vm.expectEmit(true, true, true, true);
        emit GatewayFeeWalletFactory.WalletDeployed(creator, predicted);
        factory.deploy(creator);
    }

    function test_RevertDoubleDeploy() public {
        address creator = makeAddr("creator");
        factory.deploy(creator);
        vm.expectRevert(bytes("exists"));
        factory.deploy(creator);
    }

    function test_RevertDeployZeroCreator() public {
        vm.expectRevert(bytes("creator"));
        factory.deploy(address(0));
    }

    function test_DifferentCreatorsDifferentWallets() public {
        address a = makeAddr("a");
        address b = makeAddr("b");
        assertNotEq(factory.deploy(a), factory.deploy(b));
    }

    // ── deployIfNeeded ────────────────────────────────────────────────────

    function test_DeployIfNeededDeploysThenReturns() public {
        address creator = makeAddr("creator");
        address first = factory.deployIfNeeded(creator);
        assertTrue(first.code.length > 0);
        // Second call must return the SAME address without redeploying.
        address second = factory.deployIfNeeded(creator);
        assertEq(second, first);
        assertEq(factory.wallets(creator), first);
    }

    function test_DeployIfNeededPermissionless() public {
        address creator = makeAddr("creator");
        vm.prank(makeAddr("keeper"));
        address w = factory.deployIfNeeded(creator);
        assertTrue(w != address(0));
    }

    // ── end-to-end policy through a factory-deployed wallet ───────────────

    function test_DeployedWalletSplitsPerPolicy() public {
        address creator = makeAddr("creator");
        GatewayFeeWallet wallet = GatewayFeeWallet(factory.deploy(creator));
        usdc.mint(address(wallet), 1_000_000);
        wallet.distribute();
        assertEq(usdc.balanceOf(creator), 990_000);
        assertEq(usdc.balanceOf(treasury), 10_000);
    }

    function test_SharedFeeSetterMovesAllWallets() public {
        address a = makeAddr("a");
        address b = makeAddr("b");
        GatewayFeeWallet wa = GatewayFeeWallet(factory.deploy(a));
        GatewayFeeWallet wb = GatewayFeeWallet(factory.deploy(b));
        vm.prank(feeSetter);
        wa.setFeeBps(200);
        vm.prank(feeSetter);
        wb.setFeeBps(300);
        assertEq(wa.feeBps(), 200);
        assertEq(wb.feeBps(), 300);
    }
}
