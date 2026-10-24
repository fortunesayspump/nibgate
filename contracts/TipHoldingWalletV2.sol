// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TipHoldingWallet, IERC20Minimal} from "./TipHoldingWallet.sol";

// Versioned future holding wallet. It deliberately keeps the deployed V1
// bytecode and CREATE2 address space untouched. A V2 factory exposes only
// releaseExact, which fails before moving funds unless the on-chain balance is
// exactly the Hub's durable ledger snapshot.
contract TipHoldingWalletV2 is TipHoldingWallet {
    event ReleasedExact(bytes32 indexed domainHash, address indexed creator, uint256 amount, uint256 protocolFee);

    bool private _exactReleaseLocked;

    constructor(
        address factory_,
        address usdc_,
        address treasury_,
        uint16 feeBps_,
        address gatewayWallet_,
        address gatewayMinter_,
        uint32 domain_
    ) TipHoldingWallet(factory_, usdc_, treasury_, feeBps_, gatewayWallet_, gatewayMinter_, domain_) {}

    function releaseExact(bytes32 domainHash, address creator, uint256 expectedAmount) external {
        require(msg.sender == factory, "factory-only");
        require(!_exactReleaseLocked, "reentrant");
        _exactReleaseLocked = true;
        require(creator != address(0), "creator");
        require(expectedAmount > 0, "amount");
        uint256 balance = IERC20Minimal(usdc).balanceOf(address(this));
        require(balance == expectedAmount, "balance-mismatch");
        uint256 fee = (expectedAmount * feeBps) / 10000;
        uint256 payout = expectedAmount - fee;
        require(IERC20Minimal(usdc).transfer(creator, payout), "payout");
        if (fee > 0) require(IERC20Minimal(usdc).transfer(treasury, fee), "fee");
        emit ReleasedExact(domainHash, creator, payout, fee);
        _exactReleaseLocked = false;
    }
}
