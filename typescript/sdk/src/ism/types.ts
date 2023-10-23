import {
  IAggregationIsm,
  IInterchainSecurityModule,
  IMultisigIsm,
  IRoutingIsm,
  StaticMerkleRootMultisigIsm,
  StaticMessageIdMultisigIsm,
  TestMultisigIsm,
} from '@hyperlane-xyz/core';
import type { Address } from '@hyperlane-xyz/utils';

import { ChainMap } from '../types';

export type DeployedIsm =
  | IInterchainSecurityModule
  | IMultisigIsm
  | IAggregationIsm
  | IRoutingIsm
  | StaticMessageIdMultisigIsm
  | StaticMerkleRootMultisigIsm
  | TestMultisigIsm;

export enum ModuleType {
  UNUSED,
  ROUTING,
  AGGREGATION,
  LEGACY_MULTISIG, // DEPRECATED
  MERKLE_ROOT_MULTISIG,
  MESSAGE_ID_MULTISIG,
  TEST_ISM,
}

export type MultisigConfig = {
  validators: Array<Address>;
  threshold: number;
};

export type MultisigIsmConfig = MultisigConfig & {
  type: ModuleType.MERKLE_ROOT_MULTISIG | ModuleType.MESSAGE_ID_MULTISIG;
};

export type TestMultisigIsmConfig = MultisigConfig & {
  type: ModuleType.TEST_ISM;
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
  | TestMultisigIsmConfig;
