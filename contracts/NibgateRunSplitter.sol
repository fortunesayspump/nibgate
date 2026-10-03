// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// NibgateRunSplitter — the provider leg of a Dr. Nib research escrow.
//
// Stock ERC-8183 (ACPCore, unmodified) releases the FULL budget to the
// provider on complete(). A research run spends in pieces, so the job's
// provider is set to THIS contract instead of the operator: complete() parks
// the whole cap here, and split() divides it — spent minus fee to the
// operator, fee to treasury, remainder home to the client — in one atomic
// transaction anyone can execute.
//
// Authorization is a keeper signature over (chain, core, this, job, spent,
// operator, client, treasury, fee), verified onchain. The keeper attests the
// spent figure against the offchain run ledger before signing; the contract
// enforces everything else: job Completed, provider is us, spent within
// budget, fee within cap, one split per job. Rejected/expired jobs never
// touch this contract — the core refunds those directly, un-hookable.
//
// Provenance: written for Nibgate. The escrow core is stock ERC-8183
// (erc8183/erc8183-reference, MIT); only this splitter is ours.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IAgenticCommerce {
    enum JobStatus { Open, Funded, Submitted, Completed, Rejected, Expired }
    struct Job {
        address client;
        address provider;
        address evaluator;
        address hook;
        address token;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
    }
    function getJob(uint256 jobId) external view returns (Job memory);
    function submit(uint256 jobId, bytes calldata deliverable, bytes calldata optParams) external;
}

contract NibgateRunSplitter {
    IAgenticCommerce public immutable core;
    address public immutable keeper;
    address public immutable treasury;
    uint256 public immutable feeBps;
    uint256 public constant MAX_FEE_BPS = 500;

    mapping(uint256 => bool) public splitDone;

    event Split(
        uint256 indexed jobId,
        address indexed client,
        address indexed operator,
        uint256 spent,
        uint256 fee,
        uint256 refunded
    );

    error NotCompleted();
    error NotOurJob();
    error AlreadySplit();
    error BadKeeperSig();
    error Overspent();
    error FeeTooHigh();
    error TransferFailed();
    error OnlyKeeper();

    constructor(address core_, address keeper_, address treasury_, uint256 feeBps_) {
        require(core_ != address(0) && keeper_ != address(0) && treasury_ != address(0), "zero address");
        require(feeBps_ <= MAX_FEE_BPS, "fee exceeds cap");
        core = IAgenticCommerce(core_);
        keeper = keeper_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    /// @notice Relay the provider's submit through to the core. Because the
    /// job's provider IS this contract (so complete() parks funds here), the
    /// operator cannot call core.submit directly — the keeper relays the
    /// worker's deliverable instead. Submission moves no money.
    function submitJob(uint256 jobId, bytes calldata deliverable, bytes calldata optParams) external {
        if (msg.sender != keeper) revert OnlyKeeper();
        core.submit(jobId, deliverable, optParams);
    }

    /// @notice Divide a completed job's escrow. Permissionless: anyone may
    /// call once the keeper has signed the spend attestation.
    /// @param jobId The ERC-8183 job id on `core`.
    /// @param spent Total drawn against the cap, in token base units.
    /// @param operator Where the earned share goes.
    /// @param v,r,s Keeper signature over the EIP-191 message below.
    function split(uint256 jobId, uint256 spent, address operator, uint8 v, bytes32 r, bytes32 s) external {
        IAgenticCommerce.Job memory job = core.getJob(jobId);
        if (job.provider != address(this)) revert NotOurJob();
        if (job.status != IAgenticCommerce.JobStatus.Completed) revert NotCompleted();
        if (splitDone[jobId]) revert AlreadySplit();
        if (spent > job.budget) revert Overspent();
        if (operator == address(0) || job.client == address(0)) revert NotOurJob();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(block.chainid, address(core), address(this), jobId, spent, operator, job.client, treasury, feeBps))
            )
        );
        if (ecrecover(digest, v, r, s) != keeper) revert BadKeeperSig();

        splitDone[jobId] = true;

        uint256 fee = (spent * feeBps) / 10000;
        uint256 earned = spent - fee;
        uint256 refund = job.budget - spent;
        IERC20 token = IERC20(job.token);

        if (earned > 0 && !_safeTransfer(token, operator, earned)) revert TransferFailed();
        if (fee > 0 && !_safeTransfer(token, treasury, fee)) revert TransferFailed();
        if (refund > 0 && !_safeTransfer(token, job.client, refund)) revert TransferFailed();

        emit Split(jobId, job.client, operator, spent, fee, refund);
    }

    function _safeTransfer(IERC20 token, address to, uint256 amount) private returns (bool) {
        (bool ok, bytes memory ret) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }
}
