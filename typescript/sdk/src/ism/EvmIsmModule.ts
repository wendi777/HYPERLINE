import { ethers } from 'ethers';
import { Logger } from 'pino';

import {
  DefaultFallbackRoutingIsm__factory,
  DomainRoutingIsm,
  DomainRoutingIsmFactory__factory,
  DomainRoutingIsm__factory,
  IAggregationIsm,
  IAggregationIsm__factory,
  IInterchainSecurityModule__factory,
  IMultisigIsm,
  IMultisigIsm__factory,
  IRoutingIsm,
  MailboxClient__factory,
  OPStackIsm__factory,
  Ownable__factory,
  PausableIsm__factory,
  StaticAddressSetFactory,
  StaticThresholdAddressSetFactory,
  TestIsm__factory,
  TrustedRelayerIsm__factory,
} from '@hyperlane-xyz/core';
import {
  Address,
  ProtocolType,
  assert,
  configDeepEquals,
  eqAddress,
  normalizeConfig,
  objFilter,
  rootLogger,
} from '@hyperlane-xyz/utils';
import { Domain } from '@hyperlane-xyz/utils';

import { attachAndConnectContracts } from '../contracts/contracts.js';
import { HyperlaneAddresses, HyperlaneContracts } from '../contracts/types.js';
import {
  HyperlaneModule,
  HyperlaneModuleParams,
} from '../core/AbstractHyperlaneModule.js';
import { HyperlaneDeployer } from '../deploy/HyperlaneDeployer.js';
import {
  ProxyFactoryFactories,
  proxyFactoryFactories,
} from '../deploy/contracts.js';
import { MultiProvider } from '../providers/MultiProvider.js';
import { AnnotatedEV5Transaction } from '../providers/ProviderType.js';
import { ChainName, ChainNameOrId } from '../types.js';
import { findMatchingLogEvents } from '../utils/logUtils.js';

import { EvmIsmReader } from './EvmIsmReader.js';
import {
  AggregationIsmConfig,
  DeployedIsm,
  IsmConfig,
  IsmType,
  MUTABLE_ISM_TYPE,
  MultisigIsmConfig,
  RoutingIsmConfig,
} from './types.js';
import { calculateDomainRoutingDelta } from './utils.js';

type IsmModuleAddresses = {
  deployedIsm: Address;
  mailbox: Address;
};

export class EvmIsmModule extends HyperlaneModule<
  ProtocolType.Ethereum,
  IsmConfig,
  HyperlaneAddresses<ProxyFactoryFactories> & IsmModuleAddresses
