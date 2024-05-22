import { BigNumber, ethers } from 'ethers';

import {
  DomainRoutingIsm__factory,
  IAggregationIsm__factory,
  IInterchainSecurityModule__factory,
  IMultisigIsm__factory,
  IRoutingIsm__factory,
  MailboxClient__factory,
  OPStackIsm__factory,
  PausableIsm__factory,
  StaticAggregationIsm__factory,
  TrustedRelayerIsm__factory,
} from '@hyperlane-xyz/core';
import {
  Address,
  eqAddress,
  formatMessage,
  normalizeAddress,
  objMap,
  rootLogger,
} from '@hyperlane-xyz/utils';

import { HyperlaneContracts } from '../contracts/types.js';
import { ProxyFactoryFactories } from '../deploy/contracts.js';
import { MultiProvider } from '../providers/MultiProvider.js';
import { ChainName } from '../types.js';

import {
  AggregationIsmConfig,
  IsmConfig,
  IsmType,
  ModuleType,
  MultisigIsmConfig,
  OpStackIsmConfig,
  PausableIsmConfig,
  RoutingIsmConfig,
  RoutingIsmDelta,
  TrustedRelayerIsmConfig,
  ismTypeToModuleType,
} from './types.js';

const logger = rootLogger.child({ module: 'IsmUtils' });

// Note that this function may return false negatives, but should
// not return false positives.
// This can happen if, for example, the module has sender, recipient, or
// body specific logic, as the sample message used when querying the ISM
// sets all of these to zero.
export async function moduleCanCertainlyVerify(
  destModule: Address | IsmConfig,
  multiProvider: MultiProvider,
  origin: ChainName,
  destination: ChainName,
): Promise<boolean> {
  const originDomainId = multiProvider.tryGetDomainId(origin);
  const destinationDomainId = multiProvider.tryGetDomainId(destination);
  if (!originDomainId || !destinationDomainId) {
    return false;
  }
  const message = formatMessage(
    0,
    0,
    originDomainId,
    ethers.constants.AddressZero,
    destinationDomainId,
    ethers.constants.AddressZero,
    '0x',
  );
  const provider = multiProvider.getSignerOrProvider(destination);

  if (typeof destModule === 'string') {
    const module = IInterchainSecurityModule__factory.connect(
      destModule,
      provider,
    );

    try {
      const moduleType = await module.moduleType();
      if (
        moduleType === ModuleType.MERKLE_ROOT_MULTISIG ||
        moduleType === ModuleType.MESSAGE_ID_MULTISIG
      ) {
        const multisigModule = IMultisigIsm__factory.connect(
          destModule,
          provider,
        );

        const [, threshold] = await multisigModule.validatorsAndThreshold(
          message,
        );
        return threshold > 0;
      } else if (moduleType === ModuleType.ROUTING) {
        const routingIsm = IRoutingIsm__factory.connect(destModule, provider);
        const subModule = await routingIsm.route(message);
        return moduleCanCertainlyVerify(
          subModule,
          multiProvider,
          origin,
          destination,
        );
      } else if (moduleType === ModuleType.AGGREGATION) {
        const aggregationIsm = IAggregationIsm__factory.connect(
          destModule,
          provider,
        );
        const [subModules, threshold] =
          await aggregationIsm.modulesAndThreshold(message);
        let verified = 0;
        for (const subModule of subModules) {
          const canVerify = await moduleCanCertainlyVerify(
            subModule,
            multiProvider,
            origin,
            destination,
          );
          if (canVerify) {
            verified += 1;
          }
        }
        return verified >= threshold;
      } else {
        throw new Error(`Unsupported module type: ${moduleType}`);
      }
    } catch (err) {
      logger.error(`Error checking module ${destModule}`, err);
      return false;
    }
  } else {
    // destModule is an IsmConfig
    switch (destModule.type) {
      case IsmType.MERKLE_ROOT_MULTISIG:
      case IsmType.MESSAGE_ID_MULTISIG:
        return destModule.threshold > 0;
      case IsmType.ROUTING: {
        const checking = moduleCanCertainlyVerify(
          destModule.domains[destination],
          multiProvider,
          origin,
          destination,
        );
        return checking;
      }
      case IsmType.AGGREGATION: {
        let verified = 0;
        for (const subModule of destModule.modules) {
          const canVerify = await moduleCanCertainlyVerify(
            subModule,
            multiProvider,
            origin,
            destination,
          );
          if (canVerify) {
            verified += 1;
          }
        }
        return verified >= destModule.threshold;
      }
      case IsmType.OP_STACK:
        return destModule.nativeBridge !== ethers.constants.AddressZero;
      case IsmType.TEST_ISM: {
        return true;
      }
      default:
        throw new Error(`Unsupported module type: ${(destModule as any).type}`);
    }
  }
}

