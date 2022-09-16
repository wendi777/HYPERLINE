use std::{convert::TryFrom, str::FromStr};

use ethers::signers::Signer;
use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use serde::Deserialize;

use abacus_core::{
    AbacusAbi, ContractLocator, Inbox, InboxValidatorManager, InterchainGasPaymaster, Outbox,
    Signers,
};
use abacus_ethereum::{
    Connection, EthereumInboxAbi, EthereumInterchainGasPaymasterAbi, EthereumOutboxAbi,
    InboxBuilder, InboxValidatorManagerBuilder, InterchainGasPaymasterBuilder,
    MakeableWithProvider, OutboxBuilder,
};
use ethers_prometheus::middleware::{
    ChainInfo, ContractInfo, PrometheusMiddlewareConf, WalletInfo,
};
use strum_macros::EnumString;

use crate::CoreMetrics;

/// A connection to _some_ blockchain.
///
/// Specify the chain name (enum variant) in toml under the `chain` key
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "rpcStyle", content = "connection", rename_all = "camelCase")]
pub enum ChainConf {
    /// Ethereum configuration
    Ethereum(Connection),
}

impl Default for ChainConf {
    fn default() -> Self {
        Self::Ethereum(Default::default())
    }
}

/// Ways in which transactions can be submitted to a blockchain.
#[derive(Copy, Clone, Debug, Default, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TransactionSubmissionType {
    /// Use the configured signer to sign and submit transactions in the "default" manner.
    #[default]
    Signer,
    /// Submit transactions via the Gelato relay.
    Gelato,
}

/// Configuration for using the Gelato Relay to interact with some chain.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GelatoConf {
    /// The sponsor API key for submitting sponsored calls
    pub sponsorapikey: String,
}

/// Addresses for outbox chain contracts
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OutboxAddresses {
    /// Address of the Outbox contract
    pub outbox: String,
    /// Address of the InterchainGasPaymaster contract
    pub interchain_gas_paymaster: Option<String>,
}

/// Addresses for inbox chain contracts
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InboxAddresses {
    /// Address of the Inbox contract
    pub inbox: String,
    /// Address of the InboxValidatorManager contract
    pub validator_manager: String,
}

/// A chain setup is a domain ID, an address on that chain (where the outbox or
/// inbox is deployed) and details for connecting to the chain API.
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChainSetup<T> {
    /// Chain name
    pub name: String,
    /// Chain domain identifier
    pub domain: String,
    /// Number of blocks until finality
    pub finality_blocks: String,
    /// Addresses of contracts on the chain
    pub addresses: T,
    /// The chain connection details
    #[serde(flatten)]
    pub chain: ChainConf,
    /// How transactions to this chain are submitted.
    #[serde(default)]
    pub txsubmission: TransactionSubmissionType,
    /// Set this key to disable the inbox. Does nothing for outboxes.
    #[serde(default)]
    pub disabled: Option<String>,
    /// Configure chain-specific metrics information. This will automatically
    /// add all contract addresses but will not override any set explicitly.
    /// Use `metrics_conf()` to get the metrics.
    #[serde(default)]
    pub metrics_conf: PrometheusMiddlewareConf,
}

impl<T> ChainSetup<T> {
    /// Get the number of blocks until finality
    pub fn finality_blocks(&self) -> u32 {
        self.finality_blocks
            .parse::<u32>()
            .expect("could not parse finality_blocks")
    }
}

impl ChainSetup<OutboxAddresses> {
    /// Try to convert the chain setting into an Outbox contract
    pub async fn try_into_outbox(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> eyre::Result<Box<dyn Outbox>> {
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(OutboxBuilder {}
                .make_with_connection(
                    conf.clone(),
                    &ContractLocator {
                        chain_name: self.name.clone(),
                        domain: self.domain.parse().expect("invalid uint"),
                        address: self
                            .addresses
                            .outbox
                            .parse::<ethers::types::Address>()?
                            .into(),
                    },
                    signer,
                    Some(|| metrics.json_rpc_client_metrics()),
                    Some((metrics.provider_metrics(), self.metrics_conf())),
                )
                .await?),
        }
    }

    /// Try to convert the chain setting into an InterchainGasPaymaster contract
    pub async fn try_into_interchain_gas_paymaster(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> eyre::Result<Option<Box<dyn InterchainGasPaymaster>>> {
        let paymaster_address = if let Some(address) = &self.addresses.interchain_gas_paymaster {
            address
        } else {
            return Ok(None);
        };
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(Some(
                InterchainGasPaymasterBuilder {}
                    .make_with_connection(
                        conf.clone(),
                        &ContractLocator {
                            chain_name: self.name.clone(),
                            domain: self.domain.parse().expect("invalid uint"),
                            address: paymaster_address.parse::<ethers::types::Address>()?.into(),
                        },
                        signer,
                        Some(|| metrics.json_rpc_client_metrics()),
                        Some((metrics.provider_metrics(), self.metrics_conf())),
                    )
                    .await?,
            )),
        }
    }

