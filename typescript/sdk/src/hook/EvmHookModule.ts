import { BigNumber, ethers } from 'ethers';

import {
  DomainRoutingHook,
  DomainRoutingHook__factory,
  FallbackDomainRoutingHook,
  IL1CrossDomainMessenger__factory,
  IPostDispatchHook__factory,
  InterchainGasPaymaster,
  InterchainGasPaymaster__factory,
  OPStackHook,
  OPStackIsm__factory,
  Ownable__factory,
  PausableHook,
  PausableHook__factory,
  ProtocolFee,
  ProtocolFee__factory,
  StaticAggregationHook,
  StaticAggregationHookFactory__factory,
  StaticAggregationHook__factory,
  StorageGasOracle,
  StorageGasOracle__factory,
} from '@hyperlane-xyz/core';
import {
  Address,
  ProtocolType,
  addressToBytes32,
  configDeepEquals,
  eqAddress,
  normalizeConfig,
  rootLogger,
} from '@hyperlane-xyz/utils';

import { TOKEN_EXCHANGE_RATE_SCALE } from '../consts/igp.js';
import { HyperlaneAddresses } from '../contracts/types.js';
import {
  HyperlaneModule,
  HyperlaneModuleParams,
} from '../core/AbstractHyperlaneModule.js';
import { CoreAddresses } from '../core/contracts.js';
import { EvmModuleDeployer } from '../deploy/EvmModuleDeployer.js';
import { ProxyFactoryFactories } from '../deploy/contracts.js';
import { ContractVerifier } from '../deploy/verify/ContractVerifier.js';
import { IgpFactories, igpFactories } from '../gas/contracts.js';
import { IgpConfig } from '../gas/types.js';
import { EvmIsmModule } from '../ism/EvmIsmModule.js';
import { IsmType, OpStackIsmConfig } from '../ism/types.js';
import { MultiProvider } from '../providers/MultiProvider.js';
import { AnnotatedEV5Transaction } from '../providers/ProviderType.js';
import { ChainNameOrId } from '../types.js';

import { EvmHookReader } from './EvmHookReader.js';
import { DeployedHook, HookFactories, hookFactories } from './contracts.js';
import { HookConfigSchema } from './schemas.js';
import {
  AggregationHookConfig,
  DomainRoutingHookConfig,
  FallbackRoutingHookConfig,
  HookConfig,
  HookType,
  IgpHookConfig,
  MUTABLE_HOOK_TYPE,
  OpStackHookConfig,
  PausableHookConfig,
  ProtocolFeeHookConfig,
} from './types.js';

type HookModuleAddresses = {
  deployedHook: Address;
  mailbox: Address;
  proxyAdmin: Address;
};

export class EvmHookModule extends HyperlaneModule<
  ProtocolType.Ethereum,
  HookConfig,
  HyperlaneAddresses<ProxyFactoryFactories> & HookModuleAddresses
