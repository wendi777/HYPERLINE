import * as proxyUtils from '../utils/proxy';
import { BridgeInvariantChecker } from './checks';
import * as xAppContracts from '@abacus-network/ts-interface/dist/abacus-xapps';
import { toBytes32 } from '../utils/utils';
import { BridgeDeploy } from './BridgeDeploy';
import assert from 'assert';

export type BridgeDeployOutput = {
  bridgeRouter?: string;
};

/**
 * Deploy and configure a cross-chain token bridge system
 * with one BridgeRouter on each of the provided chains
 * with ownership delegated to Abacus governance
 *
 * @param deploys - The list of deploy instances for each chain
 */
export async function deployBridges(deploys: BridgeDeploy[]) {
  const isTestDeploy: boolean = deploys.filter((c) => c.test).length > 0;

  // deploy BridgeTokens & BridgeRouters
  await Promise.all(
    deploys.map(async (deploy) => {
      // Must be done in order per-deploy.
      // Do not rearrange or parallelize.
      await deployTokenUpgradeBeacon(deploy);
      await deployBridgeRouter(deploy);
      await deployEthHelper(deploy);
    }),
  );

  // after all BridgeRouters have been deployed,
  // enroll peer BridgeRouters with each other
  await Promise.all(
    deploys.map(async (deploy) => {
      await enrollAllBridgeRouters(deploy, deploys);
    }),
  );

  // after all peer BridgeRouters have been co-enrolled,
  // transfer ownership of BridgeRouters to Governance
  await Promise.all(
    deploys.map(async (deploy) => {
      await transferOwnershipToGovernance(deploy);
    }),
  );

  const checker = new BridgeInvariantChecker(deploys);
  await checker.checkDeploys();
  checker.expectEmpty();

  if (!isTestDeploy) {
    // output the Bridge deploy information to a subdirectory
    // of the core system deploy config folder
    deploys.map((d) => d.writeOutput());
  }
}

/**
 * Deploys the BridgeToken implementation + upgrade beacon
 * on the chain of the given deploy
 * and updates the deploy instance with the new contracts.
 *
 * @param deploy - The deploy instance
 */
export async function deployTokenUpgradeBeacon(deploy: BridgeDeploy) {
  console.log(`deploying ${deploy.chain.name} Token Upgrade Beacon`);

  // no initialize function called
  const initData = '0x';

  deploy.contracts.bridgeToken =
    await proxyUtils.deployProxy<xAppContracts.BridgeToken>(
      'BridgeToken',
      deploy,
      new xAppContracts.BridgeToken__factory(deploy.chain.signer),
      initData,
    );

  console.log(`deployed ${deploy.chain.name} Token Upgrade Beacon`);
}

/**
 * Deploys the BridgeRouter on the chain of the given deploy and updates
 * the deploy instance with the new contract.
 *
 * @param deploy - The deploy instance
 */
export async function deployBridgeRouter(deploy: BridgeDeploy) {
  console.log(`deploying ${deploy.chain.name} BridgeRouter`);

  const initData =
    xAppContracts.BridgeRouter__factory.createInterface().encodeFunctionData(
      'initialize',
      [
        deploy.contracts.bridgeToken!.beacon.address,
        deploy.coreContractAddresses.xAppConnectionManager,
      ],
    );

  deploy.contracts.bridgeRouter =
    await proxyUtils.deployProxy<xAppContracts.BridgeRouter>(
      'BridgeRouter',
      deploy,
      new xAppContracts.BridgeRouter__factory(deploy.chain.signer),
      initData,
    );

  assert(
    (await deploy.contracts.bridgeRouter!.proxy.xAppConnectionManager()) ===
      deploy.coreContractAddresses.xAppConnectionManager,
  );
  assert(
    (await deploy.contracts.bridgeRouter!.proxy.tokenBeacon()) ===
      deploy.contracts.bridgeToken!.beacon.address,
  );

  console.log(`deployed ${deploy.chain.name} BridgeRouter`);
}

/**
 * Deploy the Eth Helper contract if configured.
 *
 * Chains with no WETH configuration will not have an eth helper contract.
 *
 * @param deploy - The deploy instance for the chain on which to deploy the contract
 */
export async function deployEthHelper(deploy: BridgeDeploy) {
  if (!deploy.chain.weth) {
    console.log(`skipping ${deploy.chain.name} EthHelper deploy`);
    return;
  }

  console.log(`deploying ${deploy.chain.name} EthHelper`);

  const factory = new xAppContracts.ETHHelper__factory(deploy.chain.signer);

  deploy.contracts.ethHelper = await factory.deploy(
    deploy.chain.weth!,
    deploy.contracts.bridgeRouter?.proxy.address!,
    deploy.overrides,
  );

  await deploy.contracts.ethHelper.deployTransaction.wait(
    deploy.chain.confirmations,
  );
  deploy.verificationInput.push({
    name: `ETH Helper`,
    address: deploy.contracts.ethHelper.address,
    constructorArguments: [
      deploy.chain.weth!,
      deploy.contracts.bridgeRouter?.proxy.address!,
    ],
  });
  console.log(`deployed ${deploy.chain.name} EthHelper`);
}

/**
 * Enroll all other chains' BridgeRouters as remote routers
 * to a single chain's BridgeRouter
 *
 * @param deploy - The deploy instance for the chain on which to enroll routers
 * @param allDeploys - Array of all deploy instances for the Bridge deploy
 */
export async function enrollAllBridgeRouters(
  deploy: BridgeDeploy,
  allDeploys: BridgeDeploy[],
) {
  for (let remoteDeploy of allDeploys) {
    if (deploy.chain.domain != remoteDeploy.chain.domain) {
      await enrollBridgeRouter(deploy, remoteDeploy);
    }
  }
}

/**
 * Enroll a single chain's BridgeRouter as remote routers
 * on a single chain's BridgeRouter
 *
 * @param local - The deploy instance for the chain on which to enroll the router
 * @param remote - The deploy instance for the chain to enroll on the local router
 */
export async function enrollBridgeRouter(
  local: BridgeDeploy,
  remote: BridgeDeploy,
) {
  console.log(
    `enrolling ${remote.chain.name} BridgeRouter on ${local.chain.name}`,
  );

  let tx = await local.contracts.bridgeRouter!.proxy.enrollRemoteRouter(
    remote.chain.domain,
    toBytes32(remote.contracts.bridgeRouter!.proxy.address),
    local.overrides,
  );

  await tx.wait(local.chain.confirmations);

  console.log(
    `enrolled ${remote.chain.name} BridgeRouter on ${local.chain.name}`,
  );
}

/**
 * Transfer Ownership of a chain's BridgeRouter
 * to its GovernanceRouter
 *
 * @param deploy - The deploy instance for the chain
 */
export async function transferOwnershipToGovernance(deploy: BridgeDeploy) {
  console.log(`transfer ownership of ${deploy.chain.name} BridgeRouter`);

  let tx = await deploy.contracts.bridgeRouter!.proxy.transferOwnership(
    deploy.coreContractAddresses.governanceRouter.proxy,
    deploy.overrides,
  );

  await tx.wait(deploy.chain.confirmations);

  console.log(`transferred ownership of ${deploy.chain.name} BridgeRouter`);
}
