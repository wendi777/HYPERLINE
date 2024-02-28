/* eslint-disable @typescript-eslint/no-empty-interface */
import { MsgTransferEncodeObject } from '@cosmjs/stargate';

import {
  Address,
  Numberish,
  ProtocolType,
  assert,
  eqAddress,
} from '@hyperlane-xyz/utils';

import { ChainMetadata } from '../metadata/chainMetadataTypes';
import { MultiProtocolProvider } from '../providers/MultiProtocolProvider';
import { ChainName } from '../types';

import type { IToken, TokenArgs } from './IToken';
import { TokenAmount } from './TokenAmount';
import { TokenConnection, TokenConnectionType } from './TokenConnection';
import {
  PROTOCOL_TO_NATIVE_STANDARD,
  TOKEN_COLLATERALIZED_STANDARDS,
  TOKEN_HYP_STANDARDS,
  TOKEN_MULTI_CHAIN_STANDARDS,
  TOKEN_NFT_STANDARDS,
  TOKEN_STANDARD_TO_PROTOCOL,
  TokenStandard,
} from './TokenStandard';
import {
  CwHypCollateralAdapter,
  CwHypNativeAdapter,
  CwHypSyntheticAdapter,
  CwNativeTokenAdapter,
  CwTokenAdapter,
} from './adapters/CosmWasmTokenAdapter';
import {
  CosmIbcToWarpTokenAdapter,
  CosmIbcTokenAdapter,
  CosmNativeTokenAdapter,
} from './adapters/CosmosTokenAdapter';
import {
  EvmHypCollateralAdapter,
  EvmHypNativeAdapter,
  EvmHypSyntheticAdapter,
  EvmNativeTokenAdapter,
  EvmTokenAdapter,
} from './adapters/EvmTokenAdapter';
import type { IHypTokenAdapter, ITokenAdapter } from './adapters/ITokenAdapter';
import {
  SealevelHypCollateralAdapter,
  SealevelHypNativeAdapter,
  SealevelHypSyntheticAdapter,
  SealevelNativeTokenAdapter,
  SealevelTokenAdapter,
} from './adapters/SealevelTokenAdapter';

// Declaring the interface in addition to class allows
// Typescript to infer the members vars from TokenArgs
export interface Token extends TokenArgs {}

export class Token implements IToken {
  public readonly protocol: ProtocolType;

  constructor(args: TokenArgs) {
    Object.assign(this, args);
    this.protocol = TOKEN_STANDARD_TO_PROTOCOL[this.standard];
  }

  static FromChainMetadataNativeToken(chainMetadata: ChainMetadata): Token {
    const { protocol, name: chainName, nativeToken, logoURI } = chainMetadata;
    assert(
      nativeToken,
      `ChainMetadata for ${chainMetadata.name} missing nativeToken`,
    );

    return new Token({
      chainName,
      standard: PROTOCOL_TO_NATIVE_STANDARD[protocol],
      addressOrDenom: nativeToken.denom ?? '',
      decimals: nativeToken.decimals,
      symbol: nativeToken.symbol,
      name: nativeToken.name,
      logoURI,
    });
  }

  /**
   * Returns a TokenAdapter for the token and multiProvider
   * @throws If multiProvider does not contain this token's chain.
   * @throws If token is an NFT (TODO NFT Adapter support)
   */
  getAdapter(multiProvider: MultiProtocolProvider): ITokenAdapter<unknown> {
    const { standard, chainName, addressOrDenom } = this;

    assert(!this.isNft(), 'NFT adapters not yet supported');
    assert(
      multiProvider.tryGetChainMetadata(chainName),
      `Token chain ${chainName} not found in multiProvider`,
    );

    if (standard === TokenStandard.ERC20) {
      return new EvmTokenAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    } else if (standard === TokenStandard.EvmNative) {
      return new EvmNativeTokenAdapter(chainName, multiProvider, {});
    } else if (standard === TokenStandard.SealevelSpl) {
      return new SealevelTokenAdapter(
        chainName,
        multiProvider,
        { token: addressOrDenom },
        false,
      );
    } else if (standard === TokenStandard.SealevelSpl2022) {
      return new SealevelTokenAdapter(
        chainName,
        multiProvider,
        { token: addressOrDenom },
        true,
      );
    } else if (standard === TokenStandard.SealevelNative) {
      return new SealevelNativeTokenAdapter(chainName, multiProvider, {});
    } else if (standard === TokenStandard.CosmosIcs20) {
      throw new Error('Cosmos ICS20 token adapter not yet supported');
    } else if (standard === TokenStandard.CosmosNative) {
      return new CosmNativeTokenAdapter(
        chainName,
        multiProvider,
        {},
        { ibcDenom: addressOrDenom },
      );
    } else if (standard === TokenStandard.CW20) {
      return new CwTokenAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    } else if (standard === TokenStandard.CWNative) {
      return new CwNativeTokenAdapter(
        chainName,
        multiProvider,
        {},
        addressOrDenom,
      );
    } else if (this.isHypToken()) {
      return this.getHypAdapter(multiProvider);
    } else if (this.isIbcToken()) {
      // Passing in a stub connection here because it's not required
      // for an IBC adapter to fulfill the ITokenAdapter interface
      return this.getIbcAdapter(multiProvider, {
        token: this,
        sourcePort: 'transfer',
        sourceChannel: 'channel-0',
        type: TokenConnectionType.Ibc,
      });
    } else {
      throw new Error(`No adapter found for token standard: ${standard}`);
    }
  }

