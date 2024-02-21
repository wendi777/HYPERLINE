import { Address, Domain, Numberish } from '@hyperlane-xyz/utils';

import { MinimalTokenMetadata } from '../config';

export interface TransferParams {
  weiAmountOrId: Numberish;
  recipient: Address;

  // Solana-specific params
  // Included here optionally to keep Adapter types simple
  fromTokenAccount?: Address;
  fromAccountOwner?: Address;
}

export interface InterchainGasQuote {
  addressOrDenom?: string; // undefined values represent default native tokens
  amount: bigint;
}

export interface TransferRemoteParams extends TransferParams {
  destination: Domain;
  interchainGas?: InterchainGasQuote;
}

export interface ITokenAdapter<Tx> {
  getBalance(address: Address): Promise<bigint>;
  getMetadata(isNft?: boolean): Promise<MinimalTokenMetadata>;
  isApproveRequired(
    owner: Address,
    spender: Address,
    weiAmountOrId: Numberish,
  ): Promise<boolean>;
  populateApproveTx(params: TransferParams): Promise<Tx>;
  populateTransferTx(params: TransferParams): Promise<Tx>;
}

export interface IHypTokenAdapter<Tx> extends ITokenAdapter<Tx> {
  getDomains(): Promise<Domain[]>;
  getRouterAddress(domain: Domain): Promise<Buffer>;
  getAllRouters(): Promise<Array<{ domain: Domain; address: Buffer }>>;
  quoteGasPayment(destination: Domain): Promise<InterchainGasQuote>;
  populateTransferRemoteTx(p: TransferRemoteParams): Promise<Tx>;
}
