// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TipHoldingWalletV2} from "./TipHoldingWalletV2.sol";

// Candidate V2 factory for a future reviewed deployment. It has a distinct
// CREATE2 init code hash/address space and intentionally offers no whole-box
// release entry point.
contract TipHoldingFactoryV2 {
    address public immutable treasury;
    address public immutable usdc;
    uint16 public immutable feeBps;
    address public immutable gatewayWallet;
    address public immutable gatewayMinter;
    uint32 public immutable domain;
    address public owner;
    address public keeper;

    event HoldingDeployed(bytes32 indexed domainHash, address indexed wallet);
    event HoldingReleasedExact(bytes32 indexed domainHash, address indexed creator, address indexed wallet, uint256 expectedAmount);
    event HoldingRefunded(bytes32 indexed domainHash, address indexed payer, address indexed wallet, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
    modifier onlyOwnerOrKeeper() { require(msg.sender == owner || msg.sender == keeper, "owner-or-keeper"); _; }

    constructor(
        address treasury_, address usdc_, uint16 feeBps_, address owner_,
        address gatewayWallet_, address gatewayMinter_, uint32 domain_
    ) {
        require(treasury_ != address(0), "treasury");
        require(usdc_ != address(0), "usdc");
        require(feeBps_ <= 5000, "cap");
        require(owner_ != address(0), "owner");
        treasury = treasury_; usdc = usdc_; feeBps = feeBps_; owner = owner_;
        gatewayWallet = gatewayWallet_; gatewayMinter = gatewayMinter_; domain = domain_;
    }

    function setOwner(address next) external onlyOwner { require(next != address(0), "owner"); owner = next; }
    function setKeeper(address next) external onlyOwner { keeper = next; }

    function predict(bytes32 domainHash_) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), domainHash_, keccak256(abi.encodePacked(
                type(TipHoldingWalletV2).creationCode,
                abi.encode(address(this), usdc, treasury, feeBps, gatewayWallet, gatewayMinter, domain)
            ))
        )))));
    }

    function deploy(bytes32 domainHash_) public returns (address wallet) {
        wallet = predict(domainHash_);
        if (wallet.code.length == 0) {
            wallet = address(new TipHoldingWalletV2{salt: domainHash_}(address(this), usdc, treasury, feeBps, gatewayWallet, gatewayMinter, domain));
            emit HoldingDeployed(domainHash_, wallet);
        }
    }

    function releaseExact(bytes32 domainHash_, address creator, uint256 expectedAmount) external onlyOwnerOrKeeper returns (address wallet) {
        wallet = deploy(domainHash_);
        TipHoldingWalletV2(wallet).releaseExact(domainHash_, creator, expectedAmount);
        emit HoldingReleasedExact(domainHash_, creator, wallet, expectedAmount);
    }

    function refund(bytes32 domainHash_, address payer, uint256 amount) external onlyOwnerOrKeeper returns (address wallet) {
        require(payer != address(0), "payer");
        wallet = deploy(domainHash_);
        TipHoldingWalletV2(wallet).refund(domainHash_, payer, amount);
        emit HoldingRefunded(domainHash_, payer, wallet, amount);
    }
}
