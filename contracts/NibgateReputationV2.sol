// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NibgateReputationV2
/// @notice Upgradeable content-rating registry for Nibgate-indexed reputation.
/// @dev Upgrade of NibgateReputation (V1). APPEND-ONLY storage: slots 0-1
/// (owner, _ratings) are unchanged. New accumulators live in slots 2-3 so the
/// existing per-wallet on-chain records stay intact and readable.
contract NibgateReputationV2 {
    struct Rating {
        uint8 rating;
        bytes32 reviewHash;
        string unlockRef;
        uint64 updatedAt;
    }

    event Initialized(address indexed owner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Upgraded(address indexed implementation);
    event ContentRated(
        bytes32 indexed contentId,
        address indexed rater,
        uint8 rating,
        bytes32 reviewHash,
        string proof
    );
    event ContentStatsSeeded(bytes32 indexed contentId, uint256 count, uint256 sum);

    error AlreadyInitialized();
    error InvalidOwner();
    error InvalidRating();
    error InvalidContent();
    error NotOwner();
    error UpgradeFailed();

    // ── V1 storage (slots 0-1) — DO NOT reorder / change ──
    address public owner;
    mapping(bytes32 => mapping(address => Rating)) private _ratings;

    // ── V2 storage (slots 2-4) — append-only ──
    mapping(bytes32 => uint256) private _contentCount;
    mapping(bytes32 => uint256) private _contentSum;
    // Tracks whether the count/sum accumulators already include a content's
    // pre-upgrade (V1) ratings. Avoids underflow when a V1 rater updates their
    // rating before seedRatings() runs for that content.
    mapping(bytes32 => bool) private _contentSeeded;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function initialize(address initialOwner) external {
        if (owner != address(0)) revert AlreadyInitialized();
        if (initialOwner == address(0)) revert InvalidOwner();
        owner = initialOwner;
        emit Initialized(initialOwner);
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Rate or update a rating for a content hash. Maintains the
    /// content-level count/sum accumulators alongside the per-wallet record.
    function rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string calldata unlockRef) external {
        if (contentId == bytes32(0)) revert InvalidContent();
        if (rating == 0 || rating > 50) revert InvalidRating();

        uint8 previous = _ratings[contentId][msg.sender].rating;
        _ratings[contentId][msg.sender] = Rating({
            rating: rating,
            reviewHash: reviewHash,
            unlockRef: unlockRef,
            updatedAt: uint64(block.timestamp)
        });

        if (previous == 0) {
            _contentCount[contentId] += 1;
            _contentSum[contentId] += rating;
        } else {
            if (!_contentSeeded[contentId]) {
                // Pre-upgrade (V1) rating: backfill the accumulator from the
                // stored value so the update below cannot underflow.
                _contentCount[contentId] += 1;
                _contentSum[contentId] += previous;
                _contentSeeded[contentId] = true;
            }
            _contentSum[contentId] = _contentSum[contentId] - previous + rating;
        }

        emit ContentRated(contentId, msg.sender, rating, reviewHash, unlockRef);
    }

    /// @notice Read a single wallet's rating for a content hash. Same ABI as V1.
    function ratingOf(bytes32 contentId, address rater) external view returns (Rating memory) {
        return _ratings[contentId][rater];
    }

    /// @notice Aggregate stats for a content hash. count = distinct wallets that
    /// have an on-chain rating; sum = total of their stored rating values.
    function contentStats(bytes32 contentId) external view returns (uint256 count, uint256 total) {
        return (_contentCount[contentId], _contentSum[contentId]);
    }

    /// @notice Owner-only backfill of the count/sum accumulators from the
    /// authoritative hub index. Only raters with a real on-chain record are
    /// counted, using the STORED value, so contentStats() always mirrors the
    /// per-wallet mapping. Idempotent: re-running simply re-sets absolute values.
    /// @param contentId Canonical keccak content hash (`nibgate:content:v1|...`).
    /// @param raters Wallet addresses that rated this content (from hub index).
    function seedRatings(bytes32 contentId, address[] calldata raters) external onlyOwner {
        if (contentId == bytes32(0)) revert InvalidContent();
        uint256 count = 0;
        uint256 total = 0;
        for (uint256 i = 0; i < raters.length; i++) {
            uint8 stored = _ratings[contentId][raters[i]].rating;
            if (stored > 0) {
                count += 1;
                total += stored;
            }
        }
        _contentCount[contentId] = count;
        _contentSum[contentId] = total;
        _contentSeeded[contentId] = true;
        emit ContentStatsSeeded(contentId, count, total);
    }

    /// @notice UUPS-style implementation upgrade hook. Use through NibgateReputationProxy.
    function upgradeTo(address newImplementation) external onlyOwner {
        if (newImplementation.code.length == 0) revert UpgradeFailed();
        bytes32 slot = _implementationSlot();
        assembly {
            sstore(slot, newImplementation)
        }
        emit Upgraded(newImplementation);
    }

    function _implementationSlot() internal pure returns (bytes32) {
        return bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    }
}