  /**
   * Returns a HypTokenAdapter for the token and multiProvider
   * @throws If not applicable to this token's standard.
   * @throws If multiProvider does not contain this token's chain.
   * @throws If token is an NFT (TODO NFT Adapter support)
   */
  getHypAdapter(
    multiProvider: MultiProtocolProvider<{ mailbox?: Address }>,
    destination?: ChainName,
  ): IHypTokenAdapter<unknown> {
    const {
      protocol,
      standard,
      chainName,
      addressOrDenom,
      collateralAddressOrDenom,
    } = this;
    const chainMetadata = multiProvider.tryGetChainMetadata(chainName);
    const mailbox = chainMetadata?.mailbox;

    assert(
      this.isMultiChainToken(),
      `Token standard ${standard} not applicable to hyp adapter`,
    );
    assert(!this.isNft(), 'NFT adapters not yet supported');
    assert(
      chainMetadata,
      `Token chain ${chainName} not found in multiProvider`,
    );

    let sealevelAddresses;
    if (protocol === ProtocolType.Sealevel) {
      assert(mailbox, `Mailbox required for Sealevel hyp tokens`);
      assert(
        collateralAddressOrDenom,
        `collateralAddressOrDenom required for Sealevel hyp tokens`,
      );
      sealevelAddresses = {
        warpRouter: addressOrDenom,
        token: collateralAddressOrDenom,
        mailbox,
      };
    }
    if (standard === TokenStandard.EvmHypNative) {
      return new EvmHypNativeAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    } else if (standard === TokenStandard.EvmHypCollateral) {
      return new EvmHypCollateralAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    } else if (standard === TokenStandard.EvmHypSynthetic) {
      return new EvmHypSyntheticAdapter(chainName, multiProvider, {
        token: addressOrDenom,
      });
    } else if (standard === TokenStandard.SealevelHypNative) {
      return new SealevelHypNativeAdapter(
        chainName,
        multiProvider,
        sealevelAddresses!,
        false,
      );
    } else if (standard === TokenStandard.SealevelHypCollateral) {
      return new SealevelHypCollateralAdapter(
        chainName,
        multiProvider,
        sealevelAddresses!,
        false,
      );
    } else if (standard === TokenStandard.SealevelHypSynthetic) {
      return new SealevelHypSyntheticAdapter(
        chainName,
        multiProvider,
        sealevelAddresses!,
        false,
      );
    } else if (standard === TokenStandard.CwHypNative) {
      return new CwHypNativeAdapter(chainName, multiProvider, {
        warpRouter: addressOrDenom,
      });
    } else if (standard === TokenStandard.CwHypCollateral) {
      assert(
        collateralAddressOrDenom,
        'collateralAddressOrDenom required for CwHypCollateral',
      );
      return new CwHypCollateralAdapter(chainName, multiProvider, {
        warpRouter: addressOrDenom,
        token: collateralAddressOrDenom,
      });
    } else if (standard === TokenStandard.CwHypSynthetic) {
      assert(
        collateralAddressOrDenom,
        'collateralAddressOrDenom required for CwHypSyntheticAdapter',
      );
      return new CwHypSyntheticAdapter(chainName, multiProvider, {
        warpRouter: addressOrDenom,
        token: collateralAddressOrDenom,
      });
    } else if (standard === TokenStandard.CosmosIbc) {
      assert(destination, 'destination required for IBC token adapters');
      const connection = this.getConnectionForChain(destination);
      assert(connection, `No connection found for chain ${destination}`);
      return this.getIbcAdapter(multiProvider, connection);
    } else {
      throw new Error(`No hyp adapter found for token standard: ${standard}`);
    }
  }

