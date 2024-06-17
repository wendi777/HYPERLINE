import { BigNumber, ethers } from 'ethers';

import {
  AggregationHookConfig,
  AggregationIsmConfig,
  ChainMap,
  CoreConfig,
  FallbackRoutingHookConfig,
  HookType,
  IsmType,
  MerkleTreeHookConfig,
  MultisigConfig,
  MultisigIsmConfig,
  PausableHookConfig,
  PausableIsmConfig,
  ProtocolFeeHookConfig,
  RoutingIsmConfig,
  defaultMultisigConfigs,
} from '@hyperlane-xyz/sdk';
import { Address, ProtocolType, objMap } from '@hyperlane-xyz/utils';

import { getChain } from '../../registry.js';

import { igp } from './igp.js';
import { owners } from './owners.js';
import { supportedChainNames } from './supportedChainNames.js';

export const core: ChainMap<CoreConfig> = objMap(
  owners,
  (local, ownerConfig) => {
    const originMultisigs: ChainMap<MultisigConfig> = Object.fromEntries(
      supportedChainNames
        .filter((chain) => getChain(chain).protocol === ProtocolType.Ethereum)
        .filter((chain) => chain !== local)
        .map((origin) => [origin, defaultMultisigConfigs[origin]]),
    );

    const merkleRoot = (multisig: MultisigConfig): MultisigIsmConfig => ({
      type: IsmType.MERKLE_ROOT_MULTISIG,
      ...multisig,
    });

    const messageIdIsm = (multisig: MultisigConfig): MultisigIsmConfig => ({
      type: IsmType.MESSAGE_ID_MULTISIG,
      ...multisig,
    });

    const routingIsm: RoutingIsmConfig = {
      type: IsmType.ROUTING,
      domains: objMap(
        originMultisigs,
        (_, multisig): AggregationIsmConfig => ({
          type: IsmType.AGGREGATION,
          modules: [messageIdIsm(multisig), merkleRoot(multisig)],
          threshold: 1,
        }),
      ),
      ...ownerConfig,
    };

    const pausableIsm: PausableIsmConfig = {
      type: IsmType.PAUSABLE,
      paused: false,
      ...ownerConfig,
    };

    const defaultIsm: AggregationIsmConfig = {
      type: IsmType.AGGREGATION,
      modules: [routingIsm, pausableIsm],
      threshold: 2,
    };

    const merkleHook: MerkleTreeHookConfig = {
      type: HookType.MERKLE_TREE,
    };

    const igpHook = igp[local];

    const pausableHook: PausableHookConfig = {
      type: HookType.PAUSABLE,
      paused: false,
      ...ownerConfig,
    };

    const aggregationHooks = objMap(
      originMultisigs,
      (_origin, _): AggregationHookConfig => ({
        type: HookType.AGGREGATION,
        hooks: [pausableHook, merkleHook, igpHook],
      }),
    );

    const defaultHook: FallbackRoutingHookConfig = {
      type: HookType.FALLBACK_ROUTING,
      ...ownerConfig,
      domains: aggregationHooks,
      fallback: merkleHook,
    };

    const requiredHook: ProtocolFeeHookConfig = {
      type: HookType.PROTOCOL_FEE,
      maxProtocolFee: ethers.utils.parseUnits('1', 'gwei').toString(), // 1 gwei of native token
      protocolFee: BigNumber.from(1).toString(), // 1 wei of native token
      beneficiary: ownerConfig.owner as Address,
      ...ownerConfig,
    };

    return {
      defaultIsm,
      defaultHook,
      requiredHook,
      ...ownerConfig,
    };
  },
);
