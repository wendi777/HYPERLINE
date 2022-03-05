/// Mock outbox contract
pub mod outbox;

/// Mock inbox contract
pub mod inbox;

/// Mock home contract
pub mod home;

/// Mock replica contract
pub mod replica;

/// Mock indexer
pub mod indexer;

/// Mock connection manager contract
pub mod xapp;

pub use home::MockHomeContract;
pub use indexer::MockIndexer;
pub use outbox::MockOutboxContract;
pub use replica::MockReplicaContract;
pub use xapp::MockConnectionManagerContract;
