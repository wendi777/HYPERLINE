import { BigNumberish } from 'ethers';

import { ChainMap, chainMetadata } from '@hyperlane-xyz/sdk';

import { AgentAwsUser } from '../../agents/aws';
import { KEY_ROLE_ENUM } from '../../agents/roles';

import {
  AgentConfig,
  AgentConfigHelper,
  ConfigHelper,
  KeyConfig,
  KeyType,
} from './index';

export type MatchingList = MatchingListElement[];

export interface MatchingListElement {
  originDomain?: '*' | number | number[];
  senderAddress?: '*' | string | string[];
  destinationDomain?: '*' | number | number[];
  recipientAddress?: '*' | string | string[];
}

export enum GasPaymentEnforcementPolicyType {
  None = 'none',
  Minimum = 'minimum',
  MeetsEstimatedCost = 'meetsEstimatedCost',
  OnChainFeeQuoting = 'onChainFeeQuoting',
}

export type GasPaymentEnforcementPolicy =
  | {
      type: GasPaymentEnforcementPolicyType.None;
    }
  | {
      type: GasPaymentEnforcementPolicyType.Minimum;
      payment: string; // An integer string, may be 0x-prefixed
    }
  | {
      type: GasPaymentEnforcementPolicyType.OnChainFeeQuoting;
      gasfraction?: string; // An optional string of "numerator / denominator", e.g. "1 / 2"
    };

export type GasPaymentEnforcementConfig = GasPaymentEnforcementPolicy & {
  matchingList?: MatchingList;
};

// Incomplete basic relayer agent config
export interface BaseRelayerConfig {
  gasPaymentEnforcement: GasPaymentEnforcementConfig[];
  whitelist?: MatchingList;
  blacklist?: MatchingList;
  transactionGasLimit?: BigNumberish;
  skipTransactionGasLimitFor?: number[];
}

// Full relayer agent config for a single chain
export interface RelayerConfig
  extends Omit<
    BaseRelayerConfig,
    | 'whitelist'
    | 'blacklist'
    | 'skipTransactionGasLimitFor'
    | 'transactionGasLimit'
    | 'gasPaymentEnforcement'
  > {
  relayChains: string;
  gasPaymentEnforcement: string;
  whitelist?: string;
  blacklist?: string;
  transactionGasLimit?: string;
  skipTransactionGasLimitFor?: string;
}

export class RelayerConfigHelper
  extends AgentConfigHelper
  implements ConfigHelper<RelayerConfig>
{
  readonly #relayerConfig?: BaseRelayerConfig;

  constructor(agentConfig: AgentConfig) {
    super(agentConfig, agentConfig.relayer);
    this.#relayerConfig = agentConfig.relayer;
  }

  get isDefined(): boolean {
    return !!this.#relayerConfig;
  }

  async buildConfig(): Promise<RelayerConfig | undefined> {
    if (!this.isDefined) return undefined;
    const baseConfig = this.#relayerConfig!;

    const relayerConfig: RelayerConfig = {
      relayChains: this.contextChainNames.join(','),
      gasPaymentEnforcement: JSON.stringify(baseConfig.gasPaymentEnforcement),
    };

    if (baseConfig.whitelist) {
      relayerConfig.whitelist = JSON.stringify(baseConfig.whitelist);
    }
    if (baseConfig.blacklist) {
      relayerConfig.blacklist = JSON.stringify(baseConfig.blacklist);
    }
    if (baseConfig.transactionGasLimit) {
      relayerConfig.transactionGasLimit =
        baseConfig.transactionGasLimit.toString();
    }
    if (baseConfig.skipTransactionGasLimitFor) {
      relayerConfig.skipTransactionGasLimitFor =
        baseConfig.skipTransactionGasLimitFor.join(',');
    }

    return relayerConfig;
  }

  // Get the signer configuration for each chain by the chain name.
  async signers(): Promise<ChainMap<KeyConfig>> {
    if (!this.aws)
      return Object.fromEntries(
        this.contextChainNames.map((name) => [name, { type: KeyType.Hex }]),
      );

    const awsUser = new AgentAwsUser(
      this.runEnv,
      this.context,
      KEY_ROLE_ENUM.Relayer,
      this.aws.region,
    );
    await awsUser.createIfNotExists();
    const key = (await awsUser.createKeyIfNotExists(this)).keyConfig;
    return Object.fromEntries(
      this.contextChainNames.map((name) => [name, key]),
    );
  }

  // Returns whether the relayer requires AWS credentials
  get requiresAwsCredentials(): boolean {
    // If AWS is present on the agentConfig, we are using AWS keys and need credentials regardless.
    if (!this.aws) {
      console.warn(
        `Relayer does not have AWS credentials. Be sure this is a non-k8s-based environment!`,
      );
      return false;
    }

    return true;
  }
}

// Create a matching list for the given router addresses
export function routerMatchingList(routers: ChainMap<{ router: string }>) {
  const chains = Object.keys(routers);

  const matchingList: MatchingList = [];

  for (const source of chains) {
    for (const destination of chains) {
      if (source === destination) {
        continue;
      }

      matchingList.push({
        originDomain: chainMetadata[source].chainId,
        senderAddress: routers[source].router,
        destinationDomain: chainMetadata[destination].chainId,
        recipientAddress: routers[destination].router,
      });
    }
  }
  return matchingList;
}