    /// Get a clone of the metrics conf with correctly configured contract
    /// information.
    pub fn metrics_conf(&self) -> PrometheusMiddlewareConf {
        let mut cfg = self.metrics_conf.clone();

        if cfg.chain.is_none() {
            cfg.chain = Some(ChainInfo {
                name: Some(self.name.clone()),
            });
        }

        if let Ok(addr) = self.addresses.outbox.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("outbox".into()),
                functions: EthereumOutboxAbi::fn_map_owned(),
            });
        }
        if let Some(igp) = &self.addresses.interchain_gas_paymaster {
            if let Ok(addr) = igp.parse() {
                cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                    name: Some("igp".into()),
                    functions: EthereumInterchainGasPaymasterAbi::fn_map_owned(),
                });
            }
        }
        cfg
    }
}

impl ChainSetup<InboxAddresses> {
    /// Try to convert the chain setting into an inbox contract
    pub async fn try_into_inbox(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> eyre::Result<Box<dyn Inbox>> {
        let metrics_conf = self.metrics_conf(metrics.agent_name(), &signer);
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(InboxBuilder {}
                .make_with_connection(
                    conf.clone(),
                    &ContractLocator {
                        chain_name: self.name.clone(),
                        domain: self.domain.parse().expect("invalid uint"),
                        address: self
                            .addresses
                            .inbox
                            .parse::<ethers::types::Address>()?
                            .into(),
                    },
                    signer,
                    Some(|| metrics.json_rpc_client_metrics()),
                    Some((metrics.provider_metrics(), metrics_conf)),
                )
                .await?),
        }
    }

    /// Try to convert the chain setting into an InboxValidatorManager contract
    pub async fn try_into_inbox_validator_manager(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> eyre::Result<Box<dyn InboxValidatorManager>> {
        let inbox_address = self.addresses.inbox.parse::<ethers::types::Address>()?;
        let metrics_conf = self.metrics_conf(metrics.agent_name(), &signer);
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(InboxValidatorManagerBuilder { inbox_address }
                .make_with_connection(
                    conf.clone(),
                    &ContractLocator {
                        chain_name: self.name.clone(),
                        domain: self.domain.parse().expect("invalid uint"),
                        address: self
                            .addresses
                            .validator_manager
                            .parse::<ethers::types::Address>()?
                            .into(),
                    },
                    signer,
                    Some(|| metrics.json_rpc_client_metrics()),
                    Some((metrics.provider_metrics(), metrics_conf)),
                )
                .await?),
        }
    }

    /// Get a clone of the metrics conf with correctly configured contract
    /// information.
    pub fn metrics_conf(
        &self,
        agent_name: &str,
        signer: &Option<Signers>,
    ) -> PrometheusMiddlewareConf {
        let mut cfg = self.metrics_conf.clone();

        if cfg.chain.is_none() {
            cfg.chain = Some(ChainInfo {
                name: Some(self.name.clone()),
            });
        }

        if let Some(signer) = signer {
            cfg.wallets
                .entry(signer.address())
                .or_insert_with(|| WalletInfo {
                    name: Some(agent_name.into()),
                });
        }
        if let Ok(addr) = self.addresses.inbox.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("inbox".into()),
                functions: EthereumInboxAbi::fn_map_owned(),
            });
        }
        if let Ok(addr) = self.addresses.validator_manager.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("ivm".into()),
                functions: EthereumOutboxAbi::fn_map_owned(),
            });
        }
        cfg
    }
}

/// All mainnet domains supported by Abacus.
#[derive(FromPrimitive, EnumString, strum::Display, PartialEq, Debug)]
#[strum(serialize_all = "lowercase")]
pub enum AbacusMainnetDomain {
    /// Ethereum domain ID, decimal ID 6648936
    Ethereum = 0x657468,

    /// Polygon domain ID, decimal ID 1886350457
    Polygon = 0x706f6c79,

    /// Avalanche domain ID, decimal ID 1635148152
    Avalanche = 0x61766178,

    /// Arbitrum domain ID, decimal ID 6386274
    Arbitrum = 0x617262,

    /// Optimism domain ID, decimal ID 28528
    Optimism = 0x6f70,

    /// BinanceSmartChain domain ID, decimal ID 6452067
    #[strum(serialize = "bsc")]
    BinanceSmartChain = 0x627363,

    /// Celo domain ID, decimal ID 1667591279
    Celo = 0x63656c6f,
}

impl From<AbacusMainnetDomain> for u32 {
    fn from(domain: AbacusMainnetDomain) -> Self {
        domain as u32
    }
}

