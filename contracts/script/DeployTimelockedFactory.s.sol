// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Timelock} from "../Timelock.sol";
import {GatewayFeeWalletFactory} from "../GatewayFeeWalletFactory.sol";

// Deploy a fresh Timelock + GatewayFeeWalletFactory wired to it.
//
//   forge script script/DeployTimelockedFactory.s.sol \
//     --rpc-url <rpc> --broadcast --verify
//
// Required env:
//   GOVERNANCE        address that schedules/executes timelock ops (multisig)
//   TIMELOCK_DELAY    seconds, e.g. 172800 (2 days)
//   TREASURY, USDC, GATEWAY_WALLET, GATEWAY_MINTER, GATEWAY_DOMAIN
//   MAX_FEE_BPS (e.g. 2000), INITIAL_FEE_BPS (e.g. 100)
//
// Existing EOA-setter wallets are NOT migratable in place (feeSetter is an
// immutable): sweep their balances to wallets from the new factory and point
// seller resolution at the new factory address.
contract DeployTimelockedFactory is Script {
    function run() external {
        address governance = vm.envAddress("GOVERNANCE");
        uint256 delay = vm.envUint("TIMELOCK_DELAY");
        address treasury = vm.envAddress("TREASURY");
        address usdc = vm.envAddress("USDC");
        address gatewayWallet = vm.envAddress("GATEWAY_WALLET");
        address gatewayMinter = vm.envAddress("GATEWAY_MINTER");
        uint32 domain = uint32(vm.envUint("GATEWAY_DOMAIN"));
        uint16 maxFeeBps = uint16(vm.envUint("MAX_FEE_BPS"));
        uint16 initialFeeBps = uint16(vm.envUint("INITIAL_FEE_BPS"));

        vm.startBroadcast();
        Timelock timelock = new Timelock(governance, delay);
        GatewayFeeWalletFactory factory = new GatewayFeeWalletFactory(
            treasury,
            address(timelock),
            usdc,
            gatewayWallet,
            gatewayMinter,
            domain,
            maxFeeBps,
            initialFeeBps
        );
        vm.stopBroadcast();

        console2.log("Timelock", address(timelock));
        console2.log("GatewayFeeWalletFactory", address(factory));
    }
}
