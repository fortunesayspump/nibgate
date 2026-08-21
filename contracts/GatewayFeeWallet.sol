// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// GatewayFeeWallet — ERC-1271 fee policy wallet for Nibgate-hosted content.
//
// Production copy of the contract proven live on Arc testnet
// (revenue-model/poc/gateway/GatewayFeeWallet.sol, 2026-08-09). It serves as
// the seller ("payTo") on BOTH payment rails:
//
//   - Circle Gateway rail: buyers settle gasless batched EIP-3009; the full
//     amount credits this wallet's Gateway ledger balance. The wallet withdraws
//     it via /v1/transfer with contractSigner:true (ERC-1271), USDC mints
//     on-chain into the contract, then distribute() splits.
//   - Direct rail: buyers transfer USDC straight into this wallet on-chain;
//     distribute() splits the real balance.
//
// The fee is enforced on-chain by distribute(): feeBps → treasury, rest →
// creator. feeBps is mutable within [0, maxFeeBps] by a single immutable
// feeSetter (Nibgate's timelock/cold key), so pricing can move (promos, tiers)
// but can never exceed the cap set at deploy and no key ever touches the
// principal. Everything else is immutable: creator, treasury, addresses, and
// the ratio cap. No upgrade path, no admin — migration is a fresh CREATE2
// deployment through GatewayFeeWalletFactory.
//
// Security boundary: the ERC-1271 isValidSignature is a read-only simulation in
// Gateway's TEE, so authorization logic must not mutate onchain state. The
// contract only ever authorizes an exact-domain self-transfer of its own USDC:
// sourceDepositor == sourceSigner == destinationRecipient == this,
// destinationCaller == 0, version == 1, matching Gateway/Minter addresses and
// domain. Nobody can drain it elsewhere; the split ratio is enforced on-chain
// by reading the real balance.

interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

