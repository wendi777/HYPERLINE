use std::{cmp::Reverse, collections::BinaryHeap, sync::Arc};

use derive_new::new;
use hyperlane_core::{PendingOperation, PendingOperationStatus, QueueOperation};
use prometheus::{IntGauge, IntGaugeVec};
use tokio::sync::{broadcast::Receiver, Mutex};
use tracing::{debug, info, instrument};

use crate::server::MessageRetryRequest;

/// Queue of generic operations that can be submitted to a destination chain.
/// Includes logic for maintaining queue metrics by the destination and `app_context` of an operation
#[derive(Debug, Clone, new)]
pub struct OpQueue {
    metrics: IntGaugeVec,
    queue_metrics_label: String,
    retry_rx: Arc<Mutex<Receiver<MessageRetryRequest>>>,
    #[new(default)]
    queue: Arc<Mutex<BinaryHeap<Reverse<QueueOperation>>>>,
}

impl OpQueue {
    /// Push an element onto the queue and update metrics
    #[instrument(skip(self), ret, fields(queue_label=%self.queue_metrics_label), level = "debug")]
    pub async fn push(&self, op: QueueOperation, new_status: PendingOperationStatus) {
        // increment the metric before pushing onto the queue, because we lose ownership afterwards
        self.get_operation_metric(op.as_ref()).inc();

        self.queue.lock().await.push(Reverse(op));
    }

    /// Pop an element from the queue and update metrics
    #[instrument(skip(self), ret, fields(queue_label=%self.queue_metrics_label), level = "debug")]
    pub async fn pop(&mut self) -> Option<QueueOperation> {
        let pop_attempt = self.pop_many(1).await;
        pop_attempt.into_iter().next()
    }

    /// Pop multiple elements at once from the queue and update metrics
    #[instrument(skip(self), fields(queue_label=%self.queue_metrics_label), level = "debug")]
    pub async fn pop_many(&mut self, limit: usize) -> Vec<QueueOperation> {
        self.process_retry_requests().await;
        let mut queue = self.queue.lock().await;
        let mut popped = vec![];
        while let Some(Reverse(op)) = queue.pop() {
            // even if the metric is decremented here, the operation may fail to process and be re-added to the queue.
            // in those cases, the queue length will look like it has spikes whose sizes are at most `limit`
            self.get_operation_metric(op.as_ref()).dec();
            popped.push(op);
            if popped.len() >= limit {
                break;
            }
        }
        // This function is called very often by the op_submitter tasks, so only log when there are operations to pop
        // to avoid spamming the logs
        if !popped.is_empty() {
            debug!(
                queue_label = %self.queue_metrics_label,
                operations = ?popped,
                "Popped OpQueue operations"
            );
        }
        popped
    }

    pub async fn process_retry_requests(&mut self) {
        // TODO: could rate-limit ourselves here, but we expect the volume of messages over this channel to
        // be very low.
        // The other consideration is whether to put the channel receiver in the OpQueue or in a dedicated task
        // that also holds an Arc to the Mutex. For simplicity, we'll put it in the OpQueue for now.
        let mut message_retry_requests = vec![];
        while let Ok(message_id) = self.retry_rx.lock().await.try_recv() {
            message_retry_requests.push(message_id);
        }
        if message_retry_requests.is_empty() {
            return;
        }
        let mut queue = self.queue.lock().await;
        let mut reprioritized_queue: BinaryHeap<_> = queue
            .drain()
            .map(|Reverse(mut op)| {
                // Can check for equality here because of the PartialEq implementation for MessageRetryRequest,
                // but can't use `contains` because the types are different
                if message_retry_requests.iter().any(|r| r == op) {
                    info!(
                        operation = %op,
                        queue_label = %self.queue_metrics_label,
                        "Retrying OpQueue operation"
                    );
                    op.reset_attempts()
                }
                Reverse(op)
            })
            .collect();
        queue.append(&mut reprioritized_queue);
    }