  protected getIbcAdapter(
    multiProvider: MultiProtocolProvider,
    connection: TokenConnection,
  ): IHypTokenAdapter<MsgTransferEncodeObject> {
    if (connection.type === TokenConnectionType.Ibc) {
      const { sourcePort, sourceChannel } = connection;
      return new CosmIbcTokenAdapter(
        this.chainName,
        multiProvider,
        {},
        { ibcDenom: this.addressOrDenom, sourcePort, sourceChannel },
      );
    } else if (connection.type === TokenConnectionType.IbcHyperlane) {
      const {
        sourcePort,
        sourceChannel,
        intermediateChainName,
        intermediateIbcDenom,
        intermediateRouterAddress,
      } = connection;
      const destinationRouterAddress = connection.token.addressOrDenom;
      return new CosmIbcToWarpTokenAdapter(
        this.chainName,
        multiProvider,
        {
          intermediateRouterAddress,
          destinationRouterAddress,
        },
        {
          ibcDenom: this.addressOrDenom,
          sourcePort,
          sourceChannel,
          intermediateIbcDenom,
          intermediateChainName,
        },
      );
    } else {
      throw new Error(`Unsupported IBC connection type: ${connection.type}`);
    }
  }

  /**
   * Convenience method to create an adapter and return an account balance
   */
  async getBalance(
    multiProvider: MultiProtocolProvider,
    address: Address,
  ): Promise<TokenAmount> {
    const adapter = this.getAdapter(multiProvider);
    const balance = await adapter.getBalance(address);
    return new TokenAmount(balance, this);
  }

  amount(amount: Numberish): TokenAmount {
    return new TokenAmount(amount, this);
  }

  isNft(): boolean {
    return TOKEN_NFT_STANDARDS.includes(this.standard);
  }

  isNative(): boolean {
    return Object.values(PROTOCOL_TO_NATIVE_STANDARD).includes(this.standard);
  }

  isHypToken(): boolean {
    return TOKEN_HYP_STANDARDS.includes(this.standard);
  }

  isIbcToken(): boolean {
    return this.standard === TokenStandard.CosmosIbc;
  }

  isMultiChainToken(): boolean {
    return TOKEN_MULTI_CHAIN_STANDARDS.includes(this.standard);
  }

  getConnections(): TokenConnection[] {
    return this.connections || [];
  }

  getConnectionForChain(chain: ChainName): TokenConnection | undefined {
    // A token cannot have > 1 connected token for the same chain
    return this.getConnections().filter((t) => t.token.chainName === chain)[0];
  }

  addConnection(connection: TokenConnection): Token {
    this.connections = [...(this.connections || []), connection];
    return this;
  }

  removeConnection(token: Token): Token {
    const index = this.connections?.findIndex((t) => t.token.equals(token));
    if (index && index >= 0) this.connections?.splice(index, 1);
    return this;
  }

  /**
   * Returns true if tokens refer to the same asset
   */
  equals(token: Token): boolean {
    return (
      this.protocol === token.protocol &&
      this.chainName === token.chainName &&
      this.standard === token.standard &&
      this.decimals === token.decimals &&
      this.addressOrDenom.toLowerCase() ===
        token.addressOrDenom.toLowerCase() &&
      this.collateralAddressOrDenom?.toLowerCase() ===
        token.collateralAddressOrDenom?.toLowerCase()
    );
  }

  /**
   * Checks if this token is both:
   *    1) Of a TokenStandard that uses other tokens as collateral (eg. EvmHypCollateral)
   *    2) Has a collateralAddressOrDenom address that matches the given token
   * E.g. ERC20 Token ABC, EvmHypCollateral DEF that wraps ABC, DEF.collateralizes(ABC) === true
   */
  collateralizes(token: Token): boolean {
    if (token.chainName !== this.chainName) return false;
    if (!TOKEN_COLLATERALIZED_STANDARDS.includes(this.standard)) return false;
    const isCollateralWrapper =
      this.collateralAddressOrDenom &&
      eqAddress(this.collateralAddressOrDenom, token.addressOrDenom);
    const isNativeWrapper = !this.collateralAddressOrDenom && token.isNative();
    return isCollateralWrapper || isNativeWrapper;
  }
}
