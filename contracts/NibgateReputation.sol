// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NibgateReputation
/// @notice Upgradeable content-rating registry for Nibgate-indexed reputation.
/// @dev Content stays on creator sites. This contract only records wallet-authored
/// rating attestations that Nibgate indexes after matching an unlock receipt.
contract NibgateReputation {
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

    error AlreadyInitialized();
    error InvalidOwner();
    error InvalidRating();
    error InvalidContent();
    error NotOwner();
    error UpgradeFailed();

    address public owner;
    mapping(bytes32 => mapping(address => Rating)) private _ratings;

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

    /// @notice Rate or update a rating for a content hash.
    /// @param contentId Hash of `nibgate:content:v1|domain|externalContentId|canonicalUrl`.
    /// @param rating Rating from 1-50, where 48 means 4.8 stars.
    /// @param reviewHash Optional hash of a private/public text review.
    /// @param unlockRef Payment id, tx hash, receipt hash, or unlock proof reference.
    function rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string calldata unlockRef) external {
        if (contentId == bytes32(0)) revert InvalidContent();
        if (rating == 0 || rating > 50) revert InvalidRating();

        _ratings[contentId][msg.sender] = Rating({
            rating: rating,
            reviewHash: reviewHash,
            unlockRef: unlockRef,
            updatedAt: uint64(block.timestamp)
        });

        emit ContentRated(contentId, msg.sender, rating, reviewHash, unlockRef);
    }

    function ratingOf(bytes32 contentId, address rater) external view returns (Rating memory) {
        return _ratings[contentId][rater];
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

/// @title NibgateReputationProxy
/// @notice Minimal ERC-1967 proxy for the Nibgate reputation implementation.
contract NibgateReputationProxy {
    event Upgraded(address indexed implementation);

    constructor(address implementation, bytes memory initData) payable {
        if (implementation.code.length == 0) revert();
        bytes32 slot = _implementationSlot();
        assembly {
            sstore(slot, implementation)
        }
        emit Upgraded(implementation);

        if (initData.length > 0) {
            (bool ok, bytes memory reason) = implementation.delegatecall(initData);
            if (!ok) {
                assembly {
                    revert(add(reason, 32), mload(reason))
                }
            }
        }
    }

    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }

    function implementation() external view returns (address impl) {
        bytes32 slot = _implementationSlot();
        assembly {
            impl := sload(slot)
        }
    }

    function _fallback() internal {
        bytes32 slot = _implementationSlot();
        address impl;
        assembly {
            impl := sload(slot)
        }
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function _implementationSlot() internal pure returns (bytes32) {
        return bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    }
}
