use std::any::Any;
use std::error::Error as StdError;
use std::fmt::{Debug, Display, Formatter};
use std::ops::Deref;

use crate::config::StrOrIntParseError;
use cosmrs::proto::prost;
use cosmrs::Error as CosmrsError;
// use fixed_hash::rustc_hex::FromHexError;
use std::string::FromUtf8Error;

use crate::HyperlaneProviderError;
use crate::H256;

/// The result of interacting with a chain.
pub type ChainResult<T> = Result<T, ChainCommunicationError>;

/// An "Any"-typed error.
pub trait HyperlaneCustomError: StdError + Send + Sync + Any {}

impl<E: StdError + Send + Sync + Any> HyperlaneCustomError for E {}

/// Thin wrapper around a boxed HyperlaneCustomError; required to satisfy
/// AsDynError implementations. Basically a trait-object adaptor.
#[repr(transparent)]
pub struct HyperlaneCustomErrorWrapper(Box<dyn HyperlaneCustomError>);

impl Debug for HyperlaneCustomErrorWrapper {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", AsRef::<dyn HyperlaneCustomError>::as_ref(&self))
    }
}

impl Display for HyperlaneCustomErrorWrapper {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", AsRef::<dyn HyperlaneCustomError>::as_ref(&self))
    }
}

impl StdError for HyperlaneCustomErrorWrapper {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.0.source()
    }
}

impl AsRef<dyn HyperlaneCustomError> for HyperlaneCustomErrorWrapper {
    fn as_ref(&self) -> &dyn HyperlaneCustomError {
        self.0.as_ref()
    }
}

