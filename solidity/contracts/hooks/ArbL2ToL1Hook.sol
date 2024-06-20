// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

/*@@@@@@@       @@@@@@@@@
 @@@@@@@@@       @@@@@@@@@
  @@@@@@@@@       @@@@@@@@@
   @@@@@@@@@       @@@@@@@@@
    @@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@  HYPERLANE  @@@@@@@
    @@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@@@@@@       @@@@@@@@@
  @@@@@@@@@       @@@@@@@@@
 @@@@@@@@@       @@@@@@@@@
@@@@@@@@@       @@@@@@@@*/

// ============ Internal Imports ============
import {AbstractPostDispatchHook} from "./libs/AbstractMessageIdAuthHook.sol";
import {AbstractMessageIdAuthHook} from "./libs/AbstractMessageIdAuthHook.sol";
import {Mailbox} from "../Mailbox.sol";
import {StandardHookMetadata} from "./libs/StandardHookMetadata.sol";
import {Message} from "../libs/Message.sol";
import {TypeCasts} from "../libs/TypeCasts.sol";
import {IPostDispatchHook} from "../interfaces/hooks/IPostDispatchHook.sol";
import {MailboxClient} from "../client/MailboxClient.sol";

// ============ External Imports ============
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ArbSys} from "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";

/**
 * @title ArbL2ToL1Hook
 * @notice Message hook to inform the ArbL2ToL1iSM of messages published through
 * the native Arbitrum bridge.
 * @notice This works only for L2 -> L1 messages and has the 7 day delay as specified by the ArbSys contract.
 */
contract ArbL2ToL1Hook is AbstractMessageIdAuthHook {
    using StandardHookMetadata for bytes;

    // ============ Constants ============

    // precompile contract on L2 for sending messages to L1
    ArbSys public immutable arbSys;

    // ============ Constructor ============

    constructor(
        address _mailbox,
        uint32 _destinationDomain,
        bytes32 _ism,
        address _arbSys
    ) AbstractMessageIdAuthHook(_mailbox, _destinationDomain, _ism) {
        arbSys = ArbSys(_arbSys);
    }

    // ============ Internal functions ============
    function _quoteDispatch(
        bytes calldata,
        bytes calldata
    ) internal pure override returns (uint256) {
        return 0; // TODO: non-zero value
    }

    // ============ Internal functions ============

    /// @inheritdoc AbstractMessageIdAuthHook
    function _sendMessageId(
        bytes calldata metadata,
        bytes memory payload
    ) internal override {
        arbSys.sendTxToL1{value: metadata.msgValue(0)}(
            TypeCasts.bytes32ToAddress(ism),
            payload
        );
    }
}
