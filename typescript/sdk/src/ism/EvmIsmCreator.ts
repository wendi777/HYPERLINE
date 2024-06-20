import { ethers } from 'ethers';
import { Logger } from 'pino';

import {
  ArbL2ToL1Ism__factory,
  DefaultFallbackRoutingIsm,
  DefaultFallbackRoutingIsm__factory,
  DomainRoutingIsm,
  DomainRoutingIsm__factory,
  IAggregationIsm,
  IAggregationIsm__factory,
  IInterchainSecurityModule__factory,
  IMultisigIsm,
  IMultisigIsm__factory,
  IRoutingIsm,
  OPStackIsm__factory,
  PausableIsm__factory,
  StaticAddressSetFactory,
  StaticThresholdAddressSetFactory,
  TestIsm__factory,
  TrustedRelayerIsm__factory,
} from '@hyperlane-xyz/core';
import {
  Address,
  Domain,
  assert,
  eqAddress,
  objFilter,
  rootLogger,
} from '@hyperlane-xyz/utils';

import { HyperlaneContracts } from '../contracts/types.js';
import { HyperlaneDeployer } from '../deploy/HyperlaneDeployer.js';
import { ProxyFactoryFactories } from '../deploy/contracts.js';
import { MultiProvider } from '../providers/MultiProvider.js';
import { ChainMap, ChainName } from '../types.js';

import {
  AggregationIsmConfig,
  DeployedIsm,
  DeployedIsmType,
  IsmConfig,
  IsmType,
  MultisigIsmConfig,
  RoutingIsmConfig,
  RoutingIsmDelta,
} from './types.js';
import { routingModuleDelta } from './utils.js';

export class EvmIsmCreator {
  protected readonly logger = rootLogger.child({ module: 'EvmIsmCreator' });

  constructor(
    protected readonly deployer: HyperlaneDeployer<any, any>,
    protected readonly multiProvider: MultiProvider,
    protected readonly factories: HyperlaneContracts<ProxyFactoryFactories>,
  ) {}

  async update<C extends IsmConfig>(params: {
    destination: ChainName;
    config: C;
    origin?: ChainName;
    mailbox?: Address;
    existingIsmAddress: Address;
  }): Promise<DeployedIsm> {
    const { destination, config, origin, mailbox, existingIsmAddress } = params;
    if (typeof config === 'string') {
      // @ts-ignore
      return IInterchainSecurityModule__factory.connect(
        config,
        this.multiProvider.getSignerOrProvider(destination),
      );
    }

    const ismType = config.type;
    const logger = this.logger.child({ destination, ismType });

    logger.debug(
      `Updating ${ismType} on ${destination} ${
        origin ? `(for verifying ${origin})` : ''
      }`,
    );

    let contract: DeployedIsmType[typeof ismType];
    switch (ismType) {
      case IsmType.ROUTING:
      case IsmType.FALLBACK_ROUTING:
        contract = await this.updateRoutingIsm({
          destination,
          config,
          origin,
          mailbox,
          existingIsmAddress,
          logger,
        });
        break;
      default:
        return this.deploy(params); // TODO: tidy-up update in follow-up PR
    }

    return contract;
  }