impl Deref for HyperlaneCustomErrorWrapper {
    type Target = Box<dyn HyperlaneCustomError>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// ChainCommunicationError contains errors returned when attempting to
/// call a chain or dispatch a transaction
#[derive(Debug, thiserror::Error)]
pub enum ChainCommunicationError {
    /// Hyperlane Error
    #[error(transparent)]
    HyperlaneProtocolError(#[from] HyperlaneProtocolError),
    /// An error with a contract call
    #[error(transparent)]
    ContractError(HyperlaneCustomErrorWrapper),
    /// A transaction was dropped from the mempool
    #[error("Transaction dropped from mempool {0:?}")]
    TransactionDropped(H256),
    /// Any other error; does not implement `From` to prevent
    /// conflicting/absorbing other errors.
    #[error(transparent)]
    Other(HyperlaneCustomErrorWrapper),
    /// A transaction submission timed out
    #[error("Transaction submission timed out")]
    TransactionTimeout(),
    /// No signer is available and was required for the operation
    #[error("Signer unavailable")]
    SignerUnavailable,
    /// Failed to parse strings or integers
    #[error("Data parsing error {0:?}")]
    StrOrIntParseError(#[from] StrOrIntParseError),
    /// Tendermint RPC Error
    #[error(transparent)]
    TendermintError(#[from] tendermint_rpc::error::Error),
    /// BlockNotFoundError
    #[error("Block not found: {0:?}")]
    BlockNotFound(H256),
    /// Cosmrs library error
    #[error("{0}")]
    Cosmrs(#[from] CosmrsError),
    /// Cosmrs ErrorReport
    #[error("{0}")]
    CosmrsErrorReport(#[from] cosmrs::ErrorReport),
    #[error("{0}")]
    /// Cosmrs Tendermint Error
    CosmrsTendermintError(#[from] cosmrs::tendermint::Error),
    /// Tonic error
    #[error("{0}")]
    Tonic(#[from] tonic::transport::Error),
    /// protobuf error
    #[error("{0}")]
    Protobuf(#[from] prost::DecodeError),
    /// base64 error
    #[error("{0}")]
    Base64(#[from] base64::DecodeError),
    /// utf8 error
    #[error("{0}")]
    Utf8(#[from] FromUtf8Error),
    /// Serde JSON error
    #[error("{0}")]
    JsonParseError(#[from] serde_json::Error),
    /// String hex parsing error
    #[error("{0}")]
    HexParseError(#[from] hex::FromHexError),
    /// Uint hex parsing error
    #[error("{0}")]
    UintParseError(#[from] uint::FromHexError),
    /// Decimal string parsing error
    #[error("{0}")]
    FromDecStrError(#[from] uint::FromDecStrErr),
    /// Int string parsing error
    #[error("{0}")]
    ParseIntError(#[from] std::num::ParseIntError),
    /// Hash string parsing error
    #[error("{0}")]
    HashParsingError(#[from] fixed_hash::rustc_hex::FromHexError),
    /// Invalid Request
    #[error("Invalid Request: {msg:?}")]
    InvalidRequest {
        /// Error message
        msg: String,
    },
    /// Parse Error
    #[error("ParseError: {msg:?}")]
    ParseError {
        /// Error message
        msg: String,
    },
    /// Failed to estimate transaction gas cost.
    #[error("Failed to estimate transaction gas cost {0}")]
    TxCostEstimateError(String),
}

impl ChainCommunicationError {
    /// Create a chain communication error from any other existing error
    pub fn from_other<E: HyperlaneCustomError>(err: E) -> Self {
        Self::Other(HyperlaneCustomErrorWrapper(Box::new(err)))
    }

    /// Create a chain communication error from any other existing error
    pub fn from_other_boxed<E: HyperlaneCustomError>(err: Box<E>) -> Self {
        Self::Other(HyperlaneCustomErrorWrapper(err))
    }

    /// Creates a chain communication error of the other error variant from a static string
    pub fn from_other_str(err: &'static str) -> Self {
        #[derive(Debug)]
        #[repr(transparent)]
        struct StringError(&'static str);
        impl Display for StringError {
            fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.0)
            }
        }
        impl StdError for StringError {}

        Self::from_contract_error(StringError(err))
    }

    /// Creates a chain communication error of the contract error variant from any other existing
    /// error
    pub fn from_contract_error<E>(err: E) -> Self
    where
        E: HyperlaneCustomError,
    {
        Self::ContractError(HyperlaneCustomErrorWrapper(Box::new(err)))
    }

    /// Creates a chain communication error of the contract error variant from any other existing
    /// error
    pub fn from_contract_error_boxed<E>(err: Box<E>) -> Self
    where
        E: HyperlaneCustomError,
    {
        Self::ContractError(HyperlaneCustomErrorWrapper(err))
    }

    /// Creates a chain communication error of the contract error variant from a static string
    pub fn from_contract_error_str(err: &'static str) -> Self {
        #[derive(Debug)]
        #[repr(transparent)]
        struct StringError(&'static str);
        impl Display for StringError {
            fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.0)
            }
        }
        impl StdError for StringError {}

        Self::from_contract_error(StringError(err))
    }
}

impl From<HyperlaneProviderError> for ChainCommunicationError {
    fn from(e: HyperlaneProviderError) -> Self {
        Self::from_other(e)
    }
}

#[cfg(feature = "ethers")]
impl<T: ethers_providers::Middleware + 'static> From<ethers_contract::ContractError<T>>
    for ChainCommunicationError
{
    fn from(err: ethers_contract::ContractError<T>) -> Self {
        Self::ContractError(HyperlaneCustomErrorWrapper(Box::new(err)))
    }
}

#[cfg(feature = "ethers")]
impl From<ethers_providers::ProviderError> for ChainCommunicationError {
    fn from(err: ethers_providers::ProviderError) -> Self {
        Self::ContractError(HyperlaneCustomErrorWrapper(Box::new(err)))
    }
}

/// Error types for the Hyperlane protocol
#[derive(Debug, thiserror::Error)]
pub enum HyperlaneProtocolError {
    /// Signature Error pasthrough
    #[cfg(feature = "ethers")]
    #[error(transparent)]
    SignatureError(#[from] ethers_core::types::SignatureError),
    /// IO error from Read/Write usage
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    /// An unknown or invalid domain id was encountered
    #[error("Unknown or invalid domain ID ({0})")]
    UnknownDomainId(u32),
    /// Expected a gas limit and none was provided
    #[error("A gas limit was expected for `process` contract call")]
    ProcessGasLimitRequired,
}
