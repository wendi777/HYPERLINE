use hyperlane_core::ChainCommunicationError;
use starknet::core::{
    types::{FromByteArrayError, FromByteSliceError, FromStrError, ValueOutOfRangeError},
    utils::CairoShortStringToFeltError,
};
use std::fmt::Debug;

/// Errors from the crates specific to the hyperlane-starknet
/// implementation.
/// This error can then be converted into the broader error type
/// in hyperlane-core using the `From` trait impl
#[derive(Debug, thiserror::Error)]
pub enum HyperlaneStarknetError {
    /// Error during string conversion
    #[error(transparent)]
    StringConversionError(#[from] FromStrError),
    /// Short string conversion error
    #[error(transparent)]
    ShortStringConversionError(#[from] CairoShortStringToFeltError),
    /// Error during bytes conversion
    #[error(transparent)]
    BytesConversionError(#[from] FromByteArrayError),
    /// Error during bytes slice conversion
    #[error(transparent)]
    BytesSliceConversionError(#[from] FromByteSliceError),
    /// Out of range value
    #[error(transparent)]
    ValueOutOfRangeError(#[from] ValueOutOfRangeError),
    /// Error during execution of a transaction
    #[error("Error during execution: {0}")]
    AccountError(String),
    /// Transaction receipt is invalid
    #[error("Invalid transaction receipt")]
    InvalidTransactionReceipt,
    /// Block is invalid
    #[error("Invalid block")]
    InvalidBlock,
    /// Error during contract call
    #[error(transparent)]
    ContractCallError(#[from] cainome::cairo_serde::Error),
    /// Error during a Starknet RPC call
    #[error(transparent)]
    ProviderError(#[from] starknet::providers::ProviderError),
}

impl From<HyperlaneStarknetError> for ChainCommunicationError {
    fn from(value: HyperlaneStarknetError) -> Self {
        ChainCommunicationError::from_other(value)
    }
}
