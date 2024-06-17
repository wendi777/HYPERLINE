import { input, select } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';

import {
  ChainMap,
  IsmConfig,
  IsmType,
  MailboxClientConfig,
  TokenType,
  WarpCoreConfig,
  WarpCoreConfigSchema,
  WarpRouteDeployConfig,
  WarpRouteDeployConfigSchema,
} from '@hyperlane-xyz/sdk';
import { Address, assert, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { CommandContext } from '../context/types.js';
import { errorRed, log, logBlue, logGreen } from '../logger.js';
import {
  detectAndConfirmOrPrompt,
  runMultiChainSelectionStep,
} from '../utils/chains.js';
import {
  indentYamlOrJson,
  readYamlOrJson,
  writeYamlOrJson,
} from '../utils/files.js';

import { createAdvancedIsmConfig } from './ism.js';

const TYPE_DESCRIPTIONS: Record<TokenType, string> = {
  [TokenType.synthetic]: 'A new ERC20 with remote transfer functionality',
  [TokenType.collateral]:
    'Extends an existing ERC20 with remote transfer functionality',
  [TokenType.native]:
    'Extends the native token with remote transfer functionality',
  [TokenType.collateralVault]:
    'Extends an existing ERC4626 with remote transfer functionality',
  [TokenType.collateralFiat]:
    'Extends an existing FiatToken with remote transfer functionality',
  [TokenType.XERC20]:
    'Extends an existing xERC20 with Warp Route functionality',
  [TokenType.XERC20Lockbox]:
    'Extends an existing xERC20 Lockbox with Warp Route functionality',
  // TODO: describe
  [TokenType.fastSynthetic]: '',
  [TokenType.syntheticUri]: '',
  [TokenType.fastCollateral]: '',
  [TokenType.collateralUri]: '',
  [TokenType.nativeScaled]: '',
};

const TYPE_CHOICES = Object.values(TokenType).map((type) => ({
  name: type,
  value: type,
  description: TYPE_DESCRIPTIONS[type],
}));

async function fillDefaults(
  context: CommandContext,
  config: ChainMap<Partial<MailboxClientConfig>>,
): Promise<ChainMap<MailboxClientConfig>> {
  return promiseObjAll(
    objMap(config, async (chain, config): Promise<MailboxClientConfig> => {
      let mailbox = config.mailbox;
      if (!mailbox) {
        const addresses = await context.registry.getChainAddresses(chain);
        assert(addresses, `No addresses found for chain ${chain}`);
        mailbox = addresses.mailbox;
      }
      let owner = config.owner;
      if (!owner) {
        owner =
          (await context.signer?.getAddress()) ??
          (await context.multiProvider.getSignerAddress(chain));
      }
      return {
        owner,
        mailbox,
        ...config,
      };
    }),
  );
}

export async function readWarpRouteDeployConfig(
  filePath: string,
  context?: CommandContext,
): Promise<WarpRouteDeployConfig> {
  let config = readYamlOrJson(filePath);
  if (!config)
    throw new Error(`No warp route deploy config found at ${filePath}`);
  if (context) {
    config = await fillDefaults(context, config as any);
  }
  return WarpRouteDeployConfigSchema.parse(config);
}

export function isValidWarpRouteDeployConfig(config: any) {
  return WarpRouteDeployConfigSchema.safeParse(config).success;
}

export async function createWarpRouteDeployConfig({
  context,
  outPath,
  advanced = false,
}: {
  context: CommandContext;
  outPath: string;
  advanced: boolean;
}) {
  logBlue('Creating a new warp route deployment config...');

  const owner = await detectAndConfirmOrPrompt(
    async () => context.signer?.getAddress(),
    'Enter the desired',
    'owner address',
    'signer',
  );

  const warpChains = await runMultiChainSelectionStep(
    context.chainMetadata,
    'Select chains to connect',
  );

  const result: WarpRouteDeployConfig = {};
  for (const chain of warpChains) {
    logBlue(`Configuring warp route for chain ${chain}`);
    const type = await select({
      message: `Select ${chain}'s token type`,
      choices: TYPE_CHOICES,
    });

    // TODO: restore NFT prompting
    const isNft =
      type === TokenType.syntheticUri || type === TokenType.collateralUri;

    const mailbox = await detectAndConfirmOrPrompt(
      async () => {
        const addresses = await context.registry.getChainAddresses(chain);
        return addresses?.mailbox;
      },
      `For ${chain}, enter the`,
      'mailbox address',
      'hyperlane-registry',
    );

    const interchainSecurityModule = advanced
      ? await createAdvancedIsmConfig(context)
      : createDefaultWarpIsmConfig(owner);

    switch (type) {
      case TokenType.collateral:
      case TokenType.XERC20:
      case TokenType.XERC20Lockbox:
      case TokenType.collateralFiat:
      case TokenType.collateralUri:
      case TokenType.fastCollateral:
      case TokenType.collateralVault:
        result[chain] = {
          mailbox,
          type,
          owner,
          isNft,
          interchainSecurityModule,
          token: await input({
            message: `Enter the existing token address on chain ${chain}`,
          }),
        };
        break;
      default:
        result[chain] = {
          mailbox,
          type,
          owner,
          isNft,
          interchainSecurityModule,
        };
    }
  }

  try {
    const warpRouteDeployConfig = WarpRouteDeployConfigSchema.parse(result);
    logBlue(`Warp Route config is valid, writing to file ${outPath}:\n`);
    log(indentYamlOrJson(yamlStringify(warpRouteDeployConfig, null, 2), 4));
    writeYamlOrJson(outPath, warpRouteDeployConfig, 'yaml');
    logGreen('✅ Successfully created new warp route deployment config.');
  } catch (e) {
    errorRed(
      `Warp route deployment config is invalid, please see https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/cli/examples/warp-route-deployment.yaml for an example.`,
    );
    throw e;
  }
}

// Note, this is different than the function above which reads a config
// for a DEPLOYMENT. This gets a config for using a warp route (aka WarpCoreConfig)
export function readWarpRouteConfig(filePath: string): WarpCoreConfig {
  const config = readYamlOrJson(filePath);
  if (!config) throw new Error(`No warp route config found at ${filePath}`);
  return WarpCoreConfigSchema.parse(config);
}

/**
 * Creates a default configuration for an ISM with a TRUSTED_RELAYER and FALLBACK_ROUTING.
 *
 * Properties relayer and owner are both set as input owner.
 *
 * @param owner - The address of the owner of the ISM.
 * @returns The default Aggregation ISM configuration.
 */
function createDefaultWarpIsmConfig(owner: Address): IsmConfig {
  return {
    type: IsmType.AGGREGATION,
    modules: [
      {
        type: IsmType.TRUSTED_RELAYER,
        relayer: owner,
      },
      {
        type: IsmType.FALLBACK_ROUTING,
        domains: {},
        owner,
      },
    ],
    threshold: 1,
  };
}