> {
  protected readonly logger = rootLogger.child({ module: 'EvmHookModule' });
  protected readonly reader: EvmHookReader;
  protected readonly deployer: EvmModuleDeployer<HookFactories & IgpFactories>;

  // Adding these to reduce how often we need to grab from MultiProvider.
  public readonly chain: string;
  // We use domainId here because MultiProvider.getDomainId() will always
  // return a number, and EVM the domainId and chainId are the same.
  public readonly domainId: number;

  // Transaction overrides for the chain
  protected readonly txOverrides: Partial<ethers.providers.TransactionRequest>;

  protected constructor(
    protected readonly multiProvider: MultiProvider,
    params: HyperlaneModuleParams<
      HookConfig,
      HyperlaneAddresses<ProxyFactoryFactories> & HookModuleAddresses
    >,
    contractVerifier?: ContractVerifier,
  ) {
    params.config = HookConfigSchema.parse(params.config);
    super(params);

    this.reader = new EvmHookReader(multiProvider, this.params.chain);
    this.deployer = new EvmModuleDeployer(
      multiProvider,
      {
        ...hookFactories,
        ...igpFactories,
      },
      this.logger,
      contractVerifier,
    );

    this.chain = this.multiProvider.getChainName(this.params.chain);
    this.domainId = this.multiProvider.getDomainId(this.chain);

    this.txOverrides = this.multiProvider.getTransactionOverrides(this.chain);
  }

  public async read(): Promise<HookConfig> {
    return typeof this.params.config === 'string'
      ? this.params.addresses.deployedHook
      : this.reader.deriveHookConfig(this.params.addresses.deployedHook);
  }

  public async update(
    targetConfig: HookConfig,
  ): Promise<AnnotatedEV5Transaction[]> {
    targetConfig = HookConfigSchema.parse(targetConfig);

    // save current config for comparison
    // normalize the config to ensure it's in a consistent format for comparison
    const currentConfig = normalizeConfig(await this.read());

    // Update the config
    this.params.config = targetConfig;

    // If configs match, no updates needed
    if (configDeepEquals(currentConfig, targetConfig)) {
      return [];
    }

    // Else, we have to figure out what an update for this Hook entails

    // If target config is an address Hook, just update the address
    if (typeof targetConfig === 'string') {
      // TODO: https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3773
      this.params.addresses.deployedHook = targetConfig;
      return [];
    }

    // Check if we need to deploy a new Hook
    if (
      // if updating from an address/custom config to a proper hook config, do a new deploy
      typeof currentConfig === 'string' ||
      // if updating a proper hook config whose types are different, do a new deploy
      currentConfig.type !== targetConfig.type ||
      // if it is not a mutable Hook, do a new deploy
      !MUTABLE_HOOK_TYPE.includes(targetConfig.type)
    ) {
      const contract = await this.deploy({
        config: targetConfig,
      });

      this.params.addresses.deployedHook = contract.address;
      return [];
    }

    let updateTxs: AnnotatedEV5Transaction[];

    // obtain the update txs for each hook type
    switch (targetConfig.type) {
      case HookType.INTERCHAIN_GAS_PAYMASTER:
        updateTxs = await this.updateIgpHook({
          currentConfig,
          targetConfig,
        });
        break;
      case HookType.PROTOCOL_FEE:
        updateTxs = await this.updateProtocolFeeHook({
          currentConfig,
          targetConfig,
        });
        break;
      case HookType.PAUSABLE:
        updateTxs = await this.updatePausableHook({
          currentConfig,
          targetConfig,
        });
        break;
      case HookType.ROUTING:
      case HookType.FALLBACK_ROUTING:
        updateTxs = await this.updateRoutingHook({
          currentConfig,
          targetConfig,
        });
        break;
      default:
        // MERKLE_TREE, AGGREGATION and OP_STACK hooks should already be handled before the switch
        throw new Error(`Unsupported hook type: ${targetConfig.type}`);
    }

    // Lastly, check if the resolved owner is different from the current owner
    const owner = await Ownable__factory.connect(
      this.params.addresses.deployedHook,
      this.multiProvider.getProvider(this.chain),
    ).owner();

    // Return an ownership transfer transaction if required
    if (!eqAddress(targetConfig.owner, owner)) {
      updateTxs.push({
        annotation: 'Transferring ownership of ownable Hook...',
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data: Ownable__factory.createInterface().encodeFunctionData(
          'transferOwnership(address)',
          [targetConfig.owner],
        ),
      });
    }

    return updateTxs;
  }

  // manually write static create function
  public static async create({
    chain,
    config,
    proxyFactoryFactories,
    coreAddresses,
    multiProvider,
  }: {
    chain: ChainNameOrId;
    config: HookConfig;
    proxyFactoryFactories: HyperlaneAddresses<ProxyFactoryFactories>;
    coreAddresses: CoreAddresses;
    multiProvider: MultiProvider;
  }): Promise<EvmHookModule> {
    // instantiate new EvmHookModule
    const module = new EvmHookModule(multiProvider, {
      addresses: {
        ...proxyFactoryFactories,
        ...coreAddresses,
        deployedHook: ethers.constants.AddressZero,
      },
      chain,
      config,
    });

    // deploy hook and assign address to module
    const deployedHook = await module.deploy({ config });
    module.params.addresses.deployedHook = deployedHook.address;

    return module;
  }

  // Compute delta between current and target domain configurations
  protected async computeRoutingHooksToSet({
    currentDomains,
    targetDomains,
  }: {
    currentDomains: DomainRoutingHookConfig['domains'];
    targetDomains: DomainRoutingHookConfig['domains'];
  }): Promise<DomainRoutingHook.HookConfigStruct[]> {
    const routingHookUpdates: DomainRoutingHook.HookConfigStruct[] = [];

    // Iterate over the target domains and compare with the current configuration
    for (const [dest, targetDomainConfig] of Object.entries(targetDomains)) {
      const destDomain = this.multiProvider.tryGetDomainId(dest);
      if (!destDomain) {
        this.logger.warn(`Domain not found in MultiProvider: ${dest}`);
        continue;
      }

      // If the domain is not in the current config or the config has changed, deploy a new hook
      // TODO: in-place updates per domain as a future optimization
      if (!configDeepEquals(currentDomains[dest], targetDomainConfig)) {
        const domainHook = await this.deploy({
          config: targetDomainConfig,
        });

        routingHookUpdates.push({
          destination: destDomain,
          hook: domainHook.address,
        });
      }
    }

    return routingHookUpdates;
  }

  protected async updatePausableHook({
    currentConfig,
    targetConfig,
  }: {
    currentConfig: PausableHookConfig;
    targetConfig: PausableHookConfig;
  }): Promise<AnnotatedEV5Transaction[]> {
    const updateTxs = [];

    if (currentConfig.paused !== targetConfig.paused) {
      // Have to encode separately otherwise tsc will complain
      // about being unable to infer types correctly
      const pausableInterface = PausableHook__factory.createInterface();
      const data = targetConfig.paused
        ? pausableInterface.encodeFunctionData('pause')
        : pausableInterface.encodeFunctionData('unpause');

      updateTxs.push({
        annotation: `Updating paused state to ${targetConfig.paused}`,
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data,
      });
    }

    return updateTxs;
  }

  protected async updateIgpHook({
    currentConfig,
    targetConfig,
  }: {
    currentConfig: IgpHookConfig;
    targetConfig: IgpHookConfig;
  }): Promise<AnnotatedEV5Transaction[]> {
    const updateTxs = [];
    const igpInterface = InterchainGasPaymaster__factory.createInterface();

    // Update beneficiary if changed
    if (!eqAddress(currentConfig.beneficiary, targetConfig.beneficiary)) {
      updateTxs.push({
        annotation: `Updating beneficiary from ${currentConfig.beneficiary} to ${targetConfig.beneficiary}`,
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data: igpInterface.encodeFunctionData('setBeneficiary(address)', [
          targetConfig.beneficiary,
        ]),
      });
    }

    // get gasOracleAddress using any remote domain in the current config
    let gasOracle;
    const domainKeys = Object.keys(currentConfig.oracleConfig);

    // If possible, reuse and reconfigure the gas oracle from the first remote we know.
    // Otherwise if there are no remotes in current config, deploy a new gas oracle with our target config.
    // We should be reusing the same oracle for all remotes, but if not, the updateIgpRemoteGasParams step will rectify this
    if (domainKeys.length > 0) {
      const domainId = this.multiProvider.getDomainId(domainKeys[0]);
      ({ gasOracle } = await InterchainGasPaymaster__factory.connect(
        this.params.addresses.deployedHook,
        this.multiProvider.getSignerOrProvider(this.chain),
      )['destinationGasConfigs(uint32)'](domainId));

      // update storage gas oracle
      // Note: this will only update the gas oracle for remotes that are in the target config
      updateTxs.push(
        ...(await this.updateStorageGasOracle({
          gasOracle,
          currentOracleConfig: currentConfig.oracleConfig,
          targetOracleConfig: targetConfig.oracleConfig,
          targetOverhead: targetConfig.overhead, // used to log example remote gas costs
        })),
      );
    } else {
      const newGasOracle = await this.deployStorageGasOracle({
        config: targetConfig,
      });
      gasOracle = newGasOracle.address;
    }

    // update igp remote gas params
    // Note: this will only update the gas params for remotes that are in the target config
    updateTxs.push(
      ...(await this.updateIgpRemoteGasParams({
        interchainGasPaymaster: this.params.addresses.deployedHook,
        gasOracle,
        currentOverheads: currentConfig.overhead,
        targetOverheads: targetConfig.overhead,
      })),
    );

    return updateTxs;
  }

  protected async updateIgpRemoteGasParams({
    interchainGasPaymaster,
    gasOracle,
    currentOverheads,
    targetOverheads,
  }: {
    interchainGasPaymaster: Address;
    gasOracle: Address;
    currentOverheads?: IgpConfig['overhead'];
    targetOverheads: IgpConfig['overhead'];
  }): Promise<AnnotatedEV5Transaction[]> {
    const gasParamsToSet: InterchainGasPaymaster.GasParamStruct[] = [];
    for (const [remote, gasOverhead] of Object.entries(targetOverheads)) {
      // Note: non-EVM remotes actually *are* supported, provided that the remote domain is in the MultiProvider.
      // Previously would check core metadata for non EVMs and fallback to multiprovider for custom EVMs
      const remoteDomain = this.multiProvider.tryGetDomainId(remote);

      if (!remoteDomain) {
        this.logger.warn(
          `Skipping overhead ${this.chain} -> ${remote}. Expected if the remote domain is not in the MultiProvider.`,
        );
        continue;
      }

      // only update if the gas overhead has changed
      if (currentOverheads?.[remote] !== gasOverhead) {
        this.logger.debug(
          `Setting gas params for ${this.chain} -> ${remote}: gasOverhead = ${gasOverhead} gasOracle = ${gasOracle}`,
        );
        gasParamsToSet.push({
          remoteDomain,
          config: {
            gasOverhead,
            gasOracle,
          },
        });
      }
    }

    if (gasParamsToSet.length === 0) {
      return [];
    }

    return [
      {
        annotation: `Updating overhead for domains ${Object.keys(
          targetOverheads,
        ).join(', ')}...`,
        chainId: this.domainId,
        to: interchainGasPaymaster,
        data: InterchainGasPaymaster__factory.createInterface().encodeFunctionData(
          'setDestinationGasConfigs((uint32,(address,uint96))[])',
          [gasParamsToSet],
        ),
      },
    ];
  }

  protected async updateStorageGasOracle({
    gasOracle,
    currentOracleConfig,
    targetOracleConfig,
    targetOverhead,
  }: {
    gasOracle: Address;
    currentOracleConfig?: IgpConfig['oracleConfig'];
    targetOracleConfig: IgpConfig['oracleConfig'];
    targetOverhead: IgpConfig['overhead'];
  }): Promise<AnnotatedEV5Transaction[]> {
    this.logger.info(`Updating gas oracle configuration from ${this.chain}...`);
    const configsToSet: Array<StorageGasOracle.RemoteGasDataConfigStruct> = [];

    for (const [remote, target] of Object.entries(targetOracleConfig)) {
      // Note: non-EVM remotes actually *are* supported, provided that the remote domain is in the MultiProvider.
      // Previously would check core metadata for non EVMs and fallback to multiprovider for custom EVMs
      const current = currentOracleConfig?.[remote];
      const remoteDomain = this.multiProvider.tryGetDomainId(remote);

      if (!remoteDomain) {
        this.logger.warn(
          `Skipping gas oracle update ${this.chain} -> ${remote}. Expected if the remote domain is not in the MultiProvider.`,
        );
        continue;
      }

      // only update if the oracle config has changed
      if (!current || !configDeepEquals(current, target)) {
        configsToSet.push({ remoteDomain, ...target });

        // Log an example remote gas cost
        const exampleRemoteGas = (targetOverhead[remote] ?? 200_000) + 50_000;
        const exampleRemoteGasCost = BigNumber.from(target.tokenExchangeRate)
          .mul(target.gasPrice)
          .mul(exampleRemoteGas)
          .div(TOKEN_EXCHANGE_RATE_SCALE);
        this.logger.info(
          `${
            this.chain
          } -> ${remote}: ${exampleRemoteGas} remote gas cost: ${ethers.utils.formatEther(
            exampleRemoteGasCost,
          )}`,
        );
      }
    }

    if (configsToSet.length === 0) {
      return [];
    }

    return [
      {
        annotation: `Updating gas oracle config for domains ${Object.keys(
          targetOracleConfig,
        ).join(', ')}...`,
        chainId: this.domainId,
        to: gasOracle,
        data: StorageGasOracle__factory.createInterface().encodeFunctionData(
          'setRemoteGasDataConfigs((uint32,uint128,uint128)[])',
          [configsToSet],
        ),
      },
    ];
  }

  protected async updateProtocolFeeHook({
    currentConfig,
    targetConfig,
  }: {
    currentConfig: ProtocolFeeHookConfig;
    targetConfig: ProtocolFeeHookConfig;
  }): Promise<AnnotatedEV5Transaction[]> {
    const updateTxs = [];
    const protocolFeeInterface = ProtocolFee__factory.createInterface();

    // if maxProtocolFee has changed, deploy a new hook
    if (currentConfig.maxProtocolFee !== targetConfig.maxProtocolFee) {
      const hook = await this.deployProtocolFeeHook({ config: targetConfig });
      this.params.addresses.deployedHook = hook.address;
      return [];
    }

    // Update protocol fee if changed
    if (currentConfig.protocolFee !== targetConfig.protocolFee) {
      updateTxs.push({
        annotation: `Updating protocol fee from ${currentConfig.protocolFee} to ${targetConfig.protocolFee}`,
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data: protocolFeeInterface.encodeFunctionData(
          'setProtocolFee(uint256)',
          [targetConfig.protocolFee],
        ),
      });
    }

    // Update beneficiary if changed
    if (currentConfig.beneficiary !== targetConfig.beneficiary) {
      updateTxs.push({
        annotation: `Updating beneficiary from ${currentConfig.beneficiary} to ${targetConfig.beneficiary}`,
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data: protocolFeeInterface.encodeFunctionData(
          'setBeneficiary(address)',
          [targetConfig.beneficiary],
        ),
      });
    }

    // Return the transactions to update the protocol fee hook
    return updateTxs;
  }

  // Updates a routing hook
  protected async updateRoutingHook({
    currentConfig,
    targetConfig,
  }: {
    currentConfig: DomainRoutingHookConfig | FallbackRoutingHookConfig;
    targetConfig: DomainRoutingHookConfig | FallbackRoutingHookConfig;
  }): Promise<AnnotatedEV5Transaction[]> {
    // Deploy a new fallback hook if the fallback config has changed
    if (
      targetConfig.type === HookType.FALLBACK_ROUTING &&
      !configDeepEquals(
        targetConfig.fallback,
        (currentConfig as FallbackRoutingHookConfig).fallback,
      )
    ) {
      const hook = await this.deploy({ config: targetConfig });
      this.params.addresses.deployedHook = hook.address;
      return [];
    }

    const routingUpdates = await this.computeRoutingHooksToSet({
      currentDomains: currentConfig.domains,
      targetDomains: targetConfig.domains,
    });

    // Return if no updates are required
    if (routingUpdates.length === 0) {
      return [];
    }

    // Create tx for setting hooks
    return [
      {
        annotation: 'Updating routing hooks...',
        chainId: this.domainId,
        to: this.params.addresses.deployedHook,
        data: DomainRoutingHook__factory.createInterface().encodeFunctionData(
          'setHooks((uint32,address)[])',
          [routingUpdates],
        ),
      },
    ];
  }

  protected async deploy({
    config,
  }: {
    config: HookConfig;
  }): Promise<DeployedHook> {
    config = HookConfigSchema.parse(config);

    // If it's an address, just return a base Hook
    if (typeof config === 'string') {
      // TODO: https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3773
      // we can remove the ts-ignore once we have a proper type for address Hooks
      // @ts-ignore
      return IPostDispatchHook__factory.connect(
        config,
        this.multiProvider.getSignerOrProvider(this.params.chain),
      );
    }

    switch (config.type) {
      case HookType.MERKLE_TREE:
        return this.deployer.deployContract({
          chain: this.chain,
          contractKey: HookType.MERKLE_TREE,
          constructorArgs: [this.params.addresses.mailbox],
        });
      case HookType.INTERCHAIN_GAS_PAYMASTER:
        return this.deployIgpHook({ config });
      case HookType.AGGREGATION:
        return this.deployAggregationHook({ config });
      case HookType.PROTOCOL_FEE:
        return this.deployProtocolFeeHook({ config });
      case HookType.OP_STACK:
        return this.deployOpStackHook({ config });
      case HookType.ROUTING:
      case HookType.FALLBACK_ROUTING:
        return this.deployRoutingHook({ config });
      case HookType.PAUSABLE: {
        return this.deployPausableHook({ config });
      }
      default:
        throw new Error(`Unsupported hook config: ${config}`);
    }
  }

  protected async deployProtocolFeeHook({
    config,
  }: {
    config: ProtocolFeeHookConfig;
  }): Promise<ProtocolFee> {
    this.logger.debug('Deploying ProtocolFeeHook...');
    return this.deployer.deployContract({
      chain: this.chain,
      contractKey: HookType.PROTOCOL_FEE,
      constructorArgs: [
        config.maxProtocolFee,
        config.protocolFee,
        config.beneficiary,
        config.owner,
      ],
    });
  }

  protected async deployPausableHook({
    config,
  }: {
    config: PausableHookConfig;
  }): Promise<PausableHook> {
    this.logger.debug('Deploying PausableHook...');
    const hook = await this.deployer.deployContract({
      chain: this.chain,
      contractKey: HookType.PAUSABLE,
      constructorArgs: [],
    });

    // transfer ownership
    await this.multiProvider.handleTx(
      this.chain,
      hook.transferOwnership(config.owner, this.txOverrides),
    );

    return hook;
  }

  protected async deployAggregationHook({
    config,
  }: {
    config: AggregationHookConfig;
  }): Promise<StaticAggregationHook> {
    this.logger.debug('Deploying AggregationHook...');

    // deploy subhooks
    const aggregatedHooks = [];
    for (const hookConfig of config.hooks) {
      const { address } = await this.deploy({ config: hookConfig });
      aggregatedHooks.push(address);
    }

    // deploy aggregation hook
    this.logger.debug(
      `Deploying aggregation hook of type ${config.hooks.map((h) =>
        typeof h === 'string' ? h : h.type,
      )}...`,
    );
    const signer = this.multiProvider.getSigner(this.chain);
    const factory = StaticAggregationHookFactory__factory.connect(
      this.params.addresses.staticAggregationHookFactory,
      signer,
    );
    const address = await EvmModuleDeployer.deployStaticAddressSet({
      chain: this.chain,
      factory,
      values: aggregatedHooks,
      logger: this.logger,
      multiProvider: this.multiProvider,
    });

    // return aggregation hook
    return StaticAggregationHook__factory.connect(address, signer);
  }

  protected async deployOpStackHook({
    config,
  }: {
    config: OpStackHookConfig;
  }): Promise<OPStackHook> {
    const chain = this.chain;
    const mailbox = this.params.addresses.mailbox;
    this.logger.debug(
      'Deploying OPStackHook for %s to %s...',
      chain,
      config.destinationChain,
    );

    // fetch l2 messenger address from l1 messenger
    const l1Messenger = IL1CrossDomainMessenger__factory.connect(
      config.nativeBridge,
      this.multiProvider.getSignerOrProvider(chain),
    );
    const l2Messenger: Address = await l1Messenger.OTHER_MESSENGER();
    // deploy opstack ism
    const ismConfig: OpStackIsmConfig = {
      type: IsmType.OP_STACK,
      origin: chain,
      nativeBridge: l2Messenger,
    };

    // deploy opstack ism
    const opStackIsmAddress = (
      await EvmIsmModule.create({
        chain: config.destinationChain,
        config: ismConfig,
        proxyFactoryFactories: this.params.addresses,
        mailbox: mailbox,
        multiProvider: this.multiProvider,
      })
    ).serialize().deployedIsm;

    // connect to ISM
    const opstackIsm = OPStackIsm__factory.connect(
      opStackIsmAddress,
      this.multiProvider.getSignerOrProvider(config.destinationChain),
    );

    // deploy opstack hook
    const hook = await this.deployer.deployContract({
      chain,
      contractKey: HookType.OP_STACK,
      constructorArgs: [
        mailbox,
        this.multiProvider.getDomainId(config.destinationChain),
        addressToBytes32(opstackIsm.address),
        config.nativeBridge,
      ],
    });

    // set authorized hook on opstack ism
    const authorizedHook = await opstackIsm.authorizedHook();
    if (authorizedHook === addressToBytes32(hook.address)) {
      this.logger.debug(
        'Authorized hook already set on ism %s',
        opstackIsm.address,
      );
      return hook;
    } else if (
      authorizedHook !== addressToBytes32(ethers.constants.AddressZero)
    ) {
      this.logger.debug(
        'Authorized hook mismatch on ism %s, expected %s, got %s',
        opstackIsm.address,
        addressToBytes32(hook.address),
        authorizedHook,
      );
      throw new Error('Authorized hook mismatch');
    }

    // check if mismatch and redeploy hook
    this.logger.debug(
      'Setting authorized hook %s on ism % on destination %s',
      hook.address,
      opstackIsm.address,
      config.destinationChain,
    );
    await this.multiProvider.handleTx(
      config.destinationChain,
      opstackIsm.setAuthorizedHook(
        addressToBytes32(hook.address),
        this.multiProvider.getTransactionOverrides(config.destinationChain),
      ),
    );

    return hook;
  }

  protected async deployRoutingHook({
    config,
  }: {
    config: DomainRoutingHookConfig | FallbackRoutingHookConfig;
  }): Promise<DomainRoutingHook> {
    // originally set owner to deployer so we can set hooks
    const deployerAddress = await this.multiProvider.getSignerAddress(
      this.chain,
    );

    let routingHook: DomainRoutingHook | FallbackDomainRoutingHook;
    if (config.type === HookType.FALLBACK_ROUTING) {
      // deploy fallback hook
      const fallbackHook = await this.deploy({ config: config.fallback });
      // deploy routing hook with fallback
      routingHook = await this.deployer.deployContract({
        chain: this.chain,
        contractKey: HookType.FALLBACK_ROUTING,
        constructorArgs: [
          this.params.addresses.mailbox,
          deployerAddress,
          fallbackHook.address,
        ],
      });
    } else {
      // deploy routing hook
      routingHook = await this.deployer.deployContract({
        chain: this.chain,
        contractKey: HookType.ROUTING,
        constructorArgs: [this.params.addresses.mailbox, deployerAddress],
      });
    }

    // compute the hooks that need to be set
    const hooksToSet = await this.computeRoutingHooksToSet({
      currentDomains: {},
      targetDomains: config.domains,
    });

    // set hooks
    await this.multiProvider.handleTx(
      this.chain,
      routingHook.setHooks(hooksToSet, this.txOverrides),
    );

    // transfer ownership
    await this.multiProvider.handleTx(
      this.chain,
      routingHook.transferOwnership(config.owner, this.txOverrides),
    );

    // return a fully configured routing hook
    return routingHook;
  }

  protected async deployIgpHook({
    config,
  }: {
    config: IgpHookConfig;
  }): Promise<InterchainGasPaymaster> {
    this.logger.debug('Deploying IGP as hook...');

    // Deploy the StorageGasOracle
    const storageGasOracle = await this.deployStorageGasOracle({
      config,
    });

    // Deploy the InterchainGasPaymaster
    const interchainGasPaymaster = await this.deployInterchainGasPaymaster({
      storageGasOracle,
      config,
    });

    return interchainGasPaymaster;
  }

  protected async deployInterchainGasPaymaster({
    storageGasOracle,
    config,
  }: {
    storageGasOracle: StorageGasOracle;
    config: IgpConfig;
  }): Promise<InterchainGasPaymaster> {
    // Set the deployer as the owner of the IGP for configuration purposes
    const deployerAddress = await this.multiProvider.getSignerAddress(
      this.chain,
    );

    // Deploy the InterchainGasPaymaster
    const igp = await this.deployer.deployProxiedContract({
      chain: this.chain,
      contractKey: HookType.INTERCHAIN_GAS_PAYMASTER,
      contractName: HookType.INTERCHAIN_GAS_PAYMASTER,
      proxyAdmin: this.params.addresses.proxyAdmin,
      constructorArgs: [],
      initializeArgs: [deployerAddress, config.beneficiary],
    });

    // Obtain the transactions to set the gas params for each remote
    const configureTxs = await this.updateIgpRemoteGasParams({
      interchainGasPaymaster: igp.address,
      gasOracle: storageGasOracle.address,
      targetOverheads: config.overhead,
    });

    // Set the gas params for each remote
    for (const tx of configureTxs) {
      await this.multiProvider.sendTransaction(this.chain, tx);
    }

    // Transfer igp to the configured owner
    await this.multiProvider.handleTx(
      this.chain,
      igp.transferOwnership(config.owner, this.txOverrides),
    );

    return igp;
  }

  protected async deployStorageGasOracle({
    config,
  }: {
    config: IgpConfig;
  }): Promise<StorageGasOracle> {
    // Deploy the StorageGasOracle, by default msg.sender is the owner
    const gasOracle = await this.deployer.deployContract({
      chain: this.chain,
      contractKey: 'storageGasOracle',
      constructorArgs: [],
    });

    // Obtain the transactions to set the gas params for each remote
    const configureTxs = await this.updateStorageGasOracle({
      gasOracle: gasOracle.address,
      targetOracleConfig: config.oracleConfig,
      targetOverhead: config.overhead,
    });

    // Set the gas params for each remote
    for (const tx of configureTxs) {
      await this.multiProvider.sendTransaction(this.chain, tx);
    }

    // Transfer gas oracle to the configured owner
    await this.multiProvider.handleTx(
      this.chain,
      gasOracle.transferOwnership(config.oracleKey, this.txOverrides),
    );

    return gasOracle;
  }
}
