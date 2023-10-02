#![allow(missing_docs)]
use std::num::NonZeroU64;
use std::ops::RangeInclusive;
use std::sync::Arc;

use async_trait::async_trait;
use ethers::prelude::Middleware;
use ethers_core::types::BlockNumber;
use hyperlane_core::accumulator::incremental::IncrementalMerkle;
use tracing::instrument;

use hyperlane_core::{
    ChainCommunicationError, ChainResult, Checkpoint, ContractLocator, HyperlaneChain,
    HyperlaneContract, HyperlaneDomain, HyperlaneProvider, Indexer, LogMeta, MerkleTreeHook,
    MerkleTreeInsertion, SequenceIndexer, H256,
};

use crate::contracts::merkle_tree_hook::MerkleTreeHook as MerkleTreeHookContract;
use crate::trait_builder::BuildableWithProvider;
use crate::EthereumProvider;

pub struct MerkleTreeHookBuilder {}

#[async_trait]
impl BuildableWithProvider for MerkleTreeHookBuilder {
    type Output = Box<dyn MerkleTreeHook>;

    async fn build_with_provider<M: Middleware + 'static>(
        &self,
        provider: M,
        locator: &ContractLocator,
    ) -> Self::Output {
        Box::new(EthereumMerkleTreeHook::new(Arc::new(provider), locator))
    }
}

pub struct MerkleTreeHookIndexerBuilder {
    pub finality_blocks: u32,
}

#[async_trait]
impl BuildableWithProvider for MerkleTreeHookIndexerBuilder {
    type Output = Box<dyn SequenceIndexer<MerkleTreeInsertion>>;

    async fn build_with_provider<M: Middleware + 'static>(
        &self,
        provider: M,
        locator: &ContractLocator,
    ) -> Self::Output {
        Box::new(EthereumMerkleTreeHookIndexer::new(
            Arc::new(provider),
            locator,
            self.finality_blocks,
        ))
    }
}

#[derive(Debug)]
/// Struct that retrieves event data for an Ethereum MerkleTreeHook
pub struct EthereumMerkleTreeHookIndexer<M>
where
    M: Middleware,
{
    contract: Arc<MerkleTreeHookContract<M>>,
    provider: Arc<M>,
    finality_blocks: u32,
}

impl<M> EthereumMerkleTreeHookIndexer<M>
where
    M: Middleware + 'static,
{
    /// Create new EthereumMerkleTreeHookIndexer
    pub fn new(provider: Arc<M>, locator: &ContractLocator, finality_blocks: u32) -> Self {
        Self {
            contract: Arc::new(MerkleTreeHookContract::new(
                locator.address,
                provider.clone(),
            )),
            provider,
            finality_blocks,
        }
    }
}

#[async_trait]
impl<M> Indexer<MerkleTreeInsertion> for EthereumMerkleTreeHookIndexer<M>
where
    M: Middleware + 'static,
{
    #[instrument(err, skip(self))]
    async fn fetch_logs(
        &self,
        range: RangeInclusive<u32>,
    ) -> ChainResult<Vec<(MerkleTreeInsertion, LogMeta)>> {
        let events = self
            .contract
            .inserted_into_tree_filter()
            .from_block(*range.start())
            .to_block(*range.end())
            .query_with_meta()
            .await?;

        let logs = events
            .into_iter()
            .map(|(log, log_meta)| {
                (
                    MerkleTreeInsertion::new(log.index, H256::from(log.message_id)),
                    log_meta.into(),
                )
            })
            .collect();
        Ok(logs)
    }

    #[instrument(level = "debug", err, ret, skip(self))]
    async fn get_finalized_block_number(&self) -> ChainResult<u32> {
        Ok(self
            .provider
            .get_block_number()
            .await
            .map_err(ChainCommunicationError::from_other)?
            .as_u32()
            .saturating_sub(self.finality_blocks))
    }
}

