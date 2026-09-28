// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// TipHoldingWallet — no-key per-site money box for Nib Tip holds.
//
// Funds arrive either as plain USDC transfers (direct rail) or as Circle
// Gateway ledger credits (gateway rail; deferred batched EIP-3009). There are
// no keys, no owners, no signers — the box still cannot move funds on its own.
//
// To make a Gateway credit collectable (a keyless contract otherwise strands
// it in Gateway's ledger forever) the box implements ERC-1271 exactly like
// GatewayFeeWallet: it authorizes only an exact-domain SELF transfer of its own
// credit. The hub keeper submits that intent via /v1/transfer with
// contractSigner:true, USDC mints on-chain into the box, and only then may the
// factory call release(). Nobody can ever send the box's funds anywhere else.
//
// Release splits atomically: creator gets balance minus fee, treasury gets the
// fee. Every release emits an event so anyone can audit releases against hub
// claim records.
contract TipHoldingWallet {
    bytes4 internal constant MAGIC = 0x1626ba7e;

    address public immutable factory;
    address public immutable usdc;
    address public immutable treasury;
    uint16 public immutable feeBps;
    address public immutable gatewayWallet;
    address public immutable gatewayMinter;
    uint32 public immutable domain;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version)");
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

    event Released(bytes32 indexed domainHash, address indexed creator, uint256 amount, uint256 protocolFee);
    event Refunded(bytes32 indexed domainHash, address indexed payer, uint256 amount);

    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address factory_,
        address usdc_,
        address treasury_,
        uint16 feeBps_,
        address gatewayWallet_,
        address gatewayMinter_,
        uint32 domain_
    ) {
        require(factory_ != address(0), "factory");
        require(usdc_ != address(0), "usdc");
        require(treasury_ != address(0), "treasury");
        require(feeBps_ <= 5000, "cap");
        factory = factory_;
        usdc = usdc_;
        treasury = treasury_;
        feeBps = feeBps_;
        gatewayWallet = gatewayWallet_;
        gatewayMinter = gatewayMinter_;
        domain = domain_;
    }

    function release(bytes32 domainHash, address creator) external nonReentrant {
        require(msg.sender == factory, "factory-only");
        require(creator != address(0), "creator");
        uint256 balance = IERC20Minimal(usdc).balanceOf(address(this));
        require(balance > 0, "empty");
        uint256 fee = (balance * feeBps) / 10000;
        uint256 payout = balance - fee;
        require(IERC20Minimal(usdc).transfer(creator, payout), "payout");
        if (fee > 0) require(IERC20Minimal(usdc).transfer(treasury, fee), "fee");
        emit Released(domainHash, creator, payout, fee);
    }

    // Payer refund for unclaimed tips: sends min(amount, balance) back in full
    // (no fee — it never reached a creator). Factory-only; the hub verifies
    // offchain that the tip is still held (not released/claimed) and that the
    // caller is the original payer before relaying.
    function refund(bytes32 domainHash, address payer, uint256 amount) external nonReentrant {
        require(msg.sender == factory, "factory-only");
        require(payer != address(0), "payer");
        uint256 balance = IERC20Minimal(usdc).balanceOf(address(this));
        uint256 value = amount < balance ? amount : balance;
        require(value > 0, "empty");
        require(IERC20Minimal(usdc).transfer(payer, value), "refund");
        emit Refunded(domainHash, payer, value);
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

    // ERC-1271: authorize ONLY an exact-domain self transfer of this box's own
    // Gateway credit. Read-only simulation in Gateway's TEE — never mutates.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
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
}
