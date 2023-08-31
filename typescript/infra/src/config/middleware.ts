import { AgentConsensusType } from '@hyperlane-xyz/sdk';

import { DockerConfig } from './agent';

export interface LiquidityLayerRelayerConfig {
  docker: DockerConfig;
  namespace: string;
  // TODO(2214): rename to consensusType?
  connectionType: AgentConsensusType.Single | AgentConsensusType.Quorum;
  prometheusPushGateway: string;
}