#[async_trait]
impl<M> SequenceIndexer<MerkleTreeInsertion> for EthereumMerkleTreeHookIndexer<M>
where
    M: Middleware + 'static,
{
    async fn sequence_and_tip(&self) -> ChainResult<(Option<u32>, u32)> {
        // The InterchainGasPaymasterIndexerBuilder must return a `SequenceIndexer` type.
        // It's fine if only a blanket implementation is provided for EVM chains, since their
        // indexing only uses the `Index` trait, which is a supertrait of `SequenceIndexer`.
        // TODO: if `SequenceIndexer` turns out to not depend on `Indexer` at all, then the supertrait
        // dependency could be removed, even if the builder would still need to return a type that is both
        // ``SequenceIndexer` and `Indexer`.
        let tip = self.get_finalized_block_number().await?;
        Ok((None, tip))
    }
}

/// A reference to a Mailbox contract on some Ethereum chain
#[derive(Debug)]
pub struct EthereumMerkleTreeHook<M>
where
    M: Middleware,
{
    contract: Arc<MerkleTreeHookContract<M>>,
    domain: HyperlaneDomain,
    provider: Arc<M>,
}

impl<M> EthereumMerkleTreeHook<M>
where
    M: Middleware,
{
    /// Create a reference to a mailbox at a specific Ethereum address on some
    /// chain
    pub fn new(provider: Arc<M>, locator: &ContractLocator) -> Self {
        Self {
            contract: Arc::new(MerkleTreeHookContract::new(
                locator.address,
                provider.clone(),
            )),
            domain: locator.domain.clone(),
            provider,
        }
    }
}

impl<M> HyperlaneChain for EthereumMerkleTreeHook<M>
where
    M: Middleware + 'static,
{
    fn domain(&self) -> &HyperlaneDomain {
        &self.domain
    }

    fn provider(&self) -> Box<dyn HyperlaneProvider> {
        Box::new(EthereumProvider::new(
            self.provider.clone(),
            self.domain.clone(),
        ))
    }
}

impl<M> HyperlaneContract for EthereumMerkleTreeHook<M>
where
    M: Middleware + 'static,
{
    fn address(&self) -> H256 {
        self.contract.address().into()
    }
}

#[async_trait]
impl<M> MerkleTreeHook for EthereumMerkleTreeHook<M>
where
    M: Middleware + 'static,
{
    #[instrument(skip(self))]
    async fn latest_checkpoint(&self, maybe_lag: Option<NonZeroU64>) -> ChainResult<Checkpoint> {
        let lag = maybe_lag.map(|v| v.get()).unwrap_or(0).into();

        let fixed_block_number: BlockNumber = self
            .provider
            .get_block_number()
            .await
            .map_err(ChainCommunicationError::from_other)?
            .saturating_sub(lag)
            .into();

        let (root, index) = self
            .contract
            .latest_checkpoint()
            .block(fixed_block_number)
            .call()
            .await?;
        Ok(Checkpoint {
            mailbox_address: self.address(),
            mailbox_domain: self.domain.id(),
            root: root.into(),
            index,
        })
    }

    #[instrument(skip(self))]
    #[allow(clippy::needless_range_loop)]
    async fn tree(&self, maybe_lag: Option<NonZeroU64>) -> ChainResult<IncrementalMerkle> {
        let lag = maybe_lag.map(|v| v.get()).unwrap_or(0).into();

        let fixed_block_number: BlockNumber = self
            .provider
            .get_block_number()
            .await
            .map_err(ChainCommunicationError::from_other)?
            .saturating_sub(lag)
            .into();

        // TODO: implement From<Tree> for IncrementalMerkle
        let raw_tree = self
            .contract
            .tree()
            .block(fixed_block_number)
            .call()
            .await?;
        let branch = raw_tree
            .branch
            .iter()
            .map(|v| v.into())
            .collect::<Vec<_>>()
            .try_into()
            .unwrap();

        let tree = IncrementalMerkle::new(branch, raw_tree.count.as_usize());

        Ok(tree)
    }

    #[instrument(skip(self))]
    async fn count(&self, maybe_lag: Option<NonZeroU64>) -> ChainResult<u32> {
        let lag = maybe_lag.map(|v| v.get()).unwrap_or(0).into();
        let fixed_block_number: BlockNumber = self
            .provider
            .get_block_number()
            .await
            .map_err(ChainCommunicationError::from_other)?
            .saturating_sub(lag)
            .into();

        let count = self
            .contract
            .count()
            .block(fixed_block_number)
            .call()
            .await?;
        Ok(count)
    }
}
