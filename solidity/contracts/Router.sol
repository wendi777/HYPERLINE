// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.6.11;

// ============ Internal Imports ============
import {HyperlaneConnectionClient} from "./HyperlaneConnectionClient.sol";
import {IInterchainGasPaymaster} from "./interfaces/IInterchainGasPaymaster.sol";
import {IMessageRecipient} from "./interfaces/IMessageRecipient.sol";
import {IMailbox} from "./interfaces/IMailbox.sol";
import {EnumerableMapExtended} from "./libs/EnumerableMapExtended.sol";
import {IGPMetadata} from "./libs/hooks/IGPMetadata.sol";

abstract contract Router is HyperlaneConnectionClient, IMessageRecipient {
    using EnumerableMapExtended for EnumerableMapExtended.UintToBytes32Map;

    string private constant NO_ROUTER_ENROLLED_REVERT_MESSAGE =
        "No router enrolled for domain. Did you specify the right domain ID?";

    // ============ Mutable Storage ============
    EnumerableMapExtended.UintToBytes32Map internal _routers;
    uint256[49] private __GAP; // gap for upgrade safety

    // ============ Events ============

    /**
     * @notice Emitted when a router is set.
     * @param domain The domain of the new router
     * @param router The address of the new router
     */
    event RemoteRouterEnrolled(uint32 indexed domain, bytes32 router);

    // ============ Modifiers ============
    /**
     * @notice Only accept messages from a remote Router contract
     * @param _origin The domain the message is coming from
     * @param _router The address the message is coming from
     */
    modifier onlyRemoteRouter(uint32 _origin, bytes32 _router) {
        require(
            _isRemoteRouter(_origin, _router),
            NO_ROUTER_ENROLLED_REVERT_MESSAGE
        );
        _;
    }

    // ======== Initializer =========
    function __Router_initialize(address _mailbox) internal onlyInitializing {
        __HyperlaneConnectionClient_initialize(_mailbox);
    }

    function __Router_initialize(
        address _mailbox,
        address _interchainGasPaymaster
    ) internal onlyInitializing {
        __HyperlaneConnectionClient_initialize(
            _mailbox,
            _interchainGasPaymaster
        );
    }

    function __Router_initialize(
        address _mailbox,
        address _interchainGasPaymaster,
        address _interchainSecurityModule
    ) internal onlyInitializing {
        __HyperlaneConnectionClient_initialize(
            _mailbox,
            _interchainGasPaymaster,
            _interchainSecurityModule
        );
    }

    // ============ External functions ============
    function domains() external view returns (uint32[] memory) {
        return _routers.uint32Keys();
    }

    /**
     * @notice Returns the address of the Router contract for the given domain
     * @param _domain The remote domain ID.
     * @dev Returns 0 address if no router is enrolled for the given domain
     * @return router The address of the Router contract for the given domain
     */
    function routers(uint32 _domain) public view virtual returns (bytes32) {
        (, bytes32 _router) = _routers.tryGet(_domain);
        return _router;
    }

    /**
     * @notice Register the address of a Router contract for the same Application on a remote chain
     * @param _domain The domain of the remote Application Router
     * @param _router The address of the remote Application Router
     */
    function enrollRemoteRouter(uint32 _domain, bytes32 _router)
        external
        virtual
        onlyOwner
    {
        _enrollRemoteRouter(_domain, _router);
    }

    /**
     * @notice Batch version of `enrollRemoteRouter`
     * @param _domains The domaisn of the remote Application Routers
     * @param _addresses The addresses of the remote Application Routers
     */
    function enrollRemoteRouters(
        uint32[] calldata _domains,
        bytes32[] calldata _addresses
    ) external virtual onlyOwner {
        require(_domains.length == _addresses.length, "!length");
        uint256 length = _domains.length;
        for (uint256 i = 0; i < length; i += 1) {
            _enrollRemoteRouter(_domains[i], _addresses[i]);
        }
    }

    /**
     * @notice Handles an incoming message
     * @param _origin The origin domain
     * @param _sender The sender address
     * @param _message The message
     */
    function handle(
        uint32 _origin,
        bytes32 _sender,
        bytes calldata _message
    )
        external
        payable
        virtual
        override
        onlyMailbox
        onlyRemoteRouter(_origin, _sender)
    {
        _handle(_origin, _sender, _message);
    }

    // ============ Virtual functions ============
    function _handle(
        uint32 _origin,
        bytes32 _sender,
        bytes calldata _message
    ) internal virtual;

    // ============ Internal functions ============

    /**
     * @notice Set the router for a given domain
     * @param _domain The domain
     * @param _address The new router
     */
    function _enrollRemoteRouter(uint32 _domain, bytes32 _address)
        internal
        virtual
    {
        _routers.set(_domain, _address);
        emit RemoteRouterEnrolled(_domain, _address);
    }

    /**
     * @notice Return true if the given domain / router is the address of a remote Application Router
     * @param _domain The domain of the potential remote Application Router
     * @param _address The address of the potential remote Application Router
     */
    function _isRemoteRouter(uint32 _domain, bytes32 _address)
        internal
        view
        returns (bool)
    {
        return routers(_domain) == _address;
    }

    /**
     * @notice Assert that the given domain has a Application Router registered and return its address
     * @param _domain The domain of the chain for which to get the Application Router
     * @return _router The address of the remote Application Router on _domain
     */
    function _mustHaveRemoteRouter(uint32 _domain)
        internal
        view
        returns (bytes32)
    {
        (bool contained, bytes32 _router) = _routers.tryGet(_domain);
        require(contained, NO_ROUTER_ENROLLED_REVERT_MESSAGE);
        return _router;
    }

    /**
     * @notice Dispatches a message to an enrolled router via the local router's Mailbox
     * and pays for it to be relayed to the destination.
     * @dev Reverts if there is no enrolled router for _destinationDomain.
     * @param _destinationDomain The domain of the chain to which to send the message.
     * @param _messageBody Raw bytes content of message.
     * @param _gasAmount The amount of destination gas for the message that is requested via the InterchainGasPaymaster.
     * @param _gasPayment The amount of native tokens to pay for the message to be relayed.
     * @param _gasPaymentRefundAddress The address to refund any gas overpayment to.
     */
    function _dispatchWithGas(
        uint32 _destinationDomain,
        bytes memory _messageBody,
        uint256 _gasAmount,
        uint256 _gasPayment,
        address _gasPaymentRefundAddress
    ) internal returns (bytes32 _messageId) {
        // Ensure that destination chain has an enrolled router.
        bytes32 _router = _mustHaveRemoteRouter(_destinationDomain);
        bytes memory metadata = IGPMetadata.formatMetadata(
            _gasAmount,
            _gasPaymentRefundAddress
        );
        _messageId = mailbox.dispatch{value: _gasPayment}(
            _destinationDomain,
            _router,
            _messageBody,
            metadata
        );
    }

    function _dispatch(uint32 _destinationDomain, bytes memory _messageBody)
        internal
        virtual
        returns (bytes32)
    {
        bytes32 _router = _mustHaveRemoteRouter(_destinationDomain);
        return
            mailbox.dispatch{value: msg.value}(
                _destinationDomain,
                _router,
                _messageBody
            );
    }
}
