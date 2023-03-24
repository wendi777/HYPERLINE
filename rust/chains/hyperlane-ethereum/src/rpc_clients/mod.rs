use ethers::providers::HttpClientError;
use tracing::{info, trace, warn};

pub use self::{fallback::*, retrying::*};

mod fallback;
mod retrying;

enum CategorizedResponse<R> {
    IsOk(R),
    /// An error that is (probably) not our fault
    RetryableErr(HttpClientError),
    /// retryable error, but caller should backoff
    RateLimitErr(HttpClientError),
    /// An error that will (probably) keep happening no matter how many times we
    /// retry
    NonRetryableErr(HttpClientError),
}

const METHODS_TO_NOT_RETRY: &[&str] = &["eth_estimateGas"];
const METHOD_TO_NOT_RETRY_WHEN_NOT_SUPPORTED: &[&str] = &["eth_feeHistory"];
const METHODS_TO_NOT_RETRY_ON_REVERT: &[&str] = &["eth_call"];
const METHODS_TO_NOT_RETRY_ON_NONCE_ERROR: &[&str] =
    &["eth_sendRawTransaction", "eth_sendTransaction"];
const METHODS_TO_NOT_RETRY_ON_ALREADY_KNOWN: &[&str] =
    &["eth_sendRawTransaction", "eth_sendTransaction"];

/// Figure out how best to handle a response from an HTTP client.
///
/// Caller is responsible for adding a log span with additional context.
fn categorize_client_response<R>(
    method: &str,
    resp: Result<R, HttpClientError>,
) -> CategorizedResponse<R> {
    use CategorizedResponse::*;
    use HttpClientError::*;
    match resp {
        Ok(res) => {
            trace!("Received Ok response from http client");
            IsOk(res)
        }
        Err(ReqwestError(e)) => {
            warn!(error=%e, "ReqwestError in http provider");
            RetryableErr(ReqwestError(e))
        }
        Err(SerdeJson { err, text }) => {
            if text.contains("429") {
                warn!(error=%err, text, "Received rate limit request SerdeJson error in http provider");
                RateLimitErr(SerdeJson { err, text })
            } else {
                warn!(error=%err, text, "SerdeJson error in http provider");
                RetryableErr(SerdeJson { err, text })
            }
        }
        Err(JsonRpcError(e)) => {
            let msg = e.message.to_ascii_lowercase();
            if e.code == 429 || msg.contains("rate limit") || msg.contains("ratelimit") {
                info!(error=%e, "Received rate limit request JsonRpcError in http provider");
                RateLimitErr(JsonRpcError(e))
            } else if METHODS_TO_NOT_RETRY.contains(&method)
                || (METHOD_TO_NOT_RETRY_WHEN_NOT_SUPPORTED.contains(&method)
                    && msg.contains("support"))
                || (METHODS_TO_NOT_RETRY_ON_REVERT.contains(&method) && msg.contains("revert"))
                || (METHODS_TO_NOT_RETRY_ON_ALREADY_KNOWN.contains(&method)
                    && msg.contains("known"))
                || (METHODS_TO_NOT_RETRY_ON_NONCE_ERROR.contains(&method) && msg.contains("nonce"))
            {
                // We don't want to retry errors that are probably not going to work if we keep
                // retrying them or that indicate an error in higher-order logic and not
                // transient provider (connection or other) errors.
                warn!(error=%e, "Non-retryable JsonRpcError in http provider");
                NonRetryableErr(JsonRpcError(e))
            } else {
                // the assumption is this is not a "provider error" but rather an invalid
                // request, e.g. nonce too low, not enough gas, ...
                info!(error=%e, "Retryable JsonRpcError in http provider");
                RetryableErr(JsonRpcError(e))
            }
        }
    }
}
