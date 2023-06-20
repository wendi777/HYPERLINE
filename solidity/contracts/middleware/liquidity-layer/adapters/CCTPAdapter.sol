// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import {GasRouter} from "../../../GasRouter.sol";

import {ITokenMessenger} from "../interfaces/circle/ITokenMessenger.sol";
import {ICircleMessageTransmitter} from "../interfaces/circle/ICircleMessageTransmitter.sol";
import {ILiquidityLayerAdapterV2} from "../interfaces/ILiquidityLayerAdapterV2.sol";

import {TypeCasts} from "../../../libs/TypeCasts.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CCTPAdapter is ILiquidityLayerAdapterV2, GasRouter {
    using SafeERC20 for IERC20;

    /// @notice The TokenMessenger contract.
    ITokenMessenger public tokenMessenger;

    /// @notice The Circle MessageTransmitter contract.
    ICircleMessageTransmitter public circleMessageTransmitter;

    /// @notice The USDC token address.
    address public token;

    /// @notice Circle BridgeAdapterType. This would set to "Circle".
    string public bridge;

    string public constant TOKEN_SYMBOL = "USDC";

    /// @notice Hyperlane domain => Circle domain.
    /// ATM, known Circle domains are Ethereum = 0 and Avalanche = 1.
    /// Note this could result in ambiguity between the Circle domain being
    /// Ethereum or unknown.
    mapping(uint32 => uint32) public hyperlaneDomainToCircleDomain;

    /**
     * @notice Emits the nonce of the Circle message when a token is bridged.
     * @param nonce The nonce of the Circle message.
     */
    event BridgedToken(uint64 nonce);

    /**
     * @notice Emitted when the Hyperlane domain to Circle domain mapping is updated.
     * @param hyperlaneDomain The Hyperlane domain.
     * @param circleDomain The Circle domain.
     */
    event DomainAdded(uint32 indexed hyperlaneDomain, uint32 circleDomain);

    /**
     * @param _owner The new owner.
     * @param _tokenMessenger The TokenMessenger contract.
     * @param _circleMessageTransmitter The Circle MessageTransmitter contract.
     * @param _token The USDC token address.
     * @param _bridge The Circle token bridge ID. (This would be set to "Circle".)
     * @param _mailbox The address of the mailbox contract.
     * @param _interchainGasPaymaster The address of the interchain gas paymaster contract.
     * @param _interchainSecurityModule The address of the interchain security module contract.
     */
    function initialize(
        address _owner,
        address _tokenMessenger,
        address _circleMessageTransmitter,
        address _token,
        string calldata _bridge,
        address _mailbox,
        address _interchainGasPaymaster,
        address _interchainSecurityModule
    ) external initializer {
        __HyperlaneConnectionClient_initialize(
            _mailbox,
            _interchainGasPaymaster,
            _interchainSecurityModule,
            _owner
        );

        tokenMessenger = ITokenMessenger(_tokenMessenger);
        circleMessageTransmitter = ICircleMessageTransmitter(
            _circleMessageTransmitter
        );
        token = _token;
        bridge = _bridge;
    }

    function transferRemote(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        uint256 _amount
    ) external override returns (bytes32) {
        _mustHaveRemoteRouter(_destinationDomain);
        uint32 _circleDomain = hyperlaneDomainToCircleDomain[
            _destinationDomain
        ];

        IERC20(token).transferFrom(msg.sender, address(this), _amount);

        uint64 _nonce = tokenMessenger.depositForBurn(
            _amount,
            _circleDomain,
            _recipientAddress, // Mint to the recipient itself. This is different from the CircleBridgeAdapter.
            token
        );

        emit BridgedToken(_nonce);

        bytes memory _adapterData = abi.encode(_nonce, TOKEN_SYMBOL);
        // The user's message "wrapped" required by this middleware
        bytes memory _messageWithEmptyMetadata = abi.encode(
            TypeCasts.addressToBytes32(msg.sender),
            _recipientAddress, // The "user" recipient
            _amount, // The amount of the tokens sent over the bridge
            bridge, // The destination token bridge ID
            _adapterData, // The adapter-specific data
            bytes("") // Empty "user" message
            // TODO : remove handling of user message in the router because it will only be handled by the ICARouter
        );

        // Dispatch the _messageWithEmptyMetadata to the destination's LiquidityLayerRouter.
        return _dispatch(_destinationDomain, _messageWithEmptyMetadata);
    }

    // token transfer is already handled by the CCTPIsm
    function _handle(
        uint32, // origin
        bytes32, // sender
        bytes calldata // message
    ) internal pure override {
        // do nothing
    }

    function quoteGasPayment(uint32 _destinationDomain)
        external
        view
        override(GasRouter, ILiquidityLayerAdapterV2)
        returns (uint256 _gasPayment)
    {
        return
            interchainGasPaymaster.quoteGasPayment(
                _destinationDomain,
                destinationGas[_destinationDomain]
            );
    }

    function payForGas(
        bytes32 _messageId,
        uint32 _destinationDomain,
        uint256 _gasAmount,
        address _refundAddress
    ) external payable override {
        interchainGasPaymaster.payForGas{value: msg.value}(
            _messageId,
            _destinationDomain,
            _gasAmount,
            _refundAddress
        );
    }

    function addDomain(uint32 _hyperlaneDomain, uint32 _circleDomain)
        external
        onlyOwner
    {
        hyperlaneDomainToCircleDomain[_hyperlaneDomain] = _circleDomain;

        emit DomainAdded(_hyperlaneDomain, _circleDomain);
    }
}
