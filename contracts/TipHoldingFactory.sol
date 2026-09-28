// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TipHoldingWallet} from "./TipHoldingWallet.sol";

// TipHoldingFactory — deterministic per-site holding boxes via CREATE2.
//
// Address = CREATE2(salt keccak256(canonical domain), init code = wallet
// creation code ++ encoded constructor args). Anyone can call deploy()
// (permissionless, deterministic, griefing-proof). The SDK predicts the
// address offchain with the same formula, so payers fund boxes that may
// not exist yet — funds are safe, the factory always materializes the
// expected code at the expected address.
//
// Release is owner-gated (hub keeper): deploy-if-needed, then forward to
// the wallet. The fee policy is baked in as immutables, mirrored from the
// unlock fee machinery (treasury, held-tier feeBps).
contract TipHoldingFactory {
    address public immutable treasury;
    address public immutable usdc;
    uint16 public immutable feeBps;
    address public immutable gatewayWallet;
    address public immutable gatewayMinter;
    uint32 public immutable domain;
    address public owner;

    event HoldingDeployed(bytes32 indexed domainHash, address indexed wallet);
    event HoldingReleased(bytes32 indexed domainHash, address indexed creator, address indexed wallet);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    constructor(
        address treasury_,
        address usdc_,
        uint16 feeBps_,
        address owner_,
        address gatewayWallet_,
        address gatewayMinter_,
        uint32 domain_
    ) {
        require(treasury_ != address(0), "treasury");
        require(usdc_ != address(0), "usdc");
        require(feeBps_ <= 5000, "cap");
        require(owner_ != address(0), "owner");
        treasury = treasury_;
        usdc = usdc_;
        feeBps = feeBps_;
        owner = owner_;
        gatewayWallet = gatewayWallet_;
        gatewayMinter = gatewayMinter_;
        domain = domain_;
    }

    function setOwner(address next) external onlyOwner {
        require(next != address(0), "owner");
        owner = next;
    }

    function domainHash(string calldata domain) public pure returns (bytes32) {
        return keccak256(bytes(domain));
    }

    function predict(bytes32 domainHash_) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            domainHash_,
            keccak256(abi.encodePacked(
                type(TipHoldingWallet).creationCode,
                abi.encode(address(this), usdc, treasury, feeBps, gatewayWallet, gatewayMinter, domain)
            ))
        )))));
    }

    function walletFor(bytes32 domainHash_) public view returns (address) {
        address predicted = predict(domainHash_);
        if (predicted.code.length == 0) return address(0);
        return predicted;
    }

    function deploy(bytes32 domainHash_) public returns (address wallet) {
        wallet = predict(domainHash_);
        if (wallet.code.length == 0) {
            wallet = address(new TipHoldingWallet{salt: domainHash_}(address(this), usdc, treasury, feeBps, gatewayWallet, gatewayMinter, domain));
            emit HoldingDeployed(domainHash_, wallet);
        }
        return wallet;
    }

    function release(bytes32 domainHash_, address creator) external onlyOwner returns (address wallet) {
        require(creator != address(0), "creator");
        wallet = deploy(domainHash_);
        TipHoldingWallet(wallet).release(domainHash_, creator);
        emit HoldingReleased(domainHash_, creator, wallet);
    }
}
