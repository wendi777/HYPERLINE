import { utils } from '@abacus-network/deploy';
import { CoreEnvironmentConfig } from '../../../src/config';
import { agent } from './agent';
import { core } from './core';
import { testConfigs, TestNetworks } from './domains';
import { governance } from './governance';
import { infra } from './infra';

export const environment: CoreEnvironmentConfig<TestNetworks> = {
  transactionConfigs: testConfigs,
  agent,
  core,
  governance,
  infra,
  // NOTE: Does not work from hardhat.config.ts
  getMultiProvider: async () => {
    const hre = await import('hardhat');
    const [signer] = await hre.ethers.getSigners();
    return utils.initHardhatMultiProvider(testConfigs, signer);
  },
};
