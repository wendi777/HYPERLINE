import { types } from '@hyperlane-xyz/utils';

import { MultiProvider } from '../providers/MultiProvider';
import { getProxyAddress } from '../proxy';
import { ChainMap, ChainName } from '../types';

export type AgentSigner = {
  key: string;
  type: string; // TODO
};

export enum AgentConnectionType {
  Http = 'http',
  Ws = 'ws',
  HttpQuorum = 'httpQuorum',
  HttpFallback = 'httpFallback',
}

export type AgentConnection =
  | {
      type: AgentConnectionType.Http;
      url: string;
    }
  | { type: AgentConnectionType.Ws; url: string }
  | { type: AgentConnectionType.HttpQuorum; urls: string };

export type HyperlaneAgentAddresses = {
  mailbox: types.Address;
  interchainGasPaymaster: types.Address;
  validatorAnnounce: types.Address;
};

export type AgentChainSetup = {
  name: ChainName;
  domain: number;
  signer?: AgentSigner | null;
  finalityBlocks: number;
  addresses: HyperlaneAgentAddresses;
  protocol: 'ethereum' | 'fuel';
  connection: AgentConnection;
  index?: { from: number };
};

export type AgentConfig = {
  chains: Partial<ChainMap<AgentChainSetup>>;
  // TODO: Separate DBs for each chain (fold into AgentChainSetup)
  db: string;
  tracing: {
    level: string;
    fmt: 'json';
  };
};

export function buildAgentConfig(
  chains: ChainName[],
  multiProvider: MultiProvider,
  addresses: ChainMap<HyperlaneAgentAddresses>,
  startBlocks: ChainMap<number>,
): AgentConfig {
  const agentConfig: AgentConfig = {
    chains: {},
    db: 'db_path',
    tracing: {
      level: 'debug',
      fmt: 'json',
    },
  };

  for (const chain of chains.sort()) {
    const metadata = multiProvider.getChainMetadata(chain);
    const chainConfig: AgentChainSetup = {
      name: chain,
      domain: metadata.chainId,
      addresses: {
        mailbox: getProxyAddress(addresses[chain].mailbox),
        interchainGasPaymaster: getProxyAddress(
          addresses[chain].interchainGasPaymaster,
        ),
        validatorAnnounce: getProxyAddress(addresses[chain].validatorAnnounce),
      },
      signer: null,
      protocol: 'ethereum',
      finalityBlocks:
        metadata.blocks && metadata.blocks.reorgPeriod
          ? metadata.blocks.reorgPeriod
          : 1,
      connection: {
        type: AgentConnectionType.Http,
        url: '',
      },
    };

    chainConfig.index = {
      from: startBlocks[chain],
    };

    agentConfig.chains[chain] = chainConfig;
  }
  return agentConfig;
}
