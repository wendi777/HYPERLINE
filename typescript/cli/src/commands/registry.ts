import { CommandModule } from 'yargs';

import { createAgentConfig } from '../config/agent.js';
import { CommandContext, CommandModuleWithContext } from '../context/types.js';
import { errorRed, log, logBlue, logGray, logTable } from '../logger.js';

import {
  chainTargetsCommandOption,
  outputFileCommandOption,
} from './options.js';
import { ChainType, ChainTypes } from './types.js';

/**
 * Parent command
 */
export const registryCommand: CommandModule = {
  command: 'registry',
  describe: 'View information about Hyperlane chains in a registry',
  builder: (yargs) =>
    yargs
      .command(listCommand)
      .command(addressesCommand)
      .command(createAgentConfigCommand)
      .version(false)
      .demandCommand(),
  handler: () => log('Command required'),
};

/**
 * List command
 */
const listCommand: CommandModuleWithContext<{ type: ChainType }> = {
  command: 'list',
  describe: 'List all chains included in a registry',
  builder: {
    type: {
      describe: 'Specify the type of chains',
      choices: ChainTypes,
    },
  },
  handler: async ({ type, context }) => {
    const logChainsForType = (type: ChainType) => {
      logBlue(`\nHyperlane ${type} chains:`);
      logGray('------------------------------');
      const chains = Object.values(context.chainMetadata).filter((c) => {
        if (type === 'mainnet') return !c.isTestnet;
        else return !!c.isTestnet;
      });
      const tableData = chains.reduce<any>((result, chain) => {
        const { chainId, displayName } = chain;
        result[chain.name] = {
          'Display Name': displayName,
          'Chain Id': chainId,
        };
        return result;
      }, {});
      logTable(tableData);
    };

    if (type) {
      logChainsForType(type);
    } else {
      logChainsForType('mainnet');
      logChainsForType('testnet');
    }
  },
};

/**
 * Addresses command
 */
const addressesCommand: CommandModuleWithContext<{ name: string }> = {
  command: 'addresses',
  describe: 'Display the addresses of core Hyperlane contracts',
  builder: {
    name: {
      type: 'string',
      description: 'Chain to display addresses for',
      alias: 'chain',
    },
  },
  handler: async ({ name, context }) => {
    if (name) {
      const result = await context.registry.getChainAddresses(name);
      logBlue('Hyperlane contract addresses for:', name);
      logGray('---------------------------------');
      log(JSON.stringify(result, null, 2));
    } else {
      const result = await context.registry.getAddresses();
      logBlue('Hyperlane contract addresses:');
      logGray('----------------------------------');
      log(JSON.stringify(result, null, 2));
    }
  },
};

/**
 * agent-config command
 */
const createAgentConfigCommand: CommandModuleWithContext<{
  chains?: string;
  out: string;
  skipPrompts: boolean;
}> = {
  command: 'agent-config',
  describe: 'Create a new agent config',
  builder: {
    chains: chainTargetsCommandOption,
    out: outputFileCommandOption(
      './configs/agent-config.json',
      false,
      'The path to output an agent config JSON file.',
    ),
    skipPrompts: {
      type: 'boolean',
      description: 'Skip user prompts',
      default: false,
    },
  },
  handler: async ({
    context,
    chains,
    out,
    skipPrompts,
  }: {
    context: CommandContext;
    chains?: string;
    out: string;
    skipPrompts: boolean;
  }) => {
    const { multiProvider } = context;

    let chainNames: string[] | undefined;
    if (chains) {
      chainNames = chains.split(',');
      const invalidChainNames = chainNames.filter(
        (chainName) => !multiProvider.hasChain(chainName),
      );
      if (invalidChainNames.length > 0) {
        errorRed(
          `❌ Invalid chain names: ${invalidChainNames
            .join(', ')
            .replace(/, $/, '')}`,
        );
        process.exit(1);
      }
    }

    await createAgentConfig({
      context,
      chains: chainNames,
      out,
      skipPrompts,
    });
    process.exit(0);
  },
};
