#![allow(clippy::enum_variant_names)]
#![allow(missing_docs)]

use std::{error::Error as StdError, sync::Arc};

use async_trait::async_trait;
use ethers::contract::abigen;
use ethers::core::types::H256;
use eyre::Result;
use tracing::instrument;

use abacus_core::*;
use abacus_core::{ChainCommunicationError, Message, RawCommittedMessage, TxOutcome};

use crate::report_tx::report_tx;

abigen!(
    EthereumOutboxInternal,
    "./chains/abacus-ethereum/abis/Outbox.abi.json"
);

impl<M> std::fmt::Display for EthereumOutboxInternal<M>
where
    M: ethers::providers::Middleware,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Debug)]
/// Struct that retrieves event data for an Ethereum outbox
pub struct EthereumOutboxIndexer<M>
where
    M: ethers::providers::Middleware,
{
    contract: Arc<EthereumOutboxInternal<M>>,
    provider: Arc<M>,
    #[allow(unused)]
    from_height: u32,
    #[allow(unused)]
    chunk_size: u32,
    metrics: Arc<dyn MetricsSubscriber>,
}

impl<M> EthereumOutboxIndexer<M>
where
    M: ethers::providers::Middleware + 'static,
{
    /// Create new EthereumOutboxIndexer
    pub fn new(
        provider: Arc<M>,
        ContractLocator {
            name: _,
            domain: _,
            address,
        }: &ContractLocator,
        from_height: u32,
        chunk_size: u32,
        metrics: Arc<dyn MetricsSubscriber>,
    ) -> Self {
        Self {
            contract: Arc::new(EthereumOutboxInternal::new(address, provider.clone())),
            provider,
            from_height,
            chunk_size,
            metrics,
        }
    }
}

#[async_trait]
impl<M> AbacusCommonIndexer for EthereumOutboxIndexer<M>
where
    M: ethers::providers::Middleware + 'static,
{
    #[instrument(err, skip(self))]
    async fn get_block_number(&self) -> Result<u32> {
        Ok(self.provider.get_block_number().await?.as_u32())
    }

    #[instrument(err, skip(self))]
    async fn fetch_sorted_checkpoints(
        &self,
        from: u32,
        to: u32,
    ) -> Result<Vec<CheckpointWithMeta>> {
        let mut events = self
            .contract
            .checkpoint_filter()
            .from_block(from)
            .to_block(to)
            .query_with_meta()
            .await?;

        events.sort_by(|a, b| {
            let mut ordering = a.1.block_number.cmp(&b.1.block_number);
            if ordering == std::cmp::Ordering::Equal {
                ordering = a.1.transaction_index.cmp(&b.1.transaction_index);
            }

            ordering
        });

        let outbox_domain = self.contract.local_domain().call().await?;

        Ok(events
            .iter()
            .map(|event| {
                let checkpoint = Checkpoint {
                    outbox_domain,
                    root: event.0.root.into(),
                    index: event.0.index.as_u32(),
                };

                CheckpointWithMeta {
                    checkpoint,
                    metadata: CheckpointMeta {
                        block_number: event.1.block_number.as_u64(),
                    },
                }
            })
            .collect())
    }
}

#[async_trait]
impl<M> OutboxIndexer for EthereumOutboxIndexer<M>
where
    M: ethers::providers::Middleware + 'static,
{
    #[instrument(err, skip(self))]
    async fn fetch_sorted_messages(&self, from: u32, to: u32) -> Result<Vec<RawCommittedMessage>> {
        let mut events = self
            .contract
            .dispatch_filter()
            .from_block(from)
            .to_block(to)
            .query()
            .await?;

        events.sort_by(|a, b| a.leaf_index.cmp(&b.leaf_index));

        Ok(events
            .into_iter()
            .map(|f| RawCommittedMessage {
                leaf_index: f.leaf_index.as_u32(),
                message: f.message.to_vec(),
            })
            .collect())
    }
}

