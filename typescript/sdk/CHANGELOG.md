# @hyperlane-xyz/sdk

## 3.16.0

### Minor Changes

- 5cc64eb09: Add validator addresses for linea, fraxtal, sei.
  Estimate gas and add 10% buffer inside HyperlaneIsmFactory as well.

### Patch Changes

- f9bbdde76: Fix initial total supply of synthetic token deployments to 0
  - @hyperlane-xyz/core@3.16.0
  - @hyperlane-xyz/utils@3.16.0

## 3.15.1

### Patch Changes

- acaa22cd9: Do not consider xERC20 a collateral standard to fix fungibility checking logic while maintaining mint limit checking
- 921e449b4: Support priorityFee fetching from RPC and some better logging
- Updated dependencies [6620fe636]
  - @hyperlane-xyz/core@3.15.1
  - @hyperlane-xyz/utils@3.15.1

## 3.15.0

### Minor Changes

- 51bfff683: Mint/burn limit checking for xERC20 bridging
  Corrects CLI output for HypXERC20 and HypXERC20Lockbox deployments

### Patch Changes

- Updated dependencies [51bfff683]
  - @hyperlane-xyz/core@3.15.0
  - @hyperlane-xyz/utils@3.15.0

## 3.14.0

### Patch Changes

- Updated dependencies [a8a68f6f6]
  - @hyperlane-xyz/core@3.14.0
  - @hyperlane-xyz/utils@3.14.0

## 3.13.0

### Minor Changes

- 39ea7cdef: Implement multi collateral warp routes
- babe816f8: Support xERC20 and xERC20 Lockbox in SDK and CLI
- 0cf692e73: Implement metadata builder fetching from message

### Patch Changes

- Updated dependencies [babe816f8]
- Updated dependencies [b440d98be]
- Updated dependencies [0cf692e73]
  - @hyperlane-xyz/core@3.13.0
  - @hyperlane-xyz/utils@3.13.0

## 3.12.0

### Minor Changes

- 69de68a66: Implement aggregation and multisig ISM metadata encoding

### Patch Changes

- eba393680: Exports submitter and transformer props types.
- Updated dependencies [69de68a66]
  - @hyperlane-xyz/utils@3.12.0
  - @hyperlane-xyz/core@3.12.0

## 3.11.1

### Patch Changes

- c900da187: Workaround TS bug in Safe protocol-lib
  - @hyperlane-xyz/core@3.11.1
  - @hyperlane-xyz/utils@3.11.1

## 3.11.0

### Minor Changes

- 811ecfbba: Add EvmCoreReader, minor updates.
- f8b6ea467: Update the warp-route-deployment.yaml to a more sensible schema. This schema sets us up to allow multi-chain collateral deployments. Removes intermediary config objects by using zod instead.
- d37cbab72: Adds modular transaction submission support for SDK clients, e.g. CLI.
- b6fdf2f7f: Implement XERC20 and FiatToken collateral warp routes
- 2db77f177: Added RPC `concurrency` property to `ChainMetadata`.
  Added `CrudModule` abstraction and related types.
  Removed `Fuel` ProtocolType.
- 3a08e31b6: Add EvmERC20WarpRouterReader to derive WarpConfig from TokenRouter address
- 917266dce: Add --self-relay to CLI commands
- aab63d466: Adding ICA for governance
- b63714ede: Convert all public hyperlane npm packages from CJS to pure ESM
- 3528b281e: Remove consts such as chainMetadata from SDK
- 450e8e0d5: Migrate fork util from CLI to SDK. Anvil IP & Port are now optionally passed into fork util by client.
- af2634207: Moved Hook/ISM config stringify into a general object stringify utility.

### Patch Changes

- a86a8296b: Removes Gnosis safe util from infra in favor of SDK
- 2e439423e: Allow gasLimit overrides in the SDK/CLI for deploy txs
- Updated dependencies [b6fdf2f7f]
- Updated dependencies [b63714ede]
- Updated dependencies [2b3f75836]
- Updated dependencies [af2634207]
  - @hyperlane-xyz/core@3.11.0
  - @hyperlane-xyz/utils@3.11.0