> {
  protected readonly logger = rootLogger.child({ module: 'EvmIsmModule' });
  protected readonly reader: EvmIsmReader;
  protected readonly factories: HyperlaneContracts<ProxyFactoryFactories>;

  // Adding these to reduce how often we need to grab from MultiProvider.
  public readonly chain: ChainName;
  // We use domainId here because MultiProvider.getDomainId() will always
  // return a number, and EVM the domainId and chainId are the same.
  public readonly domainId: Domain;

  protected constructor(
    protected readonly multiProvider: MultiProvider,
    protected readonly deployer: HyperlaneDeployer<any, any>,
    params: HyperlaneModuleParams<
      IsmConfig,
      HyperlaneAddresses<ProxyFactoryFactories> & IsmModuleAddresses
    >,
  ) {
    super(params);

    this.reader = new EvmIsmReader(multiProvider, params.chain);
    const { mailbox: _, deployedIsm: __, ...addresses } = params.addresses;
    this.factories = attachAndConnectContracts(
      addresses,
      proxyFactoryFactories,
      multiProvider.getSigner(params.chain),
    );

    this.chain = this.multiProvider.getChainName(this.args.chain);
    this.domainId = this.multiProvider.getDomainId(this.chain);
  }

  public async read(): Promise<IsmConfig> {
    return typeof this.args.config === 'string'
      ? this.args.addresses.deployedIsm
      : this.reader.deriveIsmConfig(this.args.addresses.deployedIsm);
  }

  // whoever calls update() needs to ensure that targetConfig has a valid owner
  public async update(
    targetConfig: IsmConfig,
  ): Promise<AnnotatedEV5Transaction[]> {
    // save current config for comparison
    // normalize the config to ensure it's in a consistent format for comparison
    const currentConfig = normalizeConfig(await this.read());

    // Update the config
    this.args.config = targetConfig;

    // moduleMatchesConfig expects any domain filtering to have been done already
    if (
      typeof targetConfig !== 'string' &&
      (targetConfig.type === IsmType.ROUTING ||
        targetConfig.type === IsmType.FALLBACK_ROUTING)
    ) {
      // filter for known domains
      const { availableDomains } = this.filterRoutingIsmDomains({
        config: targetConfig,
      });
      targetConfig.domains = availableDomains;
    }

    // If configs match, no updates needed
    if (configDeepEquals(currentConfig, targetConfig)) {
      return [];
    }

    // Else, we have to figure out what an update for this ISM entails

    // If target config is a custom ISM, just update the address
    // if config -> custom ISM, update address
    // if custom ISM -> custom ISM, update address
    if (typeof targetConfig === 'string') {
      // TODO: https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3773
      this.args.addresses.deployedIsm = targetConfig;
      return [];
    }

    // Check if we need to deploy a new ISM
    if (
      // if custom ISM -> config, do a new deploy
      typeof currentConfig === 'string' ||
      // if config -> config, AND types are different, do a new deploy
      currentConfig.type !== targetConfig.type ||
      // if it is not a mutable ISM, do a new deploy
      !MUTABLE_ISM_TYPE.includes(targetConfig.type)
    ) {
      const contract = await this.deploy({
        config: targetConfig,
      });

      this.args.addresses.deployedIsm = contract.address;
      return [];
    }

    // At this point, only the 3 ownable/mutable ISM types should remain: PAUSABLE, ROUTING, FALLBACK_ROUTING
    if (
      targetConfig.type !== IsmType.PAUSABLE &&
      targetConfig.type !== IsmType.ROUTING &&
      targetConfig.type !== IsmType.FALLBACK_ROUTING
    ) {
      throw new Error(`Unsupported ISM type ${targetConfig.type}`);
    }

    const logger = this.logger.child({
      destination: this.chain,
      ismType: targetConfig.type,
    });
    const provider = this.multiProvider.getProvider(this.chain);

    logger.debug(`Updating ${targetConfig.type} on ${this.chain}`);

    // if it's a fallback routing ISM, do a mailbox diff check and deploy a new ISM if needed
    if (targetConfig.type === IsmType.FALLBACK_ROUTING) {
      // can only retreive mailbox address if current ISM type is also Fallback Routing
      const mailboxAddress =
        currentConfig.type === IsmType.FALLBACK_ROUTING
          ? await MailboxClient__factory.connect(
              this.args.addresses.deployedIsm,
              provider,
            ).mailbox()
          : ''; // empty string to force a mailbox diff

      // if mailbox delta, deploy new routing ISM before updating
      // this will always be the case if the current ISM is not a fallback routing ISM
      if (!eqAddress(mailboxAddress, this.args.addresses.mailbox)) {
        const newIsm = await this.deployRoutingIsm({
          config: targetConfig,
          logger,
        });

        this.args.addresses.deployedIsm = newIsm.address;
      }
    }

    // if it's either of the routing ISMs, update their submodules
    let updateTxs: AnnotatedEV5Transaction[] = [];
    if (
      targetConfig.type === IsmType.ROUTING ||
      targetConfig.type === IsmType.FALLBACK_ROUTING
    ) {
      updateTxs = await this.updateRoutingIsm({
        current: currentConfig as RoutingIsmConfig,
        target: targetConfig,
        logger,
      });
    }

    // Lastly, check if the resolved owner is different from the current owner
    const owner = await Ownable__factory.connect(
      this.args.addresses.deployedIsm,
      provider,
    ).owner();

    // Return an ownership transfer transaction if required
    if (!eqAddress(targetConfig.owner, owner)) {
      updateTxs.push({
        annotation: 'Transferring ownership of ownable ISM...',
        chainId: this.domainId,
        to: this.args.addresses.deployedIsm,
        data: Ownable__factory.createInterface().encodeFunctionData(
          'transferOwnership(address)',
          [targetConfig.owner],
        ),
      });
    }

    return updateTxs;
  }

  // manually write static create function
  public static async create(params: {
    chain: ChainNameOrId;
    config: IsmConfig;
    deployer: HyperlaneDeployer<any, any>;
    factories: HyperlaneAddresses<ProxyFactoryFactories>;
    mailbox: Address;
    multiProvider: MultiProvider;
  }): Promise<EvmIsmModule> {
    const { chain, config, deployer, factories, mailbox, multiProvider } =
      params;

    // instantiate new EvmIsmModule
    const module = new EvmIsmModule(multiProvider, deployer, {
      addresses: {
        ...factories,
        mailbox,
        deployedIsm: ethers.constants.AddressZero,
      },
      chain,
      config,
    });

    // deploy ISM and assign address to module
    const deployedIsm = await module.deploy({ config });
    module.args.addresses.deployedIsm = deployedIsm.address;

    return module;
  }

  protected async updateRoutingIsm({
    current,
    target,
    logger,
  }: {
    current: RoutingIsmConfig;
    target: RoutingIsmConfig;
    logger: Logger;
  }): Promise<AnnotatedEV5Transaction[]> {
    const routingIsmInterface = DomainRoutingIsm__factory.createInterface();
    const updateTxs = [];

    const { domainsToEnroll, domainsToUnenroll } = calculateDomainRoutingDelta(
      current,
      target,
    );

    // Enroll domains
    for (const origin of domainsToEnroll) {
      logger.debug(
        `Reconfiguring preexisting routing ISM for origin ${origin}...`,
      );
      const ism = await this.deploy({
        config: target.domains[origin],
      });

      const domainId = this.multiProvider.getDomainId(origin);
      updateTxs.push({
        annotation: `Setting new ISM for origin ${origin}...`,
        chainId: this.domainId,
        to: this.args.addresses.deployedIsm,
        data: routingIsmInterface.encodeFunctionData('set(uint32,address)', [
          domainId,
          ism.address,
        ]),
      });
    }

    // Unenroll domains
    for (const origin of domainsToUnenroll) {
      const domainId = this.multiProvider.getDomainId(origin);
      updateTxs.push({
        annotation: `Unenrolling originDomain ${domainId} from preexisting routing ISM at ${this.args.addresses.deployedIsm}...`,
        chainId: this.domainId,
        to: this.args.addresses.deployedIsm,
        data: routingIsmInterface.encodeFunctionData('remove(uint32)', [
          domainId,
        ]),
      });
    }

    return updateTxs;
  }

  protected async deploy<C extends IsmConfig>({
    config,
  }: {
    config: C;
  }): Promise<DeployedIsm> {
    // If it's a custom ISM, just return a base ISM
    if (typeof config === 'string') {
      // TODO: https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3773
      // we can remove the ts-ignore once we have a proper type for custom ISMs
      // @ts-ignore
      return IInterchainSecurityModule__factory.connect(
        config,
        this.multiProvider.getSignerOrProvider(this.args.chain),
      );
    }

    const ismType = config.type;
    const logger = rootLogger.child({ chainName: this.chain, ismType });

    logger.debug(`Deploying ${ismType} to ${this.args.chain}`);

    switch (ismType) {
      case IsmType.MESSAGE_ID_MULTISIG:
      case IsmType.MERKLE_ROOT_MULTISIG:
        return this.deployMultisigIsm({
          config,
          logger,
        });

      case IsmType.ROUTING:
      case IsmType.FALLBACK_ROUTING:
        return this.deployRoutingIsm({
          config,
          logger,
        });

      case IsmType.AGGREGATION:
        return this.deployAggregationIsm({
          config,
          logger,
        });

      case IsmType.OP_STACK:
        return this.deployer.deployContractFromFactory(
          this.chain,
          new OPStackIsm__factory(),
          IsmType.OP_STACK,
          [config.nativeBridge],
        );

      case IsmType.PAUSABLE:
        return this.deployer.deployContractFromFactory(
          this.chain,
          new PausableIsm__factory(),
          IsmType.PAUSABLE,
          [config.owner],
        );

      case IsmType.TRUSTED_RELAYER:
        assert(
          this.args.addresses.mailbox,
          `Mailbox address is required for deploying ${ismType}`,
        );
        return this.deployer.deployContractFromFactory(
          this.chain,
          new TrustedRelayerIsm__factory(),
          IsmType.TRUSTED_RELAYER,
          [this.args.addresses.mailbox, config.relayer],
        );

      case IsmType.TEST_ISM:
        return this.deployer.deployContractFromFactory(
          this.chain,
          new TestIsm__factory(),
          IsmType.TEST_ISM,
          [],
        );

      default:
        throw new Error(`Unsupported ISM type ${ismType}`);
    }
  }

  protected async deployMultisigIsm({
    config,
    logger,
  }: {
    config: MultisigIsmConfig;
    logger: Logger;
  }): Promise<IMultisigIsm> {
    const signer = this.multiProvider.getSigner(this.chain);
    const factoryName =
      config.type === IsmType.MERKLE_ROOT_MULTISIG
        ? 'staticMerkleRootMultisigIsmFactory'
        : 'staticMessageIdMultisigIsmFactory';

    const address = await EvmIsmModule.deployStaticAddressSet({
      chain: this.chain,
      factory: this.factories[factoryName],
      values: config.validators,
      logger,
      threshold: config.threshold,
      multiProvider: this.multiProvider,
    });

    return IMultisigIsm__factory.connect(address, signer);
  }

  protected async deployRoutingIsm({
    config,
    logger,
  }: {
    config: RoutingIsmConfig;
    logger: Logger;
  }): Promise<IRoutingIsm> {
    // filter out domains which are not part of the multiprovider
    const { availableDomains, availableDomainIds } =
      this.filterRoutingIsmDomains({
        config,
      });
    config.domains = availableDomains;

    // deploy the submodules first
    const submoduleAddresses: Address[] = await Promise.all(
      Object.keys(config.domains).map(async (origin) => {
        const { address } = await this.deploy({
          config: config.domains[origin],
        });
        return address;
      }),
    );

    if (config.type === IsmType.FALLBACK_ROUTING) {
      // deploy the fallback routing ISM
      logger.debug('Deploying fallback routing ISM ...');
      const ism = await this.multiProvider.handleDeploy(
        this.chain,
        new DefaultFallbackRoutingIsm__factory(),
        [this.args.addresses.mailbox],
      );

      // initialize the fallback routing ISM
      logger.debug('Initializing fallback routing ISM ...');
      const tx = await ism['initialize(address,uint32[],address[])'](
        config.owner,
        availableDomainIds,
        submoduleAddresses,
      );

      await this.multiProvider.handleTx(this.chain, tx);
      // return the fallback routing ISM
      return ism;
    }

    // then deploy the domain routing ISM
    logger.debug('Deploying domain routing ISM ...');
    return this.deployDomainRoutingIsm({
      owner: config.owner,
      domainIds: availableDomainIds,
      submoduleAddresses,
    });
  }

  protected async deployDomainRoutingIsm({
    owner,
    domainIds,
    submoduleAddresses,
  }: {
    owner: string;
    domainIds: number[];
    submoduleAddresses: string[];
  }): Promise<DomainRoutingIsm> {
    const overrides = this.multiProvider.getTransactionOverrides(
      this.args.chain,
    );

    const signer = this.multiProvider.getSigner(this.args.chain);
    const domainRoutingIsmFactory = DomainRoutingIsmFactory__factory.connect(
      this.args.addresses.domainRoutingIsmFactory,
      signer,
    );

    // deploying new domain routing ISM
    const tx = await domainRoutingIsmFactory.deploy(
      owner,
      domainIds,
      submoduleAddresses,
      overrides,
    );

    const receipt = await this.multiProvider.handleTx(this.args.chain, tx);
    const dispatchLogs = findMatchingLogEvents(
      receipt.logs,
      domainRoutingIsmFactory.interface,
      'ModuleDeployed',
    );

    if (dispatchLogs.length === 0) {
      throw new Error('No ModuleDeployed event found');
    }

    const moduleAddress = dispatchLogs[0].args['module'];
    return DomainRoutingIsm__factory.connect(moduleAddress, signer);
  }

  protected async deployAggregationIsm({
    config,
    logger,
  }: {
    config: AggregationIsmConfig;
    logger: Logger;
  }): Promise<IAggregationIsm> {
    const addresses: Address[] = [];
    // Needs to be deployed sequentially because Ethers will throw `Error: replacement fee too low`
    for (const module of config.modules) {
      const submodule = await this.deploy({ config: module });
      addresses.push(submodule.address);
    }

    const factoryName = 'staticAggregationIsmFactory';
    const address = await EvmIsmModule.deployStaticAddressSet({
      chain: this.chain,
      factory: this.factories[factoryName],
      values: addresses,
      logger: logger,
      threshold: config.threshold,
      multiProvider: this.multiProvider,
    });

    const signer = this.multiProvider.getSigner(this.args.chain);
    return IAggregationIsm__factory.connect(address, signer);
  }

  // Updates the mailbox address if it is different from the current one.
  // Logs changes and updates the internal state of the module.
  public setNewMailbox(newMailboxAddress: Address): void {
    const currentMailboxAddress = this.args.addresses.mailbox;

    if (currentMailboxAddress === newMailboxAddress) {
      this.logger.debug(
        `Mailbox address is already set to ${newMailboxAddress}`,
      );
      return;
    }

    this.logger.debug(
      `Setting new mailbox address from ${currentMailboxAddress} to ${newMailboxAddress}`,
    );

    // Update the mailbox address in the arguments
    this.args.addresses.mailbox = newMailboxAddress;
  }

  // Public so it can be reused by the hook module.
  // Caller of this function is responsible for verifying the contract
  // because they know exactly which factory is being called.
  public static async deployStaticAddressSet({
    chain,
    factory,
    values,
    logger,
    threshold = values.length,
    multiProvider,
  }: {
    chain: ChainName;
    factory: StaticThresholdAddressSetFactory | StaticAddressSetFactory;
    values: Address[];
    logger: Logger;
    threshold?: number;
    multiProvider: MultiProvider;
  }): Promise<Address> {
    const address = await factory['getAddress(address[],uint8)'](
      values,
      threshold,
    );
    const code = await multiProvider.getProvider(chain).getCode(address);
    if (code === '0x') {
      logger.debug(
        `Deploying new ${threshold} of ${values.length} address set to ${chain}`,
      );
      const overrides = multiProvider.getTransactionOverrides(chain);
      const hash = await factory['deploy(address[],uint8)'](
        values,
        threshold,
        overrides,
      );
      await multiProvider.handleTx(chain, hash);
    } else {
      logger.debug(
        `Recovered ${threshold} of ${values.length} address set on ${chain}: ${address}`,
      );
    }

    // TODO: figure out how to get the constructor arguments for manual deploy TXs
    // const verificationInput = buildVerificationInput(
    //   NAME,
    //   ADDRESS,
    //   CONSTRUCTOR_ARGS,
    // );
    // await this.deployer.verifyContract(
    //   this.chainName,
    //   verificationInput,
    //   logger,
    // );

    return address;
  }

  // filtering out domains which are not part of the multiprovider
  private filterRoutingIsmDomains({ config }: { config: RoutingIsmConfig }) {
    const availableDomainIds: number[] = [];
    const availableDomains = objFilter(
      config.domains,
      (domain, _): _ is IsmConfig => {
        const domainId = this.multiProvider.tryGetDomainId(domain);
        if (domainId === null) {
          this.logger.warn(
            `Domain ${domain} doesn't have chain metadata provided, skipping ...`,
          );
          return false;
        }

        availableDomainIds.push(domainId);
        return true;
      },
    );

    return { availableDomains, availableDomainIds };
  }
}