contract GatewayFeeWallet {
    bytes4 internal constant MAGIC = 0x1626ba7e;

    address public immutable creator;
    address public immutable treasury;
    address public immutable feeSetter;
    uint16 public immutable maxFeeBps;
    address public immutable usdc;
    address public immutable gatewayWallet;
    address public immutable gatewayMinter;
    uint32 public immutable domain;

    uint16 public feeBps;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version)");
    // EIP-712 encodeType includes nested type definitions; this must match the
    // canonical encoding (viem/ethers) exactly, or Gateway will reject the sig.
    bytes32 internal constant BURN_INTENT_TYPEHASH =
        keccak256("BurnIntent(uint256 maxBlockHeight,uint256 maxFee,TransferSpec spec)TransferSpec(uint32 version,uint32 sourceDomain,uint32 destinationDomain,bytes32 sourceContract,bytes32 destinationContract,bytes32 sourceToken,bytes32 destinationToken,bytes32 sourceDepositor,bytes32 destinationRecipient,bytes32 sourceSigner,bytes32 destinationCaller,uint256 value,bytes32 salt,bytes hookData)");
    bytes32 internal constant TRANSFER_SPEC_TYPEHASH =
        keccak256("TransferSpec(uint32 version,uint32 sourceDomain,uint32 destinationDomain,bytes32 sourceContract,bytes32 destinationContract,bytes32 sourceToken,bytes32 destinationToken,bytes32 sourceDepositor,bytes32 destinationRecipient,bytes32 sourceSigner,bytes32 destinationCaller,uint256 value,bytes32 salt,bytes hookData)");

    struct TransferSpec {
        uint32 version;
        uint32 sourceDomain;
        uint32 destinationDomain;
        bytes32 sourceContract;
        bytes32 destinationContract;
        bytes32 sourceToken;
        bytes32 destinationToken;
        bytes32 sourceDepositor;
        bytes32 destinationRecipient;
        bytes32 sourceSigner;
        bytes32 destinationCaller;
        uint256 value;
        bytes32 salt;
        bytes hookData;
    }

    struct BurnIntent {
        uint256 maxBlockHeight;
        uint256 maxFee;
        TransferSpec spec;
    }

    event Distributed(uint256 creatorAmount, uint256 treasuryAmount);
    event FeeBpsSet(uint16 oldFeeBps, uint16 newFeeBps);

    constructor(
        address creator_,
        address treasury_,
        address feeSetter_,
        address usdc_,
        address gatewayWallet_,
        address gatewayMinter_,
        uint32 domain_,
        uint16 maxFeeBps_,
        uint16 feeBps_
    ) {
        require(creator_ != address(0) && treasury_ != address(0), "addr");
        require(feeSetter_ != address(0), "feeSetter");
        require(maxFeeBps_ > 0 && maxFeeBps_ <= 5000, "cap");
        require(feeBps_ <= maxFeeBps_, "feeBps");
        creator = creator_;
        treasury = treasury_;
        feeSetter = feeSetter_;
        usdc = usdc_;
        gatewayWallet = gatewayWallet_;
        gatewayMinter = gatewayMinter_;
        domain = domain_;
        maxFeeBps = maxFeeBps_;
        feeBps = feeBps_;
    }

    function domainSeparator() public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("GatewayWallet")),
                keccak256(bytes("1"))
            )
        );
    }

    function setFeeBps(uint16 newFeeBps_) external {
        require(msg.sender == feeSetter, "feeSetter");
        require(newFeeBps_ <= maxFeeBps, "cap");
        emit FeeBpsSet(feeBps, newFeeBps_);
        feeBps = newFeeBps_;
    }

    function hashTransferSpec(TransferSpec memory s) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TRANSFER_SPEC_TYPEHASH,
                s.version,
                s.sourceDomain,
                s.destinationDomain,
                s.sourceContract,
                s.destinationContract,
                s.sourceToken,
                s.destinationToken,
                s.sourceDepositor,
                s.destinationRecipient,
                s.sourceSigner,
                s.destinationCaller,
                s.value,
                s.salt,
                keccak256(s.hookData)
            )
        );
    }

    function hashBurnIntent(BurnIntent memory b) public pure returns (bytes32) {
        return keccak256(
            abi.encode(BURN_INTENT_TYPEHASH, b.maxBlockHeight, b.maxFee, hashTransferSpec(b.spec))
        );
    }

    function digestOf(BurnIntent memory b) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hashBurnIntent(b)));
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        // NOTE: decode as an anonymous tuple, not `(BurnIntent)`. solc 0.8.24
        // abi.decode reverts when decoding into a named struct that contains a
        // nested struct with dynamic members, even though the layout is valid.
        (uint256 maxBlockHeight, uint256 maxFee, TransferSpec memory spec) =
            abi.decode(signature, (uint256, uint256, TransferSpec));
        BurnIntent memory intent = BurnIntent({maxBlockHeight: maxBlockHeight, maxFee: maxFee, spec: spec});
        require(digestOf(intent) == hash, "digest");
        require(intent.spec.version == 1, "version");
        bytes32 self = bytes32(uint256(uint160(address(this))));
        require(intent.spec.sourceDepositor == self, "depositor");
        require(intent.spec.sourceSigner == self, "signer");
        require(intent.spec.destinationRecipient == self, "recipient");
        require(intent.spec.destinationCaller == bytes32(0), "caller");
        require(intent.spec.sourceDomain == domain && intent.spec.destinationDomain == domain, "domain");
        require(
            intent.spec.sourceContract == bytes32(uint256(uint160(gatewayWallet))) &&
            intent.spec.destinationContract == bytes32(uint256(uint160(gatewayMinter))),
            "contracts"
        );
        bytes32 token = bytes32(uint256(uint160(usdc)));
        require(intent.spec.sourceToken == token && intent.spec.destinationToken == token, "token");
        return MAGIC;
    }

    function distribute() external returns (uint256 creatorAmount, uint256 treasuryAmount) {
        IERC20 token = IERC20(usdc);
        uint256 balance = token.balanceOf(address(this));
        treasuryAmount = (balance * feeBps) / 10000;
        creatorAmount = balance - treasuryAmount;
        if (creatorAmount > 0) {
            require(token.transfer(creator, creatorAmount), "creator");
        }
        if (treasuryAmount > 0) {
            require(token.transfer(treasury, treasuryAmount), "treasury");
        }
        emit Distributed(creatorAmount, treasuryAmount);
    }
}