## 3.10.0

### Minor Changes

- 96485144a: SDK support for ICA deployment and operation.
- 38358ecec: Deprecate Polygon Mumbai testnet (soon to be replaced by Polygon Amoy testnet)
- ed0d4188c: Fixed an issue where warp route verification would fail at deploy time due to a mismatch between the SDK's intermediary contract representation and actual contract name.
  Enabled the ContractVerifier to pick up explorer API keys from the configured chain metadata. This allows users to provide their own explorer API keys in custom `chains.yaml` files.
- 4e7a43be6: Replace Debug logger with Pino

### Patch Changes

- Updated dependencies [96485144a]
- Updated dependencies [38358ecec]
- Updated dependencies [4e7a43be6]
  - @hyperlane-xyz/utils@3.10.0
  - @hyperlane-xyz/core@3.10.0

## 3.9.0

### Minor Changes

- 11f257ebc: Add Yield Routes to CLI

### Patch Changes

- @hyperlane-xyz/core@3.9.0
- @hyperlane-xyz/utils@3.9.0

## 3.8.2

### Patch Changes

- @hyperlane-xyz/core@3.8.2
- @hyperlane-xyz/utils@3.8.2

## 3.8.1

### Patch Changes

- 5daaae274: Prevent warp transfers to zero-ish addresses
- Updated dependencies [5daaae274]
  - @hyperlane-xyz/utils@3.8.1
  - @hyperlane-xyz/core@3.8.1

## 3.8.0

### Minor Changes

- 9681df08d: **New Feature**: Add transaction fee estimators to the SDK
  **Breaking change**: Token Adapter `quoteGasPayment` method renamed to `quoteTransferRemoteGas` for clarity.
- 9681df08d: Remove support for goerli networks (including optimismgoerli, arbitrumgoerli, lineagoerli and polygonzkevmtestnet)
- 9681df08d: Enabled verification of contracts as part of the deployment flow.

  - Solidity build artifact is now included as part of the `@hyperlane-xyz/core` package.
  - Updated the `HyperlaneDeployer` to perform contract verification immediately after deploying a contract. A default verifier is instantiated using the core build artifact.
  - Updated the `HyperlaneIsmFactory` to re-use the `HyperlaneDeployer` for deployment where possible.
  - Minor logging improvements throughout deployers.

- 9681df08d: Add `WarpCore`, `Token`, and `TokenAmount` classes for interacting with Warp Route instances.

  _Breaking change_: The params to the `IHypTokenAdapter` `populateTransferRemoteTx` method have changed. `txValue` has been replaced with `interchainGas`.

### Patch Changes

- 9681df08d: Support configuring non-EVM IGP destinations
- 9681df08d: Removed basegoerli and moonbasealpha testnets
- 9681df08d: Add logos for plume to SDK
- 9681df08d: TestRecipient as part of core deployer
- 9681df08d: Update viction validator set
- 9681df08d: Minor fixes for SDK cosmos logos
- 9681df08d: Implement message id extraction for CosmWasmCoreAdapter
- 9681df08d: Patch transfer ownership in hook deployer
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
  - @hyperlane-xyz/core@3.8.0
  - @hyperlane-xyz/utils@3.8.0

## 3.7.0

### Minor Changes

- 54aeb6420: Added warp route artifacts type adopting registry schema

### Patch Changes

- 6f464eaed: Add logos for injective and nautilus
- 87151c62b: Bumped injective reorg period
- ab17af5f7: Updating HyperlaneIgpDeployer to configure storage gas oracles as part of deployment
- 7b40232af: Remove unhealthy zkevm rpc
  - @hyperlane-xyz/core@3.7.0
  - @hyperlane-xyz/utils@3.7.0

## 3.6.2

### Patch Changes