    /// Get the metric associated with this operation
    fn get_operation_metric(&self, operation: &dyn PendingOperation) -> IntGauge {
        let (destination, app_context) = operation.get_operation_labels();
        self.metrics
            .with_label_values(&[&destination, &self.queue_metrics_label, &app_context])
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use hyperlane_core::{
        HyperlaneDomain, HyperlaneMessage, KnownHyperlaneDomain, PendingOperationResult,
        TryBatchAs, TxOutcome, H256, U256,
    };
    use std::{
        collections::VecDeque,
        time::{Duration, Instant},
    };
    use tokio::sync;

    #[derive(Debug, Clone)]
    struct MockPendingOperation {
        id: H256,
        seconds_to_next_attempt: u64,
        destination_domain: HyperlaneDomain,
    }

    impl MockPendingOperation {
        fn new(seconds_to_next_attempt: u64, destination_domain: HyperlaneDomain) -> Self {
            Self {
                id: H256::random(),
                seconds_to_next_attempt,
                destination_domain,
            }
        }
    }

    impl TryBatchAs<HyperlaneMessage> for MockPendingOperation {}

    #[async_trait::async_trait]
    impl PendingOperation for MockPendingOperation {
        fn id(&self) -> H256 {
            self.id
        }

        fn status(&self) -> PendingOperationStatus {
            PendingOperationStatus::FirstPrepareAttempt
        }

        fn reset_attempts(&mut self) {
            self.seconds_to_next_attempt = 0;
        }

        fn priority(&self) -> u32 {
            todo!()
        }

        fn get_operation_labels(&self) -> (String, String) {
            Default::default()
        }

        fn origin_domain_id(&self) -> u32 {
            todo!()
        }

        fn destination_domain(&self) -> &HyperlaneDomain {
            &self.destination_domain
        }

        fn app_context(&self) -> Option<String> {
            todo!()
        }

        async fn prepare(&mut self) -> PendingOperationResult {
            todo!()
        }

        /// Submit this operation to the blockchain and report if it was successful
        /// or not.
        async fn submit(&mut self) {
            todo!()
        }

        fn set_submission_outcome(&mut self, _outcome: TxOutcome) {
            todo!()
        }

        fn get_tx_cost_estimate(&self) -> Option<U256> {
            todo!()
        }

        /// This will be called after the operation has been submitted and is
        /// responsible for checking if the operation has reached a point at
        /// which we consider it safe from reorgs.
        async fn confirm(&mut self) -> PendingOperationResult {
            todo!()
        }

        fn set_operation_outcome(
            &mut self,
            _submission_outcome: TxOutcome,
            _submission_estimated_cost: U256,
        ) {
            todo!()
        }

        fn next_attempt_after(&self) -> Option<Instant> {
            Some(
                Instant::now()
                    .checked_add(Duration::from_secs(self.seconds_to_next_attempt))
                    .unwrap(),
            )
        }

        fn set_next_attempt_after(&mut self, _delay: Duration) {
            todo!()
        }

        fn set_retries(&mut self, _retries: u32) {
            todo!()
        }
    }

    fn dummy_metrics_and_label() -> (IntGaugeVec, String) {
        (
            IntGaugeVec::new(
                prometheus::Opts::new("op_queue", "OpQueue metrics"),
                &["destination", "queue_metrics_label", "app_context"],
            )
            .unwrap(),
            "queue_metrics_label".to_string(),
        )
    }

    #[tokio::test]
    async fn test_multiple_op_queues_message_id() {
        let (metrics, queue_metrics_label) = dummy_metrics_and_label();
        let broadcaster = sync::broadcast::Sender::new(100);
        let mut op_queue_1 = OpQueue::new(
            metrics.clone(),
            queue_metrics_label.clone(),
            Arc::new(Mutex::new(broadcaster.subscribe())),
        );
        let mut op_queue_2 = OpQueue::new(
            metrics,
            queue_metrics_label,
            Arc::new(Mutex::new(broadcaster.subscribe())),
        );

        // Add some operations to the queue with increasing `next_attempt_after` values
        let destination_domain: HyperlaneDomain = KnownHyperlaneDomain::Injective.into();
        let messages_to_send = 5;
        let mut ops: VecDeque<_> = (1..=messages_to_send)
            .map(|seconds_to_next_attempt| {
                Box::new(MockPendingOperation::new(
                    seconds_to_next_attempt,
                    destination_domain.clone(),
                )) as QueueOperation
            })
            .collect();
        let op_ids: Vec<_> = ops.iter().map(|op| op.id()).collect();

        // push to queue 1
        for _ in 0..=2 {
            op_queue_1
                .push(
                    ops.pop_front().unwrap(),
                    PendingOperationStatus::FirstPrepareAttempt,
                )
                .await;
        }

        // push to queue 2
        for _ in 3..messages_to_send {
            op_queue_2
                .push(
                    ops.pop_front().unwrap(),
                    PendingOperationStatus::FirstPrepareAttempt,
                )
                .await;
        }

        // Retry by message ids
        broadcaster
            .send(MessageRetryRequest::MessageId(op_ids[1]))
            .unwrap();
        broadcaster
            .send(MessageRetryRequest::MessageId(op_ids[2]))
            .unwrap();

        // Pop elements from queue 1
        let mut queue_1_popped = vec![];
        while let Some(op) = op_queue_1.pop().await {
            queue_1_popped.push(op);
        }

        // The elements sent over the channel should be the first ones popped,
        // regardless of their initial `next_attempt_after`
        assert_eq!(queue_1_popped[0].id(), op_ids[2]);
        assert_eq!(queue_1_popped[1].id(), op_ids[1]);
        assert_eq!(queue_1_popped[2].id(), op_ids[0]);

        // Pop elements from queue 2
        let mut queue_2_popped = vec![];
        while let Some(op) = op_queue_2.pop().await {
            queue_2_popped.push(op);
        }

        // The elements should be popped in the order they were pushed, because there was no retry request for them
        assert_eq!(queue_2_popped[0].id(), op_ids[3]);
        assert_eq!(queue_2_popped[1].id(), op_ids[4]);
    }

    #[tokio::test]
    async fn test_destination_domain() {
        let (metrics, queue_metrics_label) = dummy_metrics_and_label();
        let broadcaster = sync::broadcast::Sender::new(100);
        let mut op_queue = OpQueue::new(
            metrics.clone(),
            queue_metrics_label.clone(),
            Arc::new(Mutex::new(broadcaster.subscribe())),
        );

        // Add some operations to the queue with increasing `next_attempt_after` values
        let destination_domain_1: HyperlaneDomain = KnownHyperlaneDomain::Injective.into();
        let destination_domain_2: HyperlaneDomain = KnownHyperlaneDomain::Ethereum.into();
        let ops = vec![
            Box::new(MockPendingOperation::new(1, destination_domain_1.clone())) as QueueOperation,
            Box::new(MockPendingOperation::new(2, destination_domain_1.clone())) as QueueOperation,
            Box::new(MockPendingOperation::new(3, destination_domain_2.clone())) as QueueOperation,
            Box::new(MockPendingOperation::new(4, destination_domain_2.clone())) as QueueOperation,
            Box::new(MockPendingOperation::new(5, destination_domain_2.clone())) as QueueOperation,
        ];

        let op_ids: Vec<_> = ops.iter().map(|op| op.id()).collect();

        // push to queue
        for op in ops {
            op_queue
                .push(op, PendingOperationStatus::FirstPrepareAttempt)
                .await;
        }

        // Retry by domain
        broadcaster
            .send(MessageRetryRequest::DestinationDomain(
                destination_domain_2.id(),
            ))
            .unwrap();

        // Pop elements from queue
        let mut popped = vec![];
        while let Some(op) = op_queue.pop().await {
            popped.push(op.id());
        }

        // First messages should be those to `destination_domain_2` - their exact order depends on
        // how they were stored in the heap
        assert_eq!(popped[0], op_ids[2]);
        assert_eq!(popped[1], op_ids[4]);
        assert_eq!(popped[2], op_ids[3]);
        // Non-retried messages should be at the end
        assert_eq!(popped[3], op_ids[0]);
        assert_eq!(popped[4], op_ids[1]);
    }
}