  async deploy<C extends IsmConfig>(params: {
    destination: ChainName;
    config: C;
    origin?: ChainName;
    mailbox?: Address;
  }): Promise<DeployedIsm> {
    const { destination, config, origin, mailbox } = params;
    if (typeof config === 'string') {
      // @ts-ignore
      return IInterchainSecurityModule__factory.connect(
        config,
        this.multiProvider.getSignerOrProvider(destination),
      );
    }

    const ismType = config.type;
    const logger = this.logger.child({ destination, ismType });

    logger.debug(
      `Deploying ${ismType} to ${destination} ${
        origin ? `(for verifying ${origin})` : ''
      }`,
    );

    let contract: DeployedIsmType[typeof ismType];
    switch (ismType) {
      case IsmType.MESSAGE_ID_MULTISIG:
      case IsmType.MERKLE_ROOT_MULTISIG:
        contract = await this.deployMultisigIsm(destination, config, logger);
        break;
      case IsmType.ROUTING:
      case IsmType.FALLBACK_ROUTING:
        contract = await this.deployRoutingIsm({
          destination,
          config,
          origin,
          mailbox,
          logger,
        });
        break;
      case IsmType.AGGREGATION:
        contract = await this.deployAggregationIsm({
          destination,
          config,
          origin,
          mailbox,
          logger,
        });
        break;
      case IsmType.OP_STACK:
        assert(
          this.deployer,
          `HyperlaneDeployer must be set to deploy ${ismType}`,
        );
        contract = await this.deployer.deployContractFromFactory(
          destination,
          new OPStackIsm__factory(),
          IsmType.OP_STACK,
          [config.nativeBridge],
        );
        break;
      case IsmType.PAUSABLE:
        assert(
          this.deployer,
          `HyperlaneDeployer must be set to deploy ${ismType}`,
        );
        contract = await this.deployer.deployContractFromFactory(
          destination,
          new PausableIsm__factory(),
          IsmType.PAUSABLE,
          [config.owner],
        );
        break;
      case IsmType.TRUSTED_RELAYER:
        assert(
          this.deployer,
          `HyperlaneDeployer must be set to deploy ${ismType}`,
        );
        assert(mailbox, `Mailbox address is required for deploying ${ismType}`);
        contract = await this.deployer.deployContractFromFactory(
          destination,
          new TrustedRelayerIsm__factory(),
          IsmType.TRUSTED_RELAYER,
          [mailbox, config.relayer],
        );
        break;
      case IsmType.ARB_L2_TO_L1:
        assert(
          this.deployer,
          `HyperlaneDeployer must be set to deploy ${ismType}`,
        );
        contract = await this.deployer.deployContractFromFactory(
          destination,
          new ArbL2ToL1Ism__factory(),
          IsmType.ARB_L2_TO_L1,
          [config.bridge, config.outbox],
        );
        break;

      case IsmType.TEST_ISM:
        if (!this.deployer) {
          throw new Error(`HyperlaneDeployer must be set to deploy ${ismType}`);
        }
        contract = await this.deployer.deployContractFromFactory(
          destination,
          new TestIsm__factory(),
          IsmType.TEST_ISM,
          [],
        );
        break;
      default:
        throw new Error(`Unsupported ISM type ${ismType}`);
    }

    return contract;
  }

  protected async deployMultisigIsm(
    destination: ChainName,
    config: MultisigIsmConfig,
    logger: Logger,
  ): Promise<IMultisigIsm> {
    const signer = this.multiProvider.getSigner(destination);
    const multisigIsmFactory =
      config.type === IsmType.MERKLE_ROOT_MULTISIG
        ? this.factories.staticMerkleRootMultisigIsmFactory
        : this.factories.staticMessageIdMultisigIsmFactory;

    const address = await this.deployStaticAddressSet(
      destination,
      multisigIsmFactory,
      config.validators,
      logger,
      config.threshold,
    );

    return IMultisigIsm__factory.connect(address, signer);
  }

