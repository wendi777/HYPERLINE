import { confirm, input, select } from '@inquirer/prompts';
import { BigNumber as BigNumberJs } from 'bignumber.js';
import { ethers } from 'ethers';
import { z } from 'zod';

import {
  ChainMap,
  ChainName,
  HookConfig,
  HookConfigSchema,
  HookType,
} from '@hyperlane-xyz/sdk';
import {
  Address,
  normalizeAddressEvm,
  objMap,
  toWei,
} from '@hyperlane-xyz/utils';

import { CommandContext } from '../context/types.js';
import { errorRed, log, logBlue, logGreen, logRed } from '../logger.js';
import { runMultiChainSelectionStep } from '../utils/chains.js';
import { mergeYamlOrJson, readYamlOrJson } from '../utils/files.js';

// TODO: deprecate in favor of CoreConfigSchema
const HooksConfigSchema = z.object({
  default: HookConfigSchema,
  required: HookConfigSchema,
});
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
const HooksConfigMapSchema = z.record(HooksConfigSchema);
export type HooksConfigMap = z.infer<typeof HooksConfigMapSchema>;

export function isValidHookConfigMap(config: any) {
  return HooksConfigMapSchema.safeParse(config).success;
}

export function presetHookConfigs(owner: Address): HooksConfig {
  return {
    required: {
      type: HookType.PROTOCOL_FEE,
      maxProtocolFee: ethers.utils.parseUnits('1', 'gwei').toString(),
      protocolFee: ethers.utils.parseUnits('0', 'wei').toString(),
      beneficiary: owner,
      owner: owner,
    },
    default: {
      type: HookType.MERKLE_TREE,
    },
  };
}

export function readHooksConfigMap(filePath: string) {
  const config = readYamlOrJson(filePath);
  if (!config) {
    logRed(`No hook config found at ${filePath}`);
    return;
  }
  const parsedConfig = HooksConfigMapSchema.parse(config);
  const hooks: ChainMap<HooksConfig> = objMap(
    parsedConfig,
    (_, config) => config as HooksConfig,
  );
  logGreen(`All hook configs in ${filePath} are valid for ${hooks}`);
  return hooks;
}

export async function createHooksConfigMap({
  context,
  outPath,
}: {
  context: CommandContext;
  outPath: string;
}) {
  logBlue('Creating a new hook config');
  const chains = await runMultiChainSelectionStep(context.chainMetadata);

  const result: HooksConfigMap = {};
  for (const chain of chains) {
    for (const hookRequirements of ['required', 'default']) {
      log(`\nSet ${hookRequirements} hook for chain ${chain}:`);
      const remotes = chains.filter((c) => c !== chain);
      result[chain] = {
        ...result[chain],
        [hookRequirements]: await createHookConfig(context, chain, remotes),
      };
    }
    if (isValidHookConfigMap(result)) {
      logGreen(`Hook config is valid, writing to file ${outPath}`);
      mergeYamlOrJson(outPath, result);
    } else {
      errorRed(
        `Hook config is invalid, please see https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/cli/examples/hooks.yaml for an example`,
      );
      throw new Error('Invalid hook config');
    }
  }
}

export async function createHookConfig(
  context: CommandContext,
  chain: ChainName,
  remotes: ChainName[],
): Promise<HookConfig> {
  let lastConfig: HookConfig;
  const hookType = await select({
    message: 'Select hook type',
    choices: [
      {
        value: HookType.MERKLE_TREE,
        name: HookType.MERKLE_TREE,
        description:
          'Add messages to the incremental merkle tree on origin chain (needed for the merkleRootMultisigIsm on the remote chain)',
      },
      {
        value: HookType.PROTOCOL_FEE,
        name: HookType.PROTOCOL_FEE,
        description: 'Charge fees for each message dispatch from this chain',
      },
      {
        value: HookType.INTERCHAIN_GAS_PAYMASTER,
        name: HookType.INTERCHAIN_GAS_PAYMASTER,
        description:
          'Allow for payments for expected gas to be paid by the relayer while delivering on remote chain',
      },
      {
        value: HookType.AGGREGATION,
        name: HookType.AGGREGATION,
        description:
          'Aggregate multiple hooks into a single hook (e.g. merkle tree + IGP) which will be called in sequence',
      },
      {
        value: HookType.ROUTING,
        name: HookType.ROUTING,
        description:
          'Each destination domain can have its own hook configured via DomainRoutingHook',
      },
    ],
    pageSize: 10,
  });
  if (hookType === HookType.MERKLE_TREE) {
    lastConfig = { type: HookType.MERKLE_TREE };
  } else if (hookType === HookType.PROTOCOL_FEE) {
    lastConfig = await createProtocolFeeConfig(context, chain);
    // } else if (hookType === HookType.INTERCHAIN_GAS_PAYMASTER) {
    //   lastConfig = await createIGPConfig(remotes);
  } else if (hookType === HookType.AGGREGATION) {
    lastConfig = await createAggregationConfig(context, chain, remotes);
  } else if (hookType === HookType.ROUTING) {
    lastConfig = await createRoutingConfig(context, chain, remotes);
  } else {
    throw new Error(`Invalid hook type: ${hookType}`);
  }
  return lastConfig;
}

