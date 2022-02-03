import { dev } from 'optics-multi-provider-community';
import { ethers } from 'ethers';
import { configPath, networks } from './agentConfig';
import { ViolationType } from '../../src/checks';
import { CoreInvariantChecker } from '../../src/core/checks';
import { makeCoreDeploys } from '../../src/core/CoreDeploy';
import { expectCalls, GovernanceCallBatchBuilder } from '../../src/core/govern';

const deploys = makeCoreDeploys(
  configPath,
  networks,
  (_) => _.chain,
  (_) => _.devConfig,
);

async function main() {
  dev.registerRpcProvider('alfajores', process.env.ALFAJORES_RPC!);
  dev.registerRpcProvider('gorli', process.env.GORLI_RPC!);
  dev.registerRpcProvider('kovan', process.env.KOVAN_RPC!);
  dev.registerRpcProvider('mumbai', process.env.MUMBAI_RPC!);
  dev.registerRpcProvider('fuji', process.env.FUJI_RPC!);
  dev.registerSigner(
    'alfajores',
    new ethers.Wallet(process.env.ALFAJORES_DEPLOYER_KEY!),
  );

  const checker = new CoreInvariantChecker(deploys);
  await checker.checkDeploys();
  checker.expectViolations(
    [ViolationType.ReplicaUpdater, ViolationType.HomeUpdater],
    [4, 1],
  );
  const builder = new GovernanceCallBatchBuilder(
    deploys,
    dev,
    checker.violations,
  );
  const batch = await builder.build();

  await batch.build();
  const domains = deploys.map((deploy) => deploy.chain.domain);
  // For each domain, expect one call to set the updater.
  expectCalls(batch, domains, new Array(5).fill(1));
  // Change to `batch.execute` in order to run.
  const receipts = await batch.estimateGas();
  console.log(receipts);
}
main().then(console.log).catch(console.error);