impl TryFrom<u32> for AbacusMainnetDomain {
    type Error = eyre::Error;

    fn try_from(domain_id: u32) -> Result<Self, Self::Error> {
        FromPrimitive::from_u32(domain_id)
            .ok_or_else(|| eyre::eyre!("Unknown mainnet domain ID {}", domain_id))
    }
}

/// All testnet domains supported by Abacus.
#[derive(FromPrimitive, EnumString, strum::Display, PartialEq, Debug)]
#[strum(serialize_all = "lowercase")]
pub enum AbacusTestnetDomain {
    /// Ethereum testnet Goerli domain ID
    Goerli = 5,
    /// Ethereum testnet Kovan domain ID
    Kovan = 3000,

    /// Polygon testnet Mumbai domain ID
    Mumbai = 80001,

    /// Avalanche testnet Fuji domain ID
    Fuji = 43113,

    /// Arbitrum testnet ArbitrumRinkeby domain ID, decimal ID 1634872690
    ArbitrumRinkeby = 0x61722d72,

    /// Optimism testnet OptimismKovan domain ID, decimal ID 1869622635
    OptimismKovan = 0x6f702d6b,

    /// BSC testnet, decimal ID 1651715444
    #[strum(serialize = "bsctestnet")]
    BinanceSmartChainTestnet = 0x62732d74, // decimal 1651715444

    /// Celo testnet Alfajores domain ID
    Alfajores = 1000,

    /// Moonbeam testnet MoonbaseAlpha domain ID, decimal ID 1836002657
    MoonbaseAlpha = 0x6d6f2d61,
}

impl From<AbacusTestnetDomain> for u32 {
    fn from(domain: AbacusTestnetDomain) -> Self {
        domain as u32
    }
}

impl TryFrom<u32> for AbacusTestnetDomain {
    type Error = eyre::Error;

    fn try_from(domain_id: u32) -> Result<Self, Self::Error> {
        FromPrimitive::from_u32(domain_id)
            .ok_or_else(|| eyre::eyre!("Unknown testnet domain ID {}", domain_id))
    }
}

/// Local test chains (i.e. typically local hardhat nodes)
#[derive(FromPrimitive, EnumString, strum::Display, PartialEq, Debug)]
#[strum(serialize_all = "lowercase")]
pub enum AbacusLocalTestChainDomain {
    /// Test1 local chain
    Test1 = 13371,
    /// Test2 local chain
    Test2 = 13372,
    /// Test3 local chain
    Test3 = 13373,
}

impl From<AbacusLocalTestChainDomain> for u32 {
    fn from(domain: AbacusLocalTestChainDomain) -> Self {
        domain as u32
    }
}

impl TryFrom<u32> for AbacusLocalTestChainDomain {
    type Error = eyre::Error;

    fn try_from(domain_id: u32) -> Result<Self, Self::Error> {
        FromPrimitive::from_u32(domain_id)
            .ok_or_else(|| eyre::eyre!("Unknown local test chain domain ID {}", domain_id))
    }
}

/// All domains supported by Abacus.
#[derive(Debug, PartialEq)]
pub enum AbacusDomain {
    /// Mainnet domains.
    Mainnet(AbacusMainnetDomain),
    /// Testnet domains.
    Testnet(AbacusTestnetDomain),
    /// Local test domains (i.e. not public blockchains)
    LocalTestChain(AbacusLocalTestChainDomain),
}

impl TryFrom<u32> for AbacusDomain {
    type Error = eyre::Error;

    fn try_from(domain_id: u32) -> Result<Self, Self::Error> {
        if let Ok(mainnet_domain) = AbacusMainnetDomain::try_from(domain_id) {
            Ok(Self::Mainnet(mainnet_domain))
        } else if let Ok(testnet_domain) = AbacusTestnetDomain::try_from(domain_id) {
            Ok(Self::Testnet(testnet_domain))
        } else if let Ok(local_test_chain) = AbacusLocalTestChainDomain::try_from(domain_id) {
            Ok(Self::LocalTestChain(local_test_chain))
        } else {
            Err(eyre::eyre!("Unknown domain ID {}", domain_id))
        }
    }
}

impl From<AbacusDomain> for u32 {
    fn from(domain: AbacusDomain) -> Self {
        match domain {
            AbacusDomain::Mainnet(mainnet_domain) => mainnet_domain.into(),
            AbacusDomain::Testnet(testnet_domain) => testnet_domain.into(),
            AbacusDomain::LocalTestChain(local_test_chain) => local_test_chain.into(),
        }
    }
}

impl ToString for AbacusDomain {
    fn to_string(&self) -> String {
        match self {
            AbacusDomain::Mainnet(mainnet_domain) => mainnet_domain.to_string(),
            AbacusDomain::Testnet(testnet_domain) => testnet_domain.to_string(),
            AbacusDomain::LocalTestChain(local_test_chain) => local_test_chain.to_string(),
        }
    }
}

