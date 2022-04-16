use abacus_core::db::DB;
use futures_util::FutureExt;
use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};
use std::{future::Future, panic};

use rocksdb::Options;

pub fn setup_db(db_path: String) -> DB {
    let mut opts = Options::default();
    opts.create_if_missing(true);
    rocksdb::DB::open(&opts, db_path)
        .expect("Failed to open db path")
        .into()
}

pub async fn run_test_db<T, Fut>(test: T)
where
    T: FnOnce(DB) -> Fut + panic::UnwindSafe,
    Fut: Future<Output = ()>,
{
    // RocksDB only allows one unique db handle to be open at a time. Because
    // `cargo test` is multithreaded by default, we use random db pathnames to
    // avoid collisions between 2+ threads
    let rand_path: String = thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect();
    let result = {
        let db = setup_db(rand_path.clone());

        let func = panic::AssertUnwindSafe(async { test(db).await });
        func.catch_unwind().await
    };
    let _ = rocksdb::DB::destroy(&Options::default(), rand_path);
    assert!(result.is_ok())
}

#[cfg(test)]
mod test {
    use super::*;
    use abacus_core::{
        accumulator::merkle::Proof, db::AbacusDB, AbacusMessage, Encode, RawCommittedMessage,
    };
    use ethers::types::H256;

    #[tokio::test]
    async fn db_stores_and_retrieves_messages() {
        run_test_db(|db| async move {
            let outbox_name = "outbox_1".to_owned();
            let db = AbacusDB::new(outbox_name, db);

            let m = AbacusMessage {
                origin: 10,
                sender: H256::from_low_u64_be(4),
                destination: 12,
                recipient: H256::from_low_u64_be(5),
                body: vec![1, 2, 3],
            };

            let message = RawCommittedMessage {
                leaf_index: 100,
                committed_root: H256::from_low_u64_be(3),
                message: m.to_vec(),
            };
            assert_eq!(m.to_leaf(), message.leaf());

            db.store_raw_committed_message(&message).unwrap();

            let by_leaf = db.message_by_leaf(message.leaf()).unwrap().unwrap();
            assert_eq!(by_leaf, message);

            let by_index = db
                .message_by_leaf_index(message.leaf_index)
                .unwrap()
                .unwrap();
            assert_eq!(by_index, message);
        })
        .await;
    }

    #[tokio::test]
    async fn db_stores_and_retrieves_proofs() {
        run_test_db(|db| async move {
            let outbox_name = "outbox_1".to_owned();
            let db = AbacusDB::new(outbox_name, db);

            let proof = Proof {
                leaf: H256::from_low_u64_be(15),
                index: 32,
                path: Default::default(),
            };
            db.store_proof(13, &proof).unwrap();

            let by_index = db.proof_by_leaf_index(13).unwrap().unwrap();
            assert_eq!(by_index, proof);
        })
        .await;
    }
}
