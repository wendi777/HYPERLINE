// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

// ============ Internal Imports ============
import {IInterchainSecurityModule} from "../../interfaces/IInterchainSecurityModule.sol";
import {ICcipReadIsm} from "../../interfaces/isms/ICcipReadIsm.sol";
import {IMailbox} from "../../interfaces/IMailbox.sol";
import {Message} from "../../libs/Message.sol";
import {AbstractMultisigIsm} from "../multisig/AbstractMultisigIsm.sol";

/// @dev https://eips.ethereum.org/EIPS/eip-3668
/// @param sender the address of the contract making the call, usually address(this)
/// @param urls the URLs to query for offchain data
/// @param callData context needed for offchain service to service request
/// @param callbackFunction function selector to call with offchain information
/// @param extraData additional passthrough information to call callbackFunction with
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

/**
 * @title AbstractCcipReadIsm
 * @notice An ISM that allows arbitrary payloads to be submitted and verified on chain
 * @dev https://eips.ethereum.org/EIPS/eip-3668
 * @dev The AbstractCcipReadIsm provided by Hyperlane is left intentially minimalist as
 * the range of applications that could be supported by a CcipReadIsm are so broad. However
 * there are few things to note when building a custom CcipReadIsm.
 *
 * 1. `getOffchainVerifyInfo` should revert with a `OffchainLookup` error, which encodes
 *    the data necessary to query for offchain information
 * 2. For full CCIP Read specification compatibility, CcipReadIsm's should expose a function
 *    that in turn calls `process` on the configured Mailbox with the provided metadata and
 *    message. This functions selector should be provided as the `callbackFunction` payload
 *    for the OffchainLookup error
 */
abstract contract AbstractCcipReadIsm is ICcipReadIsm {
    // ============ Constants ============

    // solhint-disable-next-line const-name-snakecase
    uint8 public constant moduleType =
        uint8(IInterchainSecurityModule.Types.CCIP_READ);

    // ============ External Functions ============

    /**
     * @notice Reverts with the data needed to query information offchain before
     * mailbox submission
     * @param _message the Hyperlane encoded message
     * @return bool Ignored
     */
    function getOffchainVerifyInfo(bytes calldata _message)
        external
        view
        virtual
        returns (bool);
}
