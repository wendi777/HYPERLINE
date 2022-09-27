use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use eyre::Result;
use sea_orm::{Database, DbConn};
use tokio::task::JoinHandle;
use tracing::instrument::Instrumented;
use tracing::{info_span, Instrument};

use abacus_base::{
    run_all, BaseAgent, ChainSetup, ContractSyncMetrics, CoreMetrics, IndexSettings,
    OutboxAddresses, Settings,
};
use abacus_core::{AbacusCommon, AbacusContract, Outbox, OutboxIndexer};

use crate::scraper::block_cursor::BlockCursor;
use crate::settings::ScraperSettings;

mod block_cursor;

/// A message explorer scraper agent
#[derive(Debug)]
pub struct Scraper {
    metrics: Arc<CoreMetrics>,
    /// A map of outbox contracts by name.
    outboxes: HashMap<String, SqlOutboxScraper>,
    inboxes: HashMap<String, ()>,
    gas_paymasters: HashMap<String, ()>,
}

#[async_trait]
impl BaseAgent for Scraper {
    const AGENT_NAME: &'static str = "scraper";
    type Settings = ScraperSettings;

    fn metrics(&self) -> &Arc<CoreMetrics> {
        &self.metrics
    }

    async fn from_settings(settings: Self::Settings) -> Result<Self>
    where
        Self: Sized,
    {
        let core_settings: Settings = settings.base;
        let metrics = core_settings.try_into_metrics(Self::AGENT_NAME)?;

        let db = Database::connect(&core_settings.db).await?;
        let outboxes =
            Self::load_outboxes(&db, &core_settings, settings.outboxes, &metrics).await?;
        let inboxes = Self::load_inboxes(&db, &core_settings, &metrics).await?;
        let gas_paymasters = Self::load_gas_paymasters(&db, &core_settings, &metrics).await?;
        Ok(Self {
            metrics,
            outboxes,
            inboxes,
            gas_paymasters,
        })
    }

    #[allow(clippy::async_yields_async)]
    async fn run(&self) -> Instrumented<JoinHandle<Result<()>>> {
        let tasks = self
            .outboxes
            .iter()
            .map(|(name, outbox)| {
                let span = info_span!("OutboxContractSync", %name, self = ?outbox);
                let syncer = outbox.clone().sync();
                tokio::spawn(syncer).instrument(span)
            })
            .collect();

        run_all(tasks)
    }
}

impl Scraper {
    async fn load_outboxes(
        db: &DbConn,
        core_settings: &Settings,
        config: HashMap<String, ChainSetup<OutboxAddresses>>,
        metrics: &Arc<CoreMetrics>,
    ) -> Result<HashMap<String, SqlOutboxScraper>> {
        let contract_sync_metrics = ContractSyncMetrics::new(metrics.clone());
        let mut outboxes = HashMap::new();
        for (name, outbox_setup) in config {
            let signer = core_settings.get_signer(&name).await;
            let outbox = core_settings
                .outbox
                .try_into_outbox(signer, metrics)
                .await?;
            let indexer = core_settings
                .try_outbox_indexer_from_config(metrics, &outbox_setup)
                .await?;
            outboxes.insert(
                name,
                SqlOutboxScraper::new(
                    db.clone(),
                    outbox.into(),
                    indexer.into(),
                    core_settings.index.clone(),
                    contract_sync_metrics.clone(),
                )
                .await?,
            );
        }
        Ok(outboxes)
    }

    async fn load_inboxes(
        _db: &DbConn,
        _core_settings: &Settings,
        _metrics: &Arc<CoreMetrics>,
    ) -> Result<HashMap<String, ()>> {
        todo!()
    }

    async fn load_gas_paymasters(
        _db: &DbConn,
        _core_settings: &Settings,
        _metrics: &Arc<CoreMetrics>,
    ) -> Result<HashMap<String, ()>> {
        todo!()
    }
}

const MESSAGES_LABEL: &str = "messages";

#[derive(Debug, Clone)]
struct SqlOutboxScraper {
    db: DbConn,
    outbox: Arc<dyn Outbox>,
    indexer: Arc<dyn OutboxIndexer>,
    index_settings: IndexSettings,
    metrics: ContractSyncMetrics,
    cursor: Arc<BlockCursor>,
}

impl SqlOutboxScraper {
    pub async fn new(
        db: DbConn,
        outbox: Arc<dyn Outbox>,
        indexer: Arc<dyn OutboxIndexer>,
        index_settings: IndexSettings,
        metrics: ContractSyncMetrics,
    ) -> Result<Self> {
        let cursor = Arc::new(
            BlockCursor::new(
                db.clone(),
                outbox.local_domain(),
                index_settings
                    .from
                    .as_deref()
                    .map(|n| n.parse())
                    .transpose()?
                    .unwrap_or(0u64),
            )
            .await?,
        );
        Ok(Self {
            db,
            outbox,
            indexer,
            index_settings,
            metrics,
            cursor,
        })
    }

    pub async fn sync(self) -> Result<()> {
        use sea_orm::prelude::*;

        let labels = [MESSAGES_LABEL, &self.outbox.chain_name()];
        let indexed_height = self.metrics.indexed_height.with_label_values(&labels);
        let stored_messages = self.metrics.stored_events.with_label_values(&labels);
        let missed_messages = self.metrics.missed_events.with_label_values(&labels);
        let message_leaf_index = self.metrics.message_leaf_index.clone();

        let mut from_block = self.cursor.height().await;

        loop {
            todo!()
        }
    }
}

// struct SqlContractSync<I> {
//     chain_name: String,
//     db: DbConn,
//     indexer: I,
//     index_settings: IndexSettings,
//     metrics: ContractSyncMetrics,
// }
