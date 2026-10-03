// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {NibgateRunSplitter} from "./NibgateRunSplitter.sol";

/// Faithful stand-in for stock ACPCore's settlement behavior: on complete()
/// the FULL budget moves to the job's provider, then getJob reports
/// Completed. The splitter is what divides it afterwards. Only the two
/// functions the splitter touches are modeled; core lifecycle rules
/// (roles, expiry) belong to the audited upstream, not to this test.
contract FakeCore {
    struct Job {
        address client;
        address provider;
        address evaluator;
        address hook;
        address token;
        uint256 budget;
        uint256 expiredAt;
        uint8 status; // 3 == Completed
    }
    mapping(uint256 => Job) public jobs;
    mapping(uint256 => bytes) public submitted;

    function openJob(uint256 id, address client, address provider, address token, uint256 budget) external {
        jobs[id] = Job(client, provider, address(0), address(0), token, budget, block.timestamp + 7 days, 1);
        // Funding modeled exactly like the real fund(): pull via transferFrom
        // after approve — the caller approves first.
        MockUSDC(token).transferFrom(msg.sender, address(this), budget);
    }

    function completeJob(uint256 id) external {
        Job storage job = jobs[id];
        job.status = 3;
        MockUSDC(job.token).transfer(job.provider, job.budget);
    }

    function submit(uint256 id, bytes calldata deliverable, bytes calldata) external {
        submitted[id] = deliverable;
        Job storage job = jobs[id];
        job.status = 2;
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}

contract NibgateRunSplitterTest is Test {
    MockUSDC usdc;
    FakeCore core;
    NibgateRunSplitter splitter;

    address keeper;
    uint256 keeperKey = 0xA11CE;
    address client = address(0xC11E);
    address operator = address(0x0EBA);
    address treasury = address(0x7EA5);

    function setUp() public {
        keeper = vm.addr(keeperKey);
        usdc = new MockUSDC();
        core = new FakeCore();
        splitter = new NibgateRunSplitter(address(core), keeper, treasury, 100);
        usdc.mint(client, 10_000_000); // 10 USDC
        vm.startPrank(client);
        usdc.approve(address(core), type(uint256).max);
        core.openJob(1, client, address(splitter), address(usdc), 2_500_000); // $2.50 cap
        vm.stopPrank();
        core.completeJob(1);
    }

    function _sig(uint256 jobId, uint256 spent, address operator_) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(block.chainid, address(core), address(splitter), jobId, spent, operator_, client, treasury, uint256(100)))
            )
        );
        (v, r, s) = vm.sign(keeperKey, digest);
    }

    function test_split_divides_spent_fee_refund() public {
        (uint8 v, bytes32 r, bytes32 s) = _sig(1, 1_200_000, operator); // $1.20 spent
        splitter.split(1, 1_200_000, operator, v, r, s);
        assertEq(usdc.balanceOf(operator), 1_188_000); // spent minus 1%
        assertEq(usdc.balanceOf(treasury), 12_000); // 1% fee
        assertEq(usdc.balanceOf(client), 8_800_000); // 10.00 - 2.50 + 1.30 refund
    }

    function test_split_zero_spend_refunds_all() public {
        (uint8 v, bytes32 r, bytes32 s) = _sig(1, 0, operator);
        splitter.split(1, 0, operator, v, r, s);
        assertEq(usdc.balanceOf(operator), 0);
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(client), 10_000_000);
    }

    function test_reject_wrong_keeper() public {
        (uint8 v, bytes32 r, bytes32 s) = _sig(1, 1_200_000, operator);
        vm.expectRevert(NibgateRunSplitter.BadKeeperSig.selector);
        // corrupt one bit of s
        splitter.split(1, 1_200_000, operator, v, r, bytes32(uint256(s) ^ 1));
    }

    function test_reject_overspend() public {
        (uint8 v, bytes32 r, bytes32 s) = _sig(1, 2_500_001, operator);
        vm.expectRevert(NibgateRunSplitter.Overspent.selector);
        splitter.split(1, 2_500_001, operator, v, r, s);
    }

    function test_reject_double_split() public {
        (uint8 v, bytes32 r, bytes32 s) = _sig(1, 1_000_000, operator);
        splitter.split(1, 1_000_000, operator, v, r, s);
        vm.expectRevert(NibgateRunSplitter.AlreadySplit.selector);
        splitter.split(1, 1_000_000, operator, v, r, s);
    }

    function test_reject_uncompleted_job() public {
        vm.startPrank(client);
        core.openJob(2, client, address(splitter), address(usdc), 1_000_000);
        vm.stopPrank();
        (uint8 v, bytes32 r, bytes32 s) = _sig(2, 500_000, operator);
        vm.expectRevert(NibgateRunSplitter.NotCompleted.selector);
        splitter.split(2, 500_000, operator, v, r, s);
    }

    function test_submitJob_relays_and_gates_keeper() public {
        bytes memory deliverable = abi.encode(bytes32(uint256(7)), uint256(500_000));
        vm.prank(keeper);
        splitter.submitJob(1, deliverable, "");
        assertEq(core.submitted(1), deliverable);
        vm.expectRevert(NibgateRunSplitter.OnlyKeeper.selector);
        vm.prank(client);
        splitter.submitJob(1, deliverable, "");
    }
}