- @hyperlane-xyz/core@3.6.2
- @hyperlane-xyz/utils@3.6.2

## 3.6.1

### Patch Changes

- ae4476ad0: Bumped mantapacific reorgPeriod to 1, a reorg period in chain metadata is now required by infra.
- f3b7ddb69: Add optional grpcUrl field to ChainMetadata
- e4e4f93fc: Support pausable ISM in deployer and checker
- Updated dependencies [3c298d064]
- Updated dependencies [df24eec8b]
- Updated dependencies [78e50e7da]
- Updated dependencies [e4e4f93fc]
  - @hyperlane-xyz/utils@3.6.1
  - @hyperlane-xyz/core@3.6.1

## 3.6.0

### Minor Changes

- 0488ef31d: Add dsrv, staked and zeeprime as validators
- 8d8ba3f7a: HyperlaneIsmFactory is now wary of (try)getDomainId or (try)getChainName calls which may fail and handles them appropriately.

### Patch Changes

- 67a6d971e: Added `shouldRecover` flag to deployContractFromFactory so that the `TestRecipientDeployer` can deploy new contracts if it's not the owner of the prior deployments (We were recovering the SDK artifacts which meant the deployer won't be able to set the ISM as they needed)
- 612d4163a: Add mailbox version const to SDK
  - @hyperlane-xyz/core@3.6.0
  - @hyperlane-xyz/utils@3.6.0

## 3.5.1

### Patch Changes

- a04454d6d: Use getBalance instead of queryContractSmart for CwTokenAdapter
  - @hyperlane-xyz/core@3.5.1
  - @hyperlane-xyz/utils@3.5.1

## 3.5.0

### Minor Changes

- 655b6a0cd: Redeploy Routing ISM Factories

### Patch Changes

- 08ba0d32b: Remove dead arbitrum goerli explorer link"
- f7d285e3a: Adds Test Recipient addresses to the SDK artifacts
  - @hyperlane-xyz/core@3.5.0
  - @hyperlane-xyz/utils@3.5.0

## 3.4.0

### Minor Changes

- b832e57ae: Replace Fallback and Retry Providers with new SmartProvider with more effective fallback/retry logic

### Patch Changes

- 7919417ec: Granular control of updating predeployed routingIsms based on routing config mismatch
  - Add support for routingIsmDelta which filters out the incompatibility between the onchain deployed config and the desired config.
  - Based on the above, you either update the deployed Ism with new routes, delete old routes, change owners, etc.
  - `moduleMatchesConfig` uses the same
- fd4fc1898: - Upgrade Viem to 1.20.0
  - Add optional restUrls field to ChainMetadata
  - Add deepCopy util function
  - Add support for cosmos factory token addresses
- e06fe0b32: Supporting DefaultFallbackRoutingIsm through non-factory deployments
- 79c96d718: Remove healthy RPC URLs and remove NeutronTestnet
- Updated dependencies [fd4fc1898]
- Updated dependencies [e06fe0b32]
  - @hyperlane-xyz/utils@3.4.0
  - @hyperlane-xyz/core@3.4.0

## 3.3.0

### Patch Changes

- 7e620c9df: Allow CLI to accept hook as a config
- 350175581: Rename StaticProtocolFee hook to ProtocolFee for clarity
- 9f2c7ce7c: Removing agentStartBlocks and using mailbox.deployedBlock() instead
- Updated dependencies [350175581]
  - @hyperlane-xyz/core@3.3.0
  - @hyperlane-xyz/utils@3.3.0

## 3.2.0

### Minor Changes

- df693708b: Add support for all ISM types in CLI interactive config creation

### Patch Changes

- Updated dependencies [df34198d4]
  - @hyperlane-xyz/core@3.2.0
  - @hyperlane-xyz/utils@3.2.0

## 3.1.10

### Patch Changes

- Updated dependencies [c9e0aedae]
  - @hyperlane-xyz/core@3.1.10
  - @hyperlane-xyz/utils@3.1.10