  protected async updateRoutingIsm(params: {
    destination: ChainName;
    config: RoutingIsmConfig;
    origin?: ChainName;
    mailbox?: Address;
    existingIsmAddress: Address;
    logger: Logger;
  }): Promise<IRoutingIsm> {
    const { destination, config, mailbox, existingIsmAddress, logger } = params;
    const overrides = this.multiProvider.getTransactionOverrides(destination);
    let routingIsm: DomainRoutingIsm | DefaultFallbackRoutingIsm;

    // filtering out domains which are not part of the multiprovider
    config.domains = objFilter(
      config.domains,
      (domain, config): config is IsmConfig => {
        const domainId = this.multiProvider.tryGetDomainId(domain);
        if (domainId === null) {
          logger.warn(
            `Domain ${domain} doesn't have chain metadata provided, skipping ...`,
          );
        }
        return domainId !== null;
      },
    );

    const safeConfigDomains = Object.keys(config.domains).map((domain) =>
      this.multiProvider.getDomainId(domain),
    );

    const delta: RoutingIsmDelta = existingIsmAddress
      ? await routingModuleDelta(
          destination,
          existingIsmAddress,
          config,
          this.multiProvider,
          this.factories,
          mailbox,
        )
      : {
          domainsToUnenroll: [],
          domainsToEnroll: safeConfigDomains,
        };

    const signer = this.multiProvider.getSigner(destination);
    const provider = this.multiProvider.getProvider(destination);
    const owner = await DomainRoutingIsm__factory.connect(
      existingIsmAddress,
      provider,
    ).owner();
    const isOwner = eqAddress(await signer.getAddress(), owner);

    // reconfiguring existing routing ISM
    if (existingIsmAddress && isOwner && !delta.mailbox) {
      const isms: Record<Domain, Address> = {};
      routingIsm = DomainRoutingIsm__factory.connect(
        existingIsmAddress,
        this.multiProvider.getSigner(destination),
      );
      // deploying all the ISMs which have to be updated
      for (const originDomain of delta.domainsToEnroll) {
        const origin = this.multiProvider.getChainName(originDomain); // already filtered to only include domains in the multiprovider
        logger.debug(
          `Reconfiguring preexisting routing ISM at for origin ${origin}...`,
        );
        const ism = await this.deploy({
          destination,
          config: config.domains[origin],
          origin,
          mailbox,
        });
        isms[originDomain] = ism.address;
        const tx = await routingIsm.set(
          originDomain,
          isms[originDomain],
          overrides,
        );
        await this.multiProvider.handleTx(destination, tx);
      }
      // unenrolling domains if needed
      for (const originDomain of delta.domainsToUnenroll) {
        logger.debug(
          `Unenrolling originDomain ${originDomain} from preexisting routing ISM at ${existingIsmAddress}...`,
        );
        const tx = await routingIsm.remove(originDomain, overrides);
        await this.multiProvider.handleTx(destination, tx);
      }
      // transfer ownership if needed
      if (delta.owner) {
        logger.debug(`Transferring ownership of routing ISM...`);
        const tx = await routingIsm.transferOwnership(delta.owner, overrides);
        await this.multiProvider.handleTx(destination, tx);
      }
    } else {
      const isms: ChainMap<Address> = {};
      const owner = config.owner;

      for (const origin of Object.keys(config.domains)) {
        const ism = await this.deploy({
          destination,
          config: config.domains[origin],
          origin,
          mailbox,
        });
        isms[origin] = ism.address;
      }
      const submoduleAddresses = Object.values(isms);

      if (config.type === IsmType.FALLBACK_ROUTING) {
        // deploying new fallback routing ISM
        if (!mailbox) {
          throw new Error(
            'Mailbox address is required for deploying fallback routing ISM',
          );
        }

        // connect to existing ISM
        routingIsm = DefaultFallbackRoutingIsm__factory.connect(
          existingIsmAddress,
          signer,
        );

        // update ISM with config
        logger.debug('Initialising fallback routing ISM ...');
        await this.multiProvider.handleTx(
          destination,
          routingIsm['initialize(address,uint32[],address[])'](
            owner,
            safeConfigDomains,
            submoduleAddresses,
            overrides,
          ),
        );
      } else {
        routingIsm = await this.deployDomainRoutingIsm({
          destination,
          owner,
          safeConfigDomains,
          submoduleAddresses,
          overrides,
        });
      }
    }
    return routingIsm;
  }

  protected async deployRoutingIsm(params: {
    destination: ChainName;
    config: RoutingIsmConfig;
    origin?: ChainName;
    mailbox?: Address;
    logger: Logger;
  }): Promise<IRoutingIsm> {
    const { destination, config, mailbox, logger } = params;
    const overrides = this.multiProvider.getTransactionOverrides(destination);
    let routingIsm: DomainRoutingIsm | DefaultFallbackRoutingIsm;

    // filtering out domains which are not part of the multiprovider
    config.domains = objFilter(
      config.domains,
      (domain, config): config is IsmConfig => {
        const domainId = this.multiProvider.tryGetDomainId(domain);
        if (domainId === null) {
          logger.warn(
            `Domain ${domain} doesn't have chain metadata provided, skipping ...`,
          );
        }
        return domainId !== null;
      },
    );

    const safeConfigDomains = Object.keys(config.domains).map((domain) =>
      this.multiProvider.getDomainId(domain),
    );

    const isms: ChainMap<Address> = {};
    const owner = config.owner;

    for (const origin of Object.keys(config.domains)) {
      const ism = await this.deploy({
        destination,
        config: config.domains[origin],
        origin,
        mailbox,
      });
      isms[origin] = ism.address;
    }

    const submoduleAddresses = Object.values(isms);

    if (config.type === IsmType.FALLBACK_ROUTING) {
      // deploying new fallback routing ISM
      if (!mailbox) {
        throw new Error(
          'Mailbox address is required for deploying fallback routing ISM',
        );
      }
      logger.debug('Deploying fallback routing ISM ...');
      routingIsm = await this.multiProvider.handleDeploy(
        destination,
        new DefaultFallbackRoutingIsm__factory(),
        [mailbox],
      );
    } else {
      routingIsm = await this.deployDomainRoutingIsm({
        destination,
        owner,
        safeConfigDomains,
        submoduleAddresses,
        overrides,
      });
    }

    return routingIsm;
  }

