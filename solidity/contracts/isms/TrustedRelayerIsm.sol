// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

// ============ Internal Imports ============
import {IInterchainSecurityModule} from "../interfaces/IInterchainSecurityModule.sol";
import {Message} from "../libs/Message.sol";
import {Mailbox} from "../Mailbox.sol";

contract TrustedRelayerIsm is IInterchainSecurityModule {
    using Message for bytes;

    uint8 public moduleType = uint8(Types.NULL);
    Mailbox public immutable mailbox;

    address public trustedRelayer;

    constructor(address _mailbox, address _trustedRelayer) {
        mailbox = Mailbox(_mailbox);
        trustedRelayer = _trustedRelayer;
    }

    function verify(bytes calldata, bytes calldata message)
        external
        view
        returns (bool)
    {
        return mailbox.relayer(message.id()) == trustedRelayer;
    }
}
