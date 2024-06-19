# @hyperlane-xyz/infra

## 3.16.0

### Minor Changes

- 5cc64eb09: Add support for new chains: linea, fraxtal, sei.
  Support osmosis remote.
  Drive-by fix to always fetch explorer API keys when running deploy script.

### Patch Changes

- 5cc64eb09: Allow selecting a specific chain to govern in check-deploy script
- Updated dependencies [f9bbdde76]
- Updated dependencies [5cc64eb09]
  - @hyperlane-xyz/sdk@3.16.0
  - @hyperlane-xyz/helloworld@3.16.0
  - @hyperlane-xyz/utils@3.16.0

## 3.15.1

### Patch Changes

- Updated dependencies [6620fe636]
- Updated dependencies [acaa22cd9]
- Updated dependencies [921e449b4]
  - @hyperlane-xyz/helloworld@3.15.1
  - @hyperlane-xyz/sdk@3.15.1
  - @hyperlane-xyz/utils@3.15.1

## 3.15.0

### Patch Changes

- Updated dependencies [51bfff683]
  - @hyperlane-xyz/sdk@3.15.0
  - @hyperlane-xyz/helloworld@3.15.0
  - @hyperlane-xyz/utils@3.15.0

## 3.14.0

### Patch Changes

- @hyperlane-xyz/helloworld@3.14.0
- @hyperlane-xyz/sdk@3.14.0
- @hyperlane-xyz/utils@3.14.0

## 3.13.0

### Minor Changes

- 39ea7cdef: Implement multi collateral warp routes
- 0cf692e73: Implement metadata builder fetching from message

### Patch Changes

- b6b26e2bb: fix: minor change was breaking in registry export
- Updated dependencies [b6b26e2bb]
- Updated dependencies [39ea7cdef]
- Updated dependencies [babe816f8]
- Updated dependencies [0cf692e73]
  - @hyperlane-xyz/helloworld@3.13.0
  - @hyperlane-xyz/sdk@3.13.0
  - @hyperlane-xyz/utils@3.13.0

## 3.12.0

### Patch Changes

- Updated dependencies [eba393680]
- Updated dependencies [69de68a66]
  - @hyperlane-xyz/sdk@3.12.0
  - @hyperlane-xyz/utils@3.12.0
  - @hyperlane-xyz/helloworld@3.12.0

## 3.11.1

### Patch Changes

- Updated dependencies [c900da187]
  - @hyperlane-xyz/sdk@3.11.1
  - @hyperlane-xyz/helloworld@3.11.1
  - @hyperlane-xyz/utils@3.11.1

## 3.11.0

### Minor Changes

- af2634207: Moved Hook/ISM reading into CLI.

### Patch Changes

- a86a8296b: Removes Gnosis safe util from infra in favor of SDK
- Updated dependencies [811ecfbba]
- Updated dependencies [f8b6ea467]
- Updated dependencies [d37cbab72]
- Updated dependencies [b6fdf2f7f]
- Updated dependencies [a86a8296b]
- Updated dependencies [2db77f177]
- Updated dependencies [3a08e31b6]
- Updated dependencies [917266dce]
- Updated dependencies [aab63d466]
- Updated dependencies [2e439423e]
- Updated dependencies [b63714ede]
- Updated dependencies [3528b281e]
- Updated dependencies [450e8e0d5]
- Updated dependencies [2b3f75836]
- Updated dependencies [af2634207]
  - @hyperlane-xyz/sdk@3.11.0
  - @hyperlane-xyz/helloworld@3.11.0
  - @hyperlane-xyz/utils@3.11.0

## 3.10.0

### Minor Changes

- 96485144a: SDK support for ICA deployment and operation.
- 38358ecec: Deprecate Polygon Mumbai testnet (soon to be replaced by Polygon Amoy testnet)
- 4e7a43be6: Replace Debug logger with Pino

### Patch Changes

- Updated dependencies [96485144a]
- Updated dependencies [38358ecec]
- Updated dependencies [ed0d4188c]
- Updated dependencies [4e7a43be6]
  - @hyperlane-xyz/helloworld@3.10.0
  - @hyperlane-xyz/utils@3.10.0
  - @hyperlane-xyz/sdk@3.10.0

## 3.9.0

### Patch Changes

- Updated dependencies [11f257ebc]
  - @hyperlane-xyz/sdk@3.9.0
  - @hyperlane-xyz/helloworld@3.9.0
  - @hyperlane-xyz/utils@3.9.0

## 3.8.2

### Patch Changes

- @hyperlane-xyz/helloworld@3.8.2
- @hyperlane-xyz/sdk@3.8.2
- @hyperlane-xyz/utils@3.8.2

## 3.8.1

### Patch Changes

- Updated dependencies [5daaae274]
  - @hyperlane-xyz/utils@3.8.1
  - @hyperlane-xyz/sdk@3.8.1
  - @hyperlane-xyz/helloworld@3.8.1

## 3.8.0

### Minor Changes