  protected async deployDomainRoutingIsm(params: {
    destination: ChainName;
    owner: string;
    safeConfigDomains: number[];
    submoduleAddresses: string[];
    overrides: ethers.Overrides;
  }): Promise<DomainRoutingIsm> {
    const {
      destination,
      owner,
      safeConfigDomains,
      submoduleAddresses,
      overrides,
    } = params;

    // deploying new domain routing ISM
    const tx = await this.factories.domainRoutingIsmFactory.deploy(
      owner,
      safeConfigDomains,
      submoduleAddresses,
      overrides,
    );

    const receipt = await this.multiProvider.handleTx(destination, tx);

    // TODO: Break this out into a generalized function
    const dispatchLogs = receipt.logs
      .map((log) => {
        try {
          return this.factories.domainRoutingIsmFactory.interface.parseLog(log);
        } catch (e) {
          return undefined;
        }
      })
      .filter(
        (log): log is ethers.utils.LogDescription =>
          !!log && log.name === 'ModuleDeployed',
      );
    if (dispatchLogs.length === 0) {
      throw new Error('No ModuleDeployed event found');
    }
    const moduleAddress = dispatchLogs[0].args['module'];
    return DomainRoutingIsm__factory.connect(
      moduleAddress,
      this.multiProvider.getSigner(destination),
    );
  }

  protected async deployAggregationIsm(params: {
    destination: ChainName;
    config: AggregationIsmConfig;
    origin?: ChainName;
    mailbox?: Address;
    logger: Logger;
  }): Promise<IAggregationIsm> {
    const { destination, config, origin, mailbox } = params;
    const signer = this.multiProvider.getSigner(destination);
    const staticAggregationIsmFactory =
      this.factories.staticAggregationIsmFactory;
    const addresses: Address[] = [];
    for (const module of config.modules) {
      const submodule = await this.deploy({
        destination,
        config: module,
        origin,
        mailbox,
      });
      addresses.push(submodule.address);
    }
    const address = await this.deployStaticAddressSet(
      destination,
      staticAggregationIsmFactory,
      addresses,
      params.logger,
      config.threshold,
    );
    return IAggregationIsm__factory.connect(address, signer);
  }

  async deployStaticAddressSet(
    chain: ChainName,
    factory: StaticThresholdAddressSetFactory | StaticAddressSetFactory,
    values: Address[],
    logger: Logger,
    threshold = values.length,
  ): Promise<Address> {
    const sorted = [...values].sort();

    const address = await factory['getAddress(address[],uint8)'](
      sorted,
      threshold,
    );
    const code = await this.multiProvider.getProvider(chain).getCode(address);
    if (code === '0x') {
      logger.debug(
        `Deploying new ${threshold} of ${values.length} address set to ${chain}`,
      );
      const overrides = this.multiProvider.getTransactionOverrides(chain);
      const hash = await factory['deploy(address[],uint8)'](
        sorted,
        threshold,
        overrides,
      );
      await this.multiProvider.handleTx(chain, hash);
      // TODO: add proxy verification artifact?
    } else {
      logger.debug(
        `Recovered ${threshold} of ${values.length} address set on ${chain}: ${address}`,
      );
    }
    return address;
  }
}
