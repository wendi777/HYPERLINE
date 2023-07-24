import { Address, Domain } from '@hyperlane-xyz/utils';

import { BaseAppAdapter } from '../../app/MultiProtocolApp';
import { ChainName } from '../../types';

export interface IRouterAdapter extends BaseAppAdapter {
  interchainSecurityModule(chain: ChainName): Promise<Address>;
  owner: (chain: ChainName) => Promise<Address>;
  remoteDomains(originChain: ChainName): Promise<Domain[]>;
  remoteRouter: (
    originChain: ChainName,
    remoteDomain: Domain,
  ) => Promise<Address>;
  remoteRouters: (
    originChain: ChainName,
  ) => Promise<Array<{ domain: Domain; address: Address }>>;
}

export interface IGasRouterAdapter extends IRouterAdapter {
  quoteGasPayment: (
    origin: ChainName,
    destination: ChainName,
  ) => Promise<string>;
}
