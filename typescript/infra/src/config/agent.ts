import { types } from '@abacus-network/utils';
import { ChainName } from '@abacus-network/sdk';
import { DeployEnvironment } from './environment';

interface IndexingConfig {
  from: number;
  chunk: number;
}

interface AwsConfig {
  region: string;
}

interface ProcessorConfig {
  indexOnly: string[];
  s3Bucket: string;
}

interface RelayerConfig {
  // How often a relayer should check for new signed checkpoints
  interval?: number;
}

interface ValidatorConfig {
  // How often an validator should check for new updates
  interval?: number;
  // How long an validator should wait for relevant state changes afterwords
  pause?: number;
  confirmations: number;
}

interface CheckpointerConfig {
  // Polling interval (in seconds)
  pollingInterval: number;
  // Minimum time between created checkpoints (in seconds)
  creationLatency: number;
}

export interface DockerConfig {
  repo: string;
  tag: string;
}

export interface AgentConfig {
  environment: DeployEnvironment;
  namespace: string;
  runEnv: string;
  docker: DockerConfig;
  index?: IndexingConfig;
  aws?: AwsConfig;
  processor?: ProcessorConfig;
  validator?: ValidatorConfig;
  relayer?: RelayerConfig;
  checkpointer?: CheckpointerConfig;
}

export type RustSigner = {
  key: string;
  type: string; // TODO
};

export type RustConnection = {
  type: string; // TODO
  url: string;
};

export type RustContractBlock = {
  address: types.Address;
  domain: string;
  name: ChainName;
  rpcStyle: string; // TODO
  connection: RustConnection;
};

export type RustConfig = {
  environment: DeployEnvironment;
  signers: Partial<Record<ChainName, RustSigner>>;
  // Agents have not yet been moved to use the Outbox/Inbox names.
  inboxes: Partial<Record<ChainName, RustContractBlock>>;
  outbox: RustContractBlock;
  tracing: {
    level: string;
    fmt: 'json';
  };
  db: string;
};
