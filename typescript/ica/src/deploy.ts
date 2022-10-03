import {
  ChainMap,
  ChainName,
  HyperlaneCore,
  HyperlaneRouterDeployer,
  MultiProvider,
  RouterConfig,
} from '@hyperlane-xyz/sdk';

import { InterchainAccountRouter__factory } from '../types';

import {
  InterchainAccountContracts,
  InterchainAccountFactories,
  interchainAccountFactories,
} from './contracts';

export type InterchainAccountConfig = RouterConfig;

export class InterchainAccountDeployer<
  Chain extends ChainName,
> extends HyperlaneRouterDeployer<
  Chain,
  InterchainAccountConfig,
  InterchainAccountContracts,
  InterchainAccountFactories
> {
  constructor(
    multiProvider: MultiProvider<Chain>,
    configMap: ChainMap<Chain, InterchainAccountConfig>,
    protected core: HyperlaneCore<Chain>,
  ) {
    super(multiProvider, configMap, interchainAccountFactories, {});
  }

  // Custom contract deployment logic can go here
  // If no custom logic is needed, call deployContract for the router
  async deployContracts(chain: Chain, config: InterchainAccountConfig) {
    const initCalldata =
      InterchainAccountRouter__factory.createInterface().encodeFunctionData(
        'initialize',
        [config.owner, config.connectionManager, config.interchainGasPaymaster],
      );
    const router = await this.deployContract(chain, 'router', [], {
      create2Salt: 'asdasdsd',
      initCalldata,
    });
    return {
      router,
    };
  }
}
