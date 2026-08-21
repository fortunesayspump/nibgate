// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GatewayFeeWallet} from "./GatewayFeeWallet.sol";

// GatewayFeeWalletFactory — deterministic per-creator fee wallets via CREATE2.
//
// Nibgate's revenue model keeps the fee policy in a per-creator GatewayFeeWallet
// and lets the payment rail move the full amount. This factory is how those
// wallets come to exist at a predictable address: address = CREATE2(salt
// keccak256(creator), init code = GatewayFeeWallet creation code ++ encoded
// constructor args). Anyone can call deploy(creator) (permissionless,
// deterministic, griefing-proof), so a keeper can materialize a wallet the first
// time it sweeps a creator.
//
// The global fee policy is baked into the factory as immutables: treasury,
// feeSetter, usdc, the Gateway domain contract addresses, maxFeeBps and the
// initial feeBps. Each wallet freezes those values at deploy; feeBps stays
// mutable within the cap via the shared feeSetter key.
//
// The SDK's seller resolution reads predictedWallet(creator) (a view, no deploy
// needed), so payTo resolution works before any wallet exists. This factory is
// the single source of truth for that address — no duplicated hash math in JS.
contract GatewayFeeWalletFactory {
    address public immutable treasury;
    address public immutable feeSetter;
    address public immutable usdc;
    address public immutable gatewayWallet;
    address public immutable gatewayMinter;
    uint32 public immutable domain;
    uint16 public immutable maxFeeBps;
    uint16 public immutable initialFeeBps;

    mapping(address => address) public wallets;

    event WalletDeployed(address indexed creator, address indexed wallet);

    constructor(
        address treasury_,
        address feeSetter_,
        address usdc_,
        address gatewayWallet_,
        address gatewayMinter_,
        uint32 domain_,
        uint16 maxFeeBps_,
        uint16 initialFeeBps_
    ) {
        require(treasury_ != address(0), "treasury");
        require(feeSetter_ != address(0), "feeSetter");
        require(maxFeeBps_ > 0 && maxFeeBps_ <= 5000, "cap");
        require(initialFeeBps_ <= maxFeeBps_, "feeBps");
        treasury = treasury_;
        feeSetter = feeSetter_;
        usdc = usdc_;
        gatewayWallet = gatewayWallet_;
        gatewayMinter = gatewayMinter_;
        domain = domain_;
        maxFeeBps = maxFeeBps_;
        initialFeeBps = initialFeeBps_;
    }

    function saltFor(address creator) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(creator));
    }

    function initCodeHash(address creator) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                type(GatewayFeeWallet).creationCode,
                abi.encode(
                    creator,
                    treasury,
                    feeSetter,
                    usdc,
                    gatewayWallet,
                    gatewayMinter,
                    domain,
                    maxFeeBps,
                    initialFeeBps
                )
            )
        );
    }

    function predictedWallet(address creator) public view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), saltFor(creator), initCodeHash(creator))
                    )
                )
            )
        );
    }

    function deploy(address creator) public returns (address wallet) {
        require(creator != address(0), "creator");
        wallet = predictedWallet(creator);
        require(wallets[creator] == address(0), "exists");
        new GatewayFeeWallet{salt: saltFor(creator)}(
            creator,
            treasury,
            feeSetter,
            usdc,
            gatewayWallet,
            gatewayMinter,
            domain,
            maxFeeBps,
            initialFeeBps
        );
        wallets[creator] = wallet;
        emit WalletDeployed(creator, wallet);
    }

    function deployIfNeeded(address creator) external returns (address) {
        if (wallets[creator] != address(0)) return wallets[creator];
        return deploy(creator);
    }
}