- 9681df08d: Remove support for goerli networks (including optimismgoerli, arbitrumgoerli, lineagoerli and polygonzkevmtestnet)
- 9681df08d: Enabled verification of contracts as part of the deployment flow.

  - Solidity build artifact is now included as part of the `@hyperlane-xyz/core` package.
  - Updated the `HyperlaneDeployer` to perform contract verification immediately after deploying a contract. A default verifier is instantiated using the core build artifact.
  - Updated the `HyperlaneIsmFactory` to re-use the `HyperlaneDeployer` for deployment where possible.
  - Minor logging improvements throughout deployers.

### Patch Changes

- 9681df08d: Removed basegoerli and moonbasealpha testnets
- 9681df08d: Add logos for plume to SDK
- 9681df08d: TestRecipient as part of core deployer
- 9681df08d: Update viction validator set
- 9681df08d: Patch transfer ownership in hook deployer
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
- Updated dependencies [9681df08d]
  - @hyperlane-xyz/sdk@3.8.0
  - @hyperlane-xyz/helloworld@3.8.0
  - @hyperlane-xyz/utils@3.8.0

## 3.7.0

### Minor Changes

- 54aeb6420: Added warp route artifacts type adopting registry schema

### Patch Changes

- 87151c62b: Bumped injective reorg period
- ab17af5f7: Updating HyperlaneIgpDeployer to configure storage gas oracles as part of deployment
- Updated dependencies [6f464eaed]
- Updated dependencies [87151c62b]
- Updated dependencies [ab17af5f7]
- Updated dependencies [7b40232af]
- Updated dependencies [54aeb6420]
  - @hyperlane-xyz/sdk@3.7.0
  - @hyperlane-xyz/helloworld@3.7.0
  - @hyperlane-xyz/utils@3.7.0

## 3.6.2

### Patch Changes

- @hyperlane-xyz/helloworld@3.6.2
- @hyperlane-xyz/sdk@3.6.2
- @hyperlane-xyz/utils@3.6.2

## 3.6.1

### Patch Changes

- ae4476ad0: Bumped mantapacific reorgPeriod to 1, a reorg period in chain metadata is now required by infra.
- e4e4f93fc: Support pausable ISM in deployer and checker
- Updated dependencies [3c298d064]
- Updated dependencies [ae4476ad0]
- Updated dependencies [f3b7ddb69]
- Updated dependencies [df24eec8b]
- Updated dependencies [78e50e7da]
- Updated dependencies [e4e4f93fc]
  - @hyperlane-xyz/utils@3.6.1
  - @hyperlane-xyz/sdk@3.6.1
  - @hyperlane-xyz/helloworld@3.6.1

## 3.6.0

### Patch Changes

- 67a6d971e: Added `shouldRecover` flag to deployContractFromFactory so that the `TestRecipientDeployer` can deploy new contracts if it's not the owner of the prior deployments (We were recovering the SDK artifacts which meant the deployer won't be able to set the ISM as they needed)
- Updated dependencies [67a6d971e]
- Updated dependencies [612d4163a]
- Updated dependencies [0488ef31d]
- Updated dependencies [8d8ba3f7a]
  - @hyperlane-xyz/sdk@3.6.0
  - @hyperlane-xyz/helloworld@3.6.0
  - @hyperlane-xyz/utils@3.6.0

## 3.5.1

### Patch Changes

- Updated dependencies [a04454d6d]
  - @hyperlane-xyz/sdk@3.5.1
  - @hyperlane-xyz/helloworld@3.5.1
  - @hyperlane-xyz/utils@3.5.1

## 3.5.0

### Minor Changes

- 655b6a0cd: Redeploy Routing ISM Factories

### Patch Changes

- f7d285e3a: Adds Test Recipient addresses to the SDK artifacts
- Updated dependencies [655b6a0cd]
- Updated dependencies [08ba0d32b]
- Updated dependencies [f7d285e3a]
  - @hyperlane-xyz/sdk@3.5.0
  - @hyperlane-xyz/helloworld@3.5.0
  - @hyperlane-xyz/utils@3.5.0

## 3.4.0

### Patch Changes

- e06fe0b32: Supporting DefaultFallbackRoutingIsm through non-factory deployments
- Updated dependencies [7919417ec]
- Updated dependencies [fd4fc1898]
- Updated dependencies [e06fe0b32]
- Updated dependencies [b832e57ae]
- Updated dependencies [79c96d718]
  - @hyperlane-xyz/sdk@3.4.0
  - @hyperlane-xyz/utils@3.4.0
  - @hyperlane-xyz/helloworld@3.4.0

## 3.3.0

### Patch Changes

- 7e620c9df: Allow CLI to accept hook as a config
- 9f2c7ce7c: Removing agentStartBlocks and using mailbox.deployedBlock() instead
- Updated dependencies [7e620c9df]
- Updated dependencies [350175581]
- Updated dependencies [9f2c7ce7c]
  - @hyperlane-xyz/sdk@3.3.0
  - @hyperlane-xyz/helloworld@3.3.0
  - @hyperlane-xyz/utils@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [df693708b]
  - @hyperlane-xyz/sdk@3.2.0
  - @hyperlane-xyz/helloworld@3.2.0
  - @hyperlane-xyz/utils@3.2.0

## 3.1.10

### Patch Changes

- Updated dependencies [c9e0aedae]
  - @hyperlane-xyz/helloworld@3.1.10
  - @hyperlane-xyz/sdk@3.1.10
  - @hyperlane-xyz/utils@3.1.10