/// A reference to an Outbox contract on some Ethereum chain
#[derive(Debug)]
pub struct EthereumOutbox<M>
where
    M: ethers::providers::Middleware,
{
    contract: Arc<EthereumOutboxInternal<M>>,
    domain: u32,
    name: String,
    provider: Arc<M>,
}

impl<M> EthereumOutbox<M>
where
    M: ethers::providers::Middleware + 'static,
{
    /// Create a reference to a outbox at a specific Ethereum address on some
    /// chain
    pub fn new(
        provider: Arc<M>,
        ContractLocator {
            name,
            domain,
            address,
        }: &ContractLocator,
    ) -> Self {
        Self {
            contract: Arc::new(EthereumOutboxInternal::new(address, provider.clone())),
            domain: *domain,
            name: name.to_owned(),
            provider,
        }
    }
}

#[async_trait]
impl<M> AbacusCommon for EthereumOutbox<M>
where
    M: ethers::providers::Middleware + 'static,
{
    fn local_domain(&self) -> u32 {
        self.domain
    }

    fn name(&self) -> &str {
        &self.name
    }

    #[tracing::instrument(err, skip(self))]
    async fn status(&self, txid: H256) -> Result<Option<TxOutcome>, ChainCommunicationError> {
        let receipt_opt = self
            .contract
            .client()
            .get_transaction_receipt(txid)
            .await
            .map_err(|e| Box::new(e) as Box<dyn StdError + Send + Sync>)?;

        Ok(receipt_opt.map(Into::into))
    }

    #[tracing::instrument(err, skip(self))]
    async fn validator_manager(&self) -> Result<H256, ChainCommunicationError> {
        Ok(self.contract.validator_manager().call().await?.into())
    }

    #[tracing::instrument(err, skip(self))]
    async fn checkpointed_root(&self) -> Result<H256, ChainCommunicationError> {
        Ok(self.contract.checkpointed_root().call().await?.into())
    }

    #[tracing::instrument(err, skip(self))]
    async fn latest_checkpoint(
        &self,
        maybe_lag: Option<u64>,
    ) -> Result<Checkpoint, ChainCommunicationError> {
        // This should probably moved into its own trait
        let base_call = self.contract.latest_checkpoint();
        let call_with_lag = match maybe_lag {
            Some(lag) => {
                let tip = self
                    .provider
                    .get_block_number()
                    .await
                    .map_err(|x| ChainCommunicationError::CustomError(Box::new(x)))?
                    .as_u64();
                base_call.block(if lag > tip { 0 } else { tip - lag })
            }
            None => base_call,
        };
        let (root, index) = call_with_lag.call().await?;
        Ok(Checkpoint {
            outbox_domain: self.domain,
            root: root.into(),
            index: index.as_u32(),
        })
    }
}

#[async_trait]
impl<M> Outbox for EthereumOutbox<M>
where
    M: ethers::providers::Middleware + 'static,
{
    #[tracing::instrument(err, skip(self))]
    async fn dispatch(&self, message: &Message) -> Result<TxOutcome, ChainCommunicationError> {
        let tx = self.contract.dispatch(
            message.destination,
            message.recipient.to_fixed_bytes(),
            message.body.clone().into(),
        );

        Ok(report_tx(tx).await?.into())
    }

    #[tracing::instrument(err, skip(self))]
    async fn state(&self) -> Result<State, ChainCommunicationError> {
        let state = self.contract.state().call().await?;
        match state {
            0 => Ok(State::Waiting),
            1 => Ok(State::Failed),
            _ => unreachable!(),
        }
    }

    #[tracing::instrument(err, skip(self))]
    async fn count(&self) -> Result<u32, ChainCommunicationError> {
        Ok(self.contract.count().call().await?.as_u32())
    }

    #[tracing::instrument(err, skip(self))]
    async fn create_checkpoint(&self) -> Result<TxOutcome, ChainCommunicationError> {
        let tx = self.contract.checkpoint();

        Ok(report_tx(tx).await?.into())
    }
}
