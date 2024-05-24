// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

import "forge-std/Script.sol";

import {IXERC20Lockbox} from "../../contracts/token/interfaces/IXERC20Lockbox.sol";
import {IXERC20} from "../../contracts/token/interfaces/IXERC20.sol";
import {IERC20} from "../../contracts/token/interfaces/IXERC20.sol";
import {HypXERC20Lockbox} from "../../contracts/token/extensions/HypXERC20Lockbox.sol";
import {HypXERC20} from "../../contracts/token/extensions/HypXERC20.sol";

import {TypeCasts} from "../../contracts/libs/TypeCasts.sol";
import {TokenMessage} from "../../contracts/token/libs/TokenMessage.sol";

contract ezETH is Script {
    using TypeCasts for address;

    string ETHEREUM_RPC_URL = vm.envString("ETHEREUM_RPC_URL");
    string BLAST_RPC_URL = vm.envString("BLAST_RPC_URL");

    uint256 ethereumFork;
    uint32 ethereumDomainId = 1;
    address ethereumMailbox = 0xc005dc82818d67AF737725bD4bf75435d065D239;
    address ethereumLockbox = 0xC8140dA31E6bCa19b287cC35531c2212763C2059;

    uint256 blastFork;
    uint32 blastDomainId = 81457;
    address blastXERC20 = 0x2416092f143378750bb29b79eD961ab195CcEea5;
    address blastMailbox = 0x3a867fCfFeC2B790970eeBDC9023E75B0a172aa7;

    uint256 amount = 100;

    function setUp() public {
        ethereumFork = vm.createFork(ETHEREUM_RPC_URL);
        blastFork = vm.createFork(BLAST_RPC_URL);
    }

    function run() external {
        bytes32 recipient = address(this).addressToBytes32();
        bytes memory tokenMessage = TokenMessage.format(recipient, amount);
        vm.selectFork(ethereumFork);
        HypXERC20Lockbox hypXERC20Lockbox = new HypXERC20Lockbox(
            ethereumLockbox,
            ethereumMailbox
        );

        vm.selectFork(blastFork);
        HypXERC20 hypXERC20 = new HypXERC20(blastXERC20, blastMailbox);
        hypXERC20.enrollRemoteRouter(
            ethereumDomainId,
            address(hypXERC20Lockbox).addressToBytes32()
        );

        // grant `amount` mint and burn limit to warp route
        vm.prank(IXERC20(blastXERC20).owner());
        IXERC20(blastXERC20).setLimits(address(hypXERC20), amount, amount);

        // test receiving `amount` on warp route
        vm.prank(blastMailbox);
        hypXERC20.handle(
            ethereumDomainId,
            address(hypXERC20Lockbox).addressToBytes32(),
            tokenMessage
        );

        vm.selectFork(ethereumFork);
        hypXERC20Lockbox.enrollRemoteRouter(
            blastDomainId,
            address(hypXERC20).addressToBytes32()
        );

        // grant `amount` mint and burn limit to warp route
        IXERC20 ethereumXERC20 = hypXERC20Lockbox.xERC20();
        vm.prank(ethereumXERC20.owner());
        ethereumXERC20.setLimits(address(hypXERC20Lockbox), amount, amount);

        // get `amount` from lockbox
        // IERC20 erc20 = IXERC20Lockbox(ethereumLockbox).ERC20();
        // vm.prank(ethereumLockbox);
        // erc20.transfer(address(this), amount);
        // erc20.approve(address(hypXERC20Lockbox), amount);
        // hypXERC20Lockbox.transferRemote(blastDomainId, recipient, amount);

        // test receiving `amount` on warp route
        vm.prank(ethereumMailbox);
        hypXERC20Lockbox.handle(
            blastDomainId,
            address(hypXERC20).addressToBytes32(),
            tokenMessage
        );
    }
}
