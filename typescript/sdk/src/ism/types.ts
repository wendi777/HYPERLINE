import {
  IAggregationIsm,
  IInterchainSecurityModule,
  IMultisigIsm,
  IRoutingIsm,
} from '@hyperlane-xyz/core';
import type { Address } from '@hyperlane-xyz/utils';

import { NoMetadataIsmConfig } from '../hook/types';
import { ChainMap } from '../types';

export type DeployedIsm =
  | IInterchainSecurityModule
  | IMultisigIsm
  | IAggregationIsm
  | IRoutingIsm;

export enum ModuleType {
  UNUSED,
  ROUTING,
  AGGREGATION,
  // DEPRECATED
  LEGACY_MULTISIG,
  MERKLE_ROOT_MULTISIG,
  MESSAGE_ID_MULTISIG,
}

export type MultisigConfig = {
  validators: Array<Address>;
  threshold: number;
};

export type MultisigIsmConfig = MultisigConfig & {
  type: ModuleType.MERKLE_ROOT_MULTISIG | ModuleType.MESSAGE_ID_MULTISIG;
};

export type RoutingIsmConfig = {
  type: ModuleType.ROUTING;
  owner: Address;
  domains: ChainMap<IsmConfig>;
};

export type AggregationIsmConfig = {
  type: ModuleType.AGGREGATION;
  modules: Array<IsmConfig>;
  threshold: number;
};

export type IsmConfig =
  | Address
  | RoutingIsmConfig
  | MultisigIsmConfig
  | AggregationIsmConfig
  | NoMetadataIsmConfig;