impl FromStr for AbacusDomain {
    type Err = strum::ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if let Ok(mainnet_domain) = AbacusMainnetDomain::from_str(s) {
            Ok(Self::Mainnet(mainnet_domain))
        } else if let Ok(testnet_domain) = AbacusTestnetDomain::from_str(s) {
            Ok(Self::Testnet(testnet_domain))
        } else if let Ok(local_test_chain) = AbacusLocalTestChainDomain::from_str(s) {
            Ok(Self::LocalTestChain(local_test_chain))
        } else {
            Err(strum::ParseError::VariantNotFound)
        }
    }
}

/// Gets the name of the chain from a domain id.
/// Returns None if the domain ID is not recognized.
pub fn name_from_domain_id(domain_id: u32) -> Option<String> {
    AbacusDomain::try_from(domain_id)
        .ok()
        .map(|domain| domain.to_string())
}

/// Gets the name of the chain from a domain id.
/// Returns None if the domain ID is not recognized.
pub fn domain_id_from_name(name: &'static str) -> Option<u32> {
    AbacusDomain::from_str(name)
        .ok()
        .map(|domain| domain.into())
}

#[cfg(test)]
mod test {
    use std::str::FromStr;

    use crate::chains::{AbacusMainnetDomain, AbacusTestnetDomain, AbacusLocalTestChainDomain, AbacusDomain, name_from_domain_id, domain_id_from_name};

    #[test]
    fn mainnet_domain_strings() {
        assert_eq!(
            AbacusMainnetDomain::from_str("ethereum").unwrap(),
            AbacusMainnetDomain::Ethereum,
        );
        assert_eq!(
            AbacusMainnetDomain::Ethereum.to_string(),
            "ethereum".to_string(),
        );

        // One where serialization has changed
        assert_eq!(
            AbacusMainnetDomain::from_str("bsc").unwrap(),
            AbacusMainnetDomain::BinanceSmartChain,
        );
        assert_eq!(
            AbacusMainnetDomain::BinanceSmartChain.to_string(),
            "bsc".to_string(),
        );

        // Invalid name
        assert!(AbacusMainnetDomain::from_str("foo").is_err());
    }

    #[test]
    fn testnet_domain_strings() {
        assert_eq!(
            AbacusTestnetDomain::from_str("arbitrumrinkeby").unwrap(),
            AbacusTestnetDomain::ArbitrumRinkeby,
        );
        assert_eq!(
            AbacusTestnetDomain::ArbitrumRinkeby.to_string(),
            "arbitrumrinkeby".to_string(),
        );

        // One where serialization has changed
        assert_eq!(
            AbacusTestnetDomain::from_str("bsctestnet").unwrap(),
            AbacusTestnetDomain::BinanceSmartChainTestnet,
        );
        assert_eq!(
            AbacusTestnetDomain::BinanceSmartChainTestnet.to_string(),
            "bsctestnet".to_string(),
        );

        // Invalid name
        assert!(AbacusTestnetDomain::from_str("foo").is_err());
    }

    #[test]
    fn local_test_chain_domain_strings() {
        assert_eq!(
            AbacusLocalTestChainDomain::from_str("test1").unwrap(),
            AbacusLocalTestChainDomain::Test1,
        );
        assert_eq!(
            AbacusLocalTestChainDomain::Test1.to_string(),
            "test1".to_string(),
        );

        // Invalid name
        assert!(AbacusLocalTestChainDomain::from_str("foo").is_err());
    }

    #[test]
    fn domain_strings() {
        assert_eq!(
            AbacusDomain::from_str("ethereum").unwrap(),
            AbacusDomain::Mainnet(AbacusMainnetDomain::Ethereum),
        );
        assert_eq!(
            AbacusDomain::Mainnet(AbacusMainnetDomain::Ethereum).to_string(),
            "ethereum".to_string(),
        );
    }

    #[test]
    fn domain_ids() {
        assert_eq!(
            AbacusDomain::try_from(0x657468u32).unwrap(),
            AbacusDomain::Mainnet(AbacusMainnetDomain::Ethereum),
        );

        assert_eq!(
            u32::from(AbacusDomain::Mainnet(AbacusMainnetDomain::Ethereum)),
            0x657468u32,
        );
    }

    #[test]
    fn test_name_from_domain_id() {
        assert_eq!(
            name_from_domain_id(0x657468u32),
            Some("ethereum".into()),
        );

        assert_eq!(
            name_from_domain_id(0xf00u32),
            None,
        );
    }

    #[test]
    fn test_domain_id_from_name() {
        assert_eq!(
            domain_id_from_name("ethereum"),
            Some(0x657468u32),
        );

        assert_eq!(
            domain_id_from_name("foo"),
            None,
        );
    }
}