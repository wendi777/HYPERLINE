import { CoreDeploy } from '../../src/core/CoreDeploy';
import { ImplementationDeployer } from '../../src/core/implementation';
import { core } from '../../config/environments/dev/core';
import { chains } from '../../config/environments/dev/chains';

const environment = 'dev';
const directory = `../../config/environments/${environment}/contracts`;
const coreDeploys = chains.map((c) => CoreDeploy.fromDirectory(directory, c, core))

async function main() {
  const deployer = new ImplementationDeployer(coreDeploys);
  await deployer.deployReplicaImplementations();
  deployer.writeDeploys(environment);
}
main().then(console.log).catch(console.error);
