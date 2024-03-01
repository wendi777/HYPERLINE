import { InterchainAccountRouter } from '@hyperlane-xyz/core';
import { ProtocolType } from '@hyperlane-xyz/utils';

import {
  HyperlaneEnvironment,
  hyperlaneEnvironments,
} from '../../consts/environments';
import {
  appFromAddressesMapHelper,
  filterChainMapToProtocol,
} from '../../contracts/contracts';
import {
  HyperlaneAddressesMap,
  HyperlaneContracts,
} from '../../contracts/types';
import { MultiProvider } from '../../providers/MultiProvider';
import { RouterApp } from '../../router/RouterApps';

import {
  InterchainAccountFactories,
  interchainAccountFactories,
} from './contracts';

export class InterchainAccount extends RouterApp<InterchainAccountFactories> {
  router(
    contracts: HyperlaneContracts<InterchainAccountFactories>,
  ): InterchainAccountRouter {
    return contracts.interchainAccountRouter;
  }

  static fromEnvironment<Env extends HyperlaneEnvironment>(
    env: Env,
    multiProvider: MultiProvider,
  ): InterchainAccount {
    const envAddresses = hyperlaneEnvironments[env];
    if (!envAddresses) {
      throw new Error(`No addresses found for ${env}`);
    }
    // Filter out non-EVM chains, as interchain accounts are EVM only at the moment.
    const ethAddresses = filterChainMapToProtocol(
      envAddresses,
      ProtocolType.Ethereum,
      multiProvider,
    );
    return InterchainAccount.fromAddressesMap(ethAddresses, multiProvider);
  }

  static fromAddressesMap(
    addressesMap: HyperlaneAddressesMap<any>,
    multiProvider: MultiProvider,
  ): InterchainAccount {
    const helper = appFromAddressesMapHelper(
      addressesMap,
      interchainAccountFactories,
      multiProvider,
    );
    printKeysTwoLevelsDown(helper.contractsMap);
    return new InterchainAccount(helper.contractsMap, helper.multiProvider);
  }
}

function printKeysTwoLevelsDown(obj: any) {
  for (const key of Object.keys(obj)) {
    console.log(key);
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      for (const subKey of Object.keys(obj[key])) {
        if (subKey === 'interchainAccountIsm') {
          console.log(
            `  ${subKey} : ${JSON.stringify(
              obj[key][subKey].address,
              null,
              2,
            )}`,
          );
        }
      }
    }
  }
}