/**
 * Performs a deep equality check for two IsmConfig objects.
 */
export function deepEqualIsmConfig(
  config1: IsmConfig,
  config2: IsmConfig,
): boolean {
  // If the configs are different types, they are not equal
  if (typeof config1 !== typeof config2) {
    return false;
  }

  // If the configs are strings, compare them directly
  if (typeof config1 === 'string' && typeof config2 === 'string') {
    return eqAddress(config1, config2);
  }

  // If the configs are objects, compare them based on their type
  if (typeof config1 === 'object' && typeof config2 === 'object') {
    // If the configs are not the same type, they are not equal
    if (config1.type !== config2.type) {
      return false;
    }

    // If the configs are the same type, compare them based on their type
    switch (config1.type) {
      case IsmType.MERKLE_ROOT_MULTISIG:
      case IsmType.MESSAGE_ID_MULTISIG: {
        const multisig1 = config1 as MultisigIsmConfig;
        const multisig2 = config2 as MultisigIsmConfig;
        const sortedMultisig1Validators = [...multisig1.validators].sort(
          (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        const sortedMultisig2Validators = [...multisig2.validators].sort(
          (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        return (
          multisig1.threshold === multisig2.threshold &&
          sortedMultisig1Validators.length ===
            sortedMultisig2Validators.length &&
          sortedMultisig1Validators.every(
            (val, idx) => val === sortedMultisig2Validators[idx],
          )
        );
      }

      case IsmType.TEST_ISM:
        return true;

      case IsmType.PAUSABLE: {
        const pausable1 = config1 as PausableIsmConfig;
        const pausable2 = config2 as PausableIsmConfig;
        return (
          pausable1.paused === pausable2.paused &&
          eqAddress(
            extractOwnerAddress(pausable1.owner),
            extractOwnerAddress(pausable2.owner),
          )
        );
      }

      case IsmType.ROUTING:
      case IsmType.FALLBACK_ROUTING: {
        const routing1 = config1 as RoutingIsmConfig;
        const routing2 = config2 as RoutingIsmConfig;
        return (
          eqAddress(
            extractOwnerAddress(routing1.owner),
            extractOwnerAddress(routing2.owner),
          ) &&
          Object.keys(routing1.domains).length ===
            Object.keys(routing2.domains).length &&
          Object.keys(routing1.domains).every((key) =>
            deepEqualIsmConfig(routing1.domains[key], routing2.domains[key]),
          )
        );
      }

      case IsmType.AGGREGATION: {
        const aggregation1 = config1 as AggregationIsmConfig;
        const aggregation2 = config2 as AggregationIsmConfig;
        if (
          aggregation1.threshold !== aggregation2.threshold ||
          aggregation1.modules.length !== aggregation2.modules.length
        ) {
          return false;
        }

        const unmatchedConfigModules = new Set(aggregation2.modules);
        for (const subModule of aggregation1.modules) {
          let foundMatch = false;
          for (const configModule of unmatchedConfigModules) {
            if (deepEqualIsmConfig(subModule, configModule)) {
              foundMatch = true;
              unmatchedConfigModules.delete(configModule);
              break;
            }
          }
          if (!foundMatch) {
            return false;
          }
        }
        return true;
      }

      case IsmType.OP_STACK: {
        const opStack1 = config1 as OpStackIsmConfig;
        const opStack2 = config2 as OpStackIsmConfig;
        return (
          eqAddress(opStack1.origin, opStack2.origin) &&
          eqAddress(opStack1.nativeBridge, opStack2.nativeBridge)
        );
      }

      case IsmType.TRUSTED_RELAYER: {
        const trustedRelayer1 = config1 as TrustedRelayerIsmConfig;
        const trustedRelayer2 = config2 as TrustedRelayerIsmConfig;
        return eqAddress(trustedRelayer1.relayer, trustedRelayer2.relayer);
      }
    }
  }

  return false;
}

export async function moduleMatchesConfig(
  chain: ChainName,
  moduleAddress: Address,
  config: IsmConfig,
  multiProvider: MultiProvider,
  contracts: HyperlaneContracts<ProxyFactoryFactories>,
  mailbox?: Address,
  // Less stringent checks on Routing/Pausable ISMs if not configured yet
  configured = true,
): Promise<boolean> {
  // Handle custom ISM addresses
  if (typeof config === 'string') {
    return eqAddress(moduleAddress, config);
  }

  // Handle undefined domains
  if (!config || !config.type) {
    return false;
  }

  // If the module address is zero, it can't match any object-based config.
  // The subsequent check of what moduleType it is will throw, so we fail here.
  if (eqAddress(moduleAddress, ethers.constants.AddressZero)) {
    return false;
  }

  const provider = multiProvider.getProvider(chain);
  const module = IInterchainSecurityModule__factory.connect(
    moduleAddress,
    provider,
  );
  const actualType = await module.moduleType();
  if (actualType !== ismTypeToModuleType(config.type)) return false;
  let matches = true;
  switch (config.type) {
    case IsmType.MERKLE_ROOT_MULTISIG: {
      // A MerkleRootMultisigIsm matches if validators and threshold match the config
      const expectedAddress =
        await contracts.staticMerkleRootMultisigIsmFactory.getAddress(
          [...config.validators].sort(),
          config.threshold,
        );
      matches = eqAddress(expectedAddress, module.address);
      break;
    }
    case IsmType.MESSAGE_ID_MULTISIG: {
      // A MessageIdMultisigIsm matches if validators and threshold match the config
      const expectedAddress =
        await contracts.staticMessageIdMultisigIsmFactory.getAddress(
          [...config.validators].sort(),
          config.threshold,
        );
      matches = eqAddress(expectedAddress, module.address);
      break;
    }
    case IsmType.FALLBACK_ROUTING:
    case IsmType.ROUTING: {
      // A RoutingIsm matches if:
      //   1. The set of domains in the config equals those on-chain
      //   2. The modules for each domain match the config
      // TODO: Check (1)
      const routingIsm = DomainRoutingIsm__factory.connect(
        moduleAddress,
        provider,
      );

      // if fallback routing, check that mailbox matches
      if (config.type === IsmType.FALLBACK_ROUTING) {
        const client = MailboxClient__factory.connect(moduleAddress, provider);
        const mailboxAddress = await client.mailbox();
        matches &&= mailbox !== undefined && eqAddress(mailboxAddress, mailbox);
      }

      // Check that the RoutingISM owner matches the config
      const owner = await routingIsm.owner();
      const expectedOwner = config.owner;
      matches &&= eqAddress(owner, expectedOwner);
      // check if the mailbox matches the config for fallback routing
      if (config.type === IsmType.FALLBACK_ROUTING) {
        const client = MailboxClient__factory.connect(moduleAddress, provider);
        const mailboxAddress = await client.mailbox();
        matches =
          matches &&
          mailbox !== undefined &&
          eqAddress(mailboxAddress, mailbox);
      }
      break;
    }
    case IsmType.AGGREGATION: {
      // An AggregationIsm matches if:
      //   1. The threshold matches the config
      //   2. There is a bijection between on and off-chain configured modules
      const aggregationIsm = StaticAggregationIsm__factory.connect(
        moduleAddress,
        provider,
      );
      const [subModules, threshold] = await aggregationIsm.modulesAndThreshold(
        '0x',
      );
      matches &&= threshold === config.threshold;
      matches &&= subModules.length === config.modules.length;

      const unmatchedConfigModules = new Set(config.modules);
      const subModulePromises = subModules.map(async (subModule) => {
        let foundMatch = false;
        for (const configModule of unmatchedConfigModules) {
          const subModuleMatchesConfig = await moduleMatchesConfig(
            chain,
            subModule,
            configModule,
            multiProvider,
            contracts,
            mailbox,
            configured,
          );
          if (subModuleMatchesConfig) {
            foundMatch = true;
            unmatchedConfigModules.delete(configModule);
            break;
          }
        }
        return foundMatch;
      });

      const subModuleResults = await Promise.all(subModulePromises);
      matches &&= subModuleResults.every((result) => result);

      break;
    }
    case IsmType.OP_STACK: {
      const opStackIsm = OPStackIsm__factory.connect(moduleAddress, provider);
      const type = await opStackIsm.moduleType();
      matches &&= type === ModuleType.NULL;
      break;
    }
    case IsmType.TEST_ISM: {
      // This is just a TestISM
      matches = true;
      break;
    }
    case IsmType.TRUSTED_RELAYER: {
      const trustedRelayerIsm = TrustedRelayerIsm__factory.connect(
        moduleAddress,
        provider,
      );
      const type = await trustedRelayerIsm.moduleType();
      matches &&= type === ModuleType.NULL;
      const relayer = await trustedRelayerIsm.trustedRelayer();
      matches &&= eqAddress(relayer, config.relayer);
      break;
    }
    case IsmType.PAUSABLE: {
      const pausableIsm = PausableIsm__factory.connect(moduleAddress, provider);

      const owner = await pausableIsm.owner();
      const expectedOwner = config.owner;
      matches &&= eqAddress(owner, expectedOwner);

      if (config.paused) {
        const isPaused = await pausableIsm.paused();
        matches &&= config.paused === isPaused;
      }
      break;
    }
    default: {
      throw new Error('Unsupported ModuleType');
    }
  }

  return matches;
}

// calls moduleMatchesConfig for each domain in the routing ISM
export async function routingModuleDelta(
  destination: ChainName,
  moduleAddress: Address,
  config: RoutingIsmConfig,
  multiProvider: MultiProvider,
  contracts: HyperlaneContracts<ProxyFactoryFactories>,
  mailbox?: Address,
): Promise<RoutingIsmDelta> {
  const provider = multiProvider.getProvider(destination);
  const routingIsm = DomainRoutingIsm__factory.connect(moduleAddress, provider);
  const owner = await routingIsm.owner();
  const deployedDomains = (await routingIsm.domains()).map((domain) =>
    domain.toNumber(),
  );
  // config.domains is already filtered to only include domains in the multiprovider
  const availableDomains = objMap(config.domains, (chainName) =>
    multiProvider.getDomainId(chainName),
  );

  const delta: RoutingIsmDelta = {
    domainsToUnenroll: [],
    domainsToEnroll: [],
  };

  // if owners don't match, we need to transfer ownership
  const expectedOwner = config.owner;
  if (!eqAddress(owner, normalizeAddress(expectedOwner)))
    delta.owner = expectedOwner;
  }

  // if fallback routing, check that mailbox matches
  if (config.type === IsmType.FALLBACK_ROUTING) {
    const client = MailboxClient__factory.connect(moduleAddress, provider);
    const mailboxAddress = await client.mailbox();
    if (mailbox && !eqAddress(mailboxAddress, mailbox)) delta.mailbox = mailbox;
  }

  // check for exclusion of domains in the config
  delta.domainsToUnenroll = deployedDomains.filter(
    (domain) => !Object.values(availableDomains).includes(domain),
  );

  // check for inclusion of domains in the config
  for (const [origin, subConfig] of Object.entries(config.domains)) {
    const originDomain = availableDomains[origin];
    if (!deployedDomains.includes(originDomain)) {
      delta.domainsToEnroll.push(originDomain);
    } else {
      const subModule = await routingIsm.module(originDomain);
      // Recursively check that the submodule for each configured
      // domain matches the submodule config.
      const subModuleMatches = await moduleMatchesConfig(
        destination,
        subModule,
        subConfig,
        multiProvider,
        contracts,
        mailbox,
      );
      if (!subModuleMatches) delta.domainsToEnroll.push(originDomain);
    }
  }
  return delta;
}

export function collectValidators(
  origin: ChainName,
  config: IsmConfig,
): Set<string> {
  // TODO: support address configurations in collectValidators
  if (typeof config === 'string') {
    logger
      .child({ origin })
      .debug('Address config unimplemented in collectValidators');
    return new Set([]);
  }

  let validators: string[] = [];
  if (
    config.type === IsmType.MERKLE_ROOT_MULTISIG ||
    config.type === IsmType.MESSAGE_ID_MULTISIG
  ) {
    validators = config.validators;
  } else if (config.type === IsmType.ROUTING) {
    if (Object.keys(config.domains).includes(origin)) {
      const domainValidators = collectValidators(
        origin,
        config.domains[origin],
      );
      validators = [...domainValidators];
    }
  } else if (config.type === IsmType.AGGREGATION) {
    const aggregatedValidators = config.modules.map((c) =>
      collectValidators(origin, c),
    );
    aggregatedValidators.forEach((set) => {
      validators = validators.concat([...set]);
    });
  } else if (
    config.type === IsmType.TEST_ISM ||
    config.type === IsmType.PAUSABLE
  ) {
    return new Set([]);
  } else {
    throw new Error('Unsupported ModuleType');
  }

  return new Set(validators);
}