export async function createProtocolFeeConfig(
  context: CommandContext,
  chain: ChainName,
): Promise<HookConfig> {
  const owner = await input({
    message: 'Enter owner address for protocol fee hook',
  });
  const ownerAddress = normalizeAddressEvm(owner);
  let beneficiary;
  let sameAsOwner = false;
  sameAsOwner = await confirm({
    message: 'Use this same address for the beneficiary?',
  });
  if (sameAsOwner) {
    beneficiary = ownerAddress;
  } else {
    beneficiary = await input({
      message: 'Enter beneficiary address for protocol fee hook',
    });
  }
  const beneficiaryAddress = normalizeAddressEvm(beneficiary);
  // TODO: input in gwei, wei, etc
  const maxProtocolFee = toWei(
    await input({
      message: `Enter max protocol fee ${nativeTokenAndDecimals(
        context,
        chain,
      )} e.g. 1.0) for protocol fee hook`,
    }),
  );
  const protocolFee = toWei(
    await input({
      message: `Enter protocol fee in ${nativeTokenAndDecimals(
        context,
        chain,
      )} e.g. 0.01) for protocol fee hook`,
    }),
  );
  if (BigNumberJs(protocolFee).gt(maxProtocolFee)) {
    errorRed('Protocol fee cannot be greater than max protocol fee');
    throw new Error('Invalid protocol fee');
  }

  return {
    type: HookType.PROTOCOL_FEE,
    maxProtocolFee: maxProtocolFee.toString(),
    protocolFee: protocolFee.toString(),
    beneficiary: beneficiaryAddress,
    owner: ownerAddress,
  };
}

// TODO: make this usable
export async function createIGPConfig(
  remotes: ChainName[],
): Promise<HookConfig> {
  const owner = await input({
    message: 'Enter owner address for IGP hook',
  });
  const ownerAddress = normalizeAddressEvm(owner);
  let beneficiary, oracleKey;
  let sameAsOwner = false;
  sameAsOwner = await confirm({
    message: 'Use this same address for the beneficiary and gasOracleKey?',
  });
  if (sameAsOwner) {
    beneficiary = ownerAddress;
    oracleKey = ownerAddress;
  } else {
    beneficiary = await input({
      message: 'Enter beneficiary address for IGP hook',
    });
    oracleKey = await input({
      message: 'Enter gasOracleKey address for IGP hook',
    });
  }
  const beneficiaryAddress = normalizeAddressEvm(beneficiary);
  const oracleKeyAddress = normalizeAddressEvm(oracleKey);
  const overheads: ChainMap<number> = {};
  for (const chain of remotes) {
    const overhead = parseInt(
      await input({
        message: `Enter overhead for ${chain} (eg 75000) for IGP hook`,
      }),
    );
    overheads[chain] = overhead;
  }
  return {
    type: HookType.INTERCHAIN_GAS_PAYMASTER,
    beneficiary: beneficiaryAddress,
    owner: ownerAddress,
    oracleKey: oracleKeyAddress,
    overhead: overheads,
    oracleConfig: {},
  };
}

export async function createAggregationConfig(
  context: CommandContext,
  chain: ChainName,
  remotes: ChainName[],
): Promise<HookConfig> {
  const hooksNum = parseInt(
    await input({
      message: 'Enter the number of hooks to aggregate (number)',
    }),
    10,
  );
  const hooks: Array<HookConfig> = [];
  for (let i = 0; i < hooksNum; i++) {
    logBlue(`Creating hook ${i + 1} of ${hooksNum} ...`);
    hooks.push(await createHookConfig(context, chain, remotes));
  }
  return {
    type: HookType.AGGREGATION,
    hooks,
  };
}

export async function createRoutingConfig(
  context: CommandContext,
  origin: ChainName,
  remotes: ChainName[],
): Promise<HookConfig> {
  const owner = await input({
    message: 'Enter owner address for routing ISM',
  });
  const ownerAddress = owner;

  const domainsMap: ChainMap<HookConfig> = {};
  for (const chain of remotes) {
    await confirm({
      message: `You are about to configure hook for remote chain ${chain}. Continue?`,
    });
    const config = await createHookConfig(context, origin, remotes);
    domainsMap[chain] = config;
  }
  return {
    type: HookType.ROUTING,
    owner: ownerAddress,
    domains: domainsMap,
  };
}

function nativeTokenAndDecimals(context: CommandContext, chain: ChainName) {
  return `10^${
    context.chainMetadata[chain].nativeToken?.decimals ?? '18'
  } which you cannot exceed (in ${
    context.chainMetadata[chain].nativeToken?.symbol ?? 'eth'
  }`;
}
