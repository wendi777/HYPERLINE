use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, Instant};
use std::{env, fs};

use macro_rules_attribute::apply;
use maplit::hashmap;
use tempfile::tempdir;

use crate::logging::log;
use crate::metrics::agent_balance_sum;
use crate::program::Program;
use crate::starknet::utils::{download, unzip};
use crate::utils::{as_task, concat_path, stop_child, AgentHandles, TaskHandle};
use crate::{fetch_metric, AGENT_BIN_PATH};

use self::source::{CLISource, CodeSource};

mod source;
mod utils;

const KATANA_CLI_GIT: &str = "https://github.com/dojoengine/dojo";
const KATANA_CLI_VERSION: &str = "0.6.1-alpha.4";

const KEY_HPL_VALIDATOR: (&str, &str) = (
    "hpl-validator",
    "0x2bbf4f9fd0bbb2e60b0316c1fe0b76cf7a4d0198bd493ced9b8df2a3a24d68a",
);
const KEY_HPL_RELAYER: (&str, &str) = (
    "hpl-relayer",
    "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
);

const KEY_VALIDATOR: (&str, &str) = (
    "validator",
    "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
);
const KEY_ACCOUNTS1: (&str, &str) = (
    "account1",
    "0x33003003001800009900180300d206308b0070db00121318d17b5e6262150b",
);
const KEY_ACCOUNTS2: (&str, &str) = (
    "account2",
    "0x3e3979c1ed728490308054fe357a9f49cf67f80f9721f44cc57235129e090f4",
);
const KEY_ACCOUNTS3: (&str, &str) = (
    "account3",
    "0x736adbbcdac7cc600f89051db1abbc16b9996b46f6b58a9752a11c1028a8ec8",
);

fn default_keys<'a>() -> [(&'a str, &'a str); 6] {
    [
        KEY_HPL_VALIDATOR,
        KEY_HPL_RELAYER,
        KEY_VALIDATOR,
        KEY_ACCOUNTS1,
        KEY_ACCOUNTS2,
        KEY_ACCOUNTS3,
    ]
}

pub struct MockDispatch {
    pub dispatch: MockDispatchInner,
}

pub struct MockDispatchInner {
    pub dest_domain: u32,
    pub recipient_addr: String,
    pub msg_body: String,
    pub hook: Option<String>,
    pub metadata: String,
}

const CAIRO_HYPERLANE_GIT: &str = "https://github.com/astraly-labs/hyperlane_starknet";
const CAIRO_HYPERLANE_VERSION: &str = "v0.0.1";

fn make_target() -> String {
    let os = if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        panic!("Current os is not supported by Katana")
    };

    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    };

    format!("{}-{}", os, arch)
}

pub fn install_codes(dir: Option<PathBuf>, local: bool) -> BTreeMap<String, PathBuf> {
    let dir_path = match dir {
        Some(path) => path,
        None => tempdir().unwrap().into_path(),
    };

    if !local {
        let dir_path_str = dir_path.to_str().unwrap();

        let release_comp = "wasm_codes.zip";

        log!(
            "Downloading {} @ {}",
            CAIRO_HYPERLANE_GIT,
            CAIRO_HYPERLANE_VERSION,
        );
        let uri = format!(
            "{CAIRO_HYPERLANE_GIT}/releases/download/{CAIRO_HYPERLANE_VERSION}/{release_comp}"
        );
        download(release_comp, &uri, dir_path_str);

        log!("Uncompressing {} release", CAIRO_HYPERLANE_GIT);
        unzip(release_comp, dir_path_str);
    }

    log!("Installing {} in Path: {:?}", CAIRO_HYPERLANE_GIT, dir_path);

    // make contract_name => path map
    fs::read_dir(dir_path)
        .unwrap()
        .map(|v| {
            let entry = v.unwrap();
            (entry.file_name().into_string().unwrap(), entry.path())
        })
        .filter(|(filename, _)| filename.ends_with(".wasm"))
        .map(|v| (v.0.replace(".wasm", ""), v.1))
        .collect()
}

#[allow(dead_code)]
pub fn install_cosmos(
    cli_dir: Option<PathBuf>,
    cli_src: Option<CLISource>,
    codes_dir: Option<PathBuf>,
    _codes_src: Option<CodeSource>,
) -> (PathBuf, BTreeMap<String, PathBuf>) {
    let osmosisd = cli_src
        .unwrap_or(CLISource::Remote {
            url: KATANA_CLI_GIT.to_string(),
            version: KATANA_CLI_VERSION.to_string(),
        })
        .install(cli_dir);
    let codes = install_codes(codes_dir, false);

    (osmosisd, codes)
}

#[derive(Clone)]
pub struct StarknetConfig {
    pub cli_path: PathBuf,

    pub codes: BTreeMap<String, PathBuf>,

    pub node_addr_base: String,
    pub node_port_base: u32,

    pub chain_id: String,
}

pub struct StarknetResp {
    pub node: AgentHandles,
    pub endpoint: OsmosisEndpoint,
    pub codes: Codes,
}

impl StarknetResp {
    pub fn cli(&self, bin: &Path) -> StarknetCLI {
        StarknetCLI::new(bin.to_path_buf())
    }
}

pub struct CosmosNetwork {
    pub launch_resp: StarknetResp,
    pub deployments: Deployments,
    pub chain_id: String,
    pub metrics_port: u32,
    pub domain: u32,
}

impl Drop for CosmosNetwork {
    fn drop(&mut self) {
        stop_child(&mut self.launch_resp.node.1);
    }
}

impl From<(StarknetResp, Deployments, String, u32, u32)> for CosmosNetwork {
    fn from(v: (StarknetResp, Deployments, String, u32, u32)) -> Self {
        Self {
            launch_resp: v.0,
            deployments: v.1,
            chain_id: v.2,
            metrics_port: v.3,
            domain: v.4,
        }
    }
}
pub struct StarknetHyperlaneStack {
    pub validators: Vec<AgentHandles>,
    pub relayer: AgentHandles,
}

impl Drop for StarknetHyperlaneStack {
    fn drop(&mut self) {
        for v in &mut self.validators {
            stop_child(&mut v.1);
        }
        stop_child(&mut self.relayer.1);
    }
}

#[apply(as_task)]
fn launch_starknet_node(config: StarknetConfig) -> StarknetResp {
    let cli = StarknetCLI::new(config.cli_path);

    cli.init(&config.chain_id);

    let (node, endpoint) = cli.start(config.node_addr_base, config.node_port_base);
    let codes = cli.store_codes(&endpoint, "validator", config.codes);

    StarknetResp {
        node,
        endpoint,
        codes,
    }
}

#[apply(as_task)]
fn launch_starknet_validator(
    agent_config: AgentConfig,
    agent_config_path: PathBuf,
    debug: bool,
) -> AgentHandles {
    let validator_bin = concat_path(format!("../../{AGENT_BIN_PATH}"), "validator");
    let validator_base = tempdir().expect("Failed to create a temp dir").into_path();
    let validator_base_db = concat_path(&validator_base, "db");

    fs::create_dir_all(&validator_base_db).unwrap();
    println!("Validator DB: {:?}", validator_base_db);

    let checkpoint_path = concat_path(&validator_base, "checkpoint");
    let signature_path = concat_path(&validator_base, "signature");

    let validator = Program::default()
        .bin(validator_bin)
        .working_dir("../../")
        .env("CONFIG_FILES", agent_config_path.to_str().unwrap())
        .env(
            "MY_VALIDATOR_SIGNATURE_DIRECTORY",
            signature_path.to_str().unwrap(),
        )
        .env("RUST_BACKTRACE", "1")
        .hyp_env("CHECKPOINTSYNCER_PATH", checkpoint_path.to_str().unwrap())
        .hyp_env("CHECKPOINTSYNCER_TYPE", "localStorage")
        .hyp_env("ORIGINCHAINNAME", agent_config.name)
        .hyp_env("DB", validator_base_db.to_str().unwrap())
        .hyp_env("METRICSPORT", agent_config.metrics_port.to_string())
        .hyp_env("VALIDATOR_SIGNER_TYPE", agent_config.signer.typ)
        .hyp_env("VALIDATOR_KEY", agent_config.signer.key.clone())
        .hyp_env("VALIDATOR_PREFIX", "osmo")
        .hyp_env("SIGNER_SIGNER_TYPE", "hexKey")
        .hyp_env("SIGNER_KEY", agent_config.signer.key)
        .hyp_env("TRACING_LEVEL", if debug { "debug" } else { "info" })
        .spawn("VAL");

    validator
}

#[apply(as_task)]
fn launch_starknet_relayer(
    agent_config_path: PathBuf,
    relay_chains: Vec<String>,
    metrics: u32,
    debug: bool,
) -> AgentHandles {
    let relayer_bin = concat_path(format!("../../{AGENT_BIN_PATH}"), "relayer");
    let relayer_base = tempdir().unwrap();

    let relayer = Program::default()
        .bin(relayer_bin)
        .working_dir("../../")
        .env("CONFIG_FILES", agent_config_path.to_str().unwrap())
        .env("RUST_BACKTRACE", "1")
        .hyp_env("RELAYCHAINS", relay_chains.join(","))
        .hyp_env("DB", relayer_base.as_ref().to_str().unwrap())
        .hyp_env("ALLOWLOCALCHECKPOINTSYNCERS", "true")
        .hyp_env("TRACING_LEVEL", if debug { "debug" } else { "info" })
        .hyp_env("GASPAYMENTENFORCEMENT", "[{\"type\": \"none\"}]")
        .hyp_env("METRICSPORT", metrics.to_string())
        .spawn("RLY");

    relayer
}

const ENV_CLI_PATH_KEY: &str = "E2E_KATANA_CLI_PATH";
const ENV_HYPERLANE_STARKNET_PATH_KEY: &str = "E2E_HYPERLANE_STARKNET_PATH";

#[allow(dead_code)]
fn run_locally() {
    const TIMEOUT_SECS: u64 = 60 * 10;
    let debug = false;

    log!("Building rust...");
    Program::new("cargo")
        .cmd("build")
        .working_dir("../../")
        .arg("features", "test-utils")
        .arg("bin", "relayer")
        .arg("bin", "validator")
        .arg("bin", "scraper")
        .arg("bin", "init-db")
        .filter_logs(|l| !l.contains("workspace-inheritance"))
        .run()
        .join();

    let cli_src = Some(
        env::var(ENV_CLI_PATH_KEY)
            .as_ref()
            .map(|v| CLISource::local(v))
            .unwrap_or_default(),
    );

    let code_src = Some(
        env::var(ENV_HYPERLANE_STARKNET_PATH_KEY)
            .as_ref()
            .map(|v| CodeSource::local(v))
            .unwrap_or_default(),
    );

    let (katanad, codes) = install_starknet(None, cli_src, None, code_src);
    let addr_base = "http://0.0.0.0";
    let default_config = StarknetConfig {
        cli_path: katanad.clone(),

        codes,

        node_addr_base: addr_base.to_string(),
        node_port_base: 5050,

        chain_id: "KATANA".to_string(),
    };

    let port_start = 26600u32;
    let metrics_port_start = 9090u32;
    let domain_start = 99990u32;
    let node_count = 2;

    let nodes = (0..node_count)
        .map(|i| {
            (
                launch_cosmos_node(CosmosConfig {
                    node_port_base: port_start + (i * 10),
                    chain_id: format!("cosmos-test-{}", i + domain_start),
                    ..default_config.clone()
                }),
                format!("cosmos-test-{}", i + domain_start),
                metrics_port_start + i,
                domain_start + i,
            )
        })
        .collect::<Vec<_>>();

    let deployer = "validator";
    let linker = "validator";
    let validator = "hpl-validator";
    let _relayer = "hpl-relayer";

    let nodes = nodes
        .into_iter()
        .map(|v| (v.0.join(), v.1, v.2, v.3))
        .map(|(launch_resp, chain_id, metrics_port, domain)| {
            let deployments = deploy_cw_hyperlane(
                launch_resp.cli(&osmosisd),
                launch_resp.endpoint.clone(),
                deployer.to_string(),
                launch_resp.codes.clone(),
                domain,
            );

            (launch_resp, deployments, chain_id, metrics_port, domain)
        })
        .collect::<Vec<_>>();

    // nodes with base deployments
    let nodes = nodes
        .into_iter()
        .map(|v| (v.0, v.1.join(), v.2, v.3, v.4))
        .map(|v| v.into())
        .collect::<Vec<CosmosNetwork>>();

    for (i, node) in nodes.iter().enumerate() {
        let targets = &nodes[(i + 1)..];

        if !targets.is_empty() {
            println!(
                "LINKING NODES: {} -> {:?}",
                node.domain,
                targets.iter().map(|v| v.domain).collect::<Vec<_>>()
            );
        }

        for target in targets {
            link_networks(&osmosisd, linker, validator, node, target);
        }
    }

    // for debug
    println!(
        "{}",
        serde_json::to_string(
            &nodes
                .iter()
                .map(|v| (v.domain, v.deployments.clone()))
                .collect::<BTreeMap<_, _>>()
        )
        .unwrap()
    );

    let config_dir = tempdir().unwrap();

    // export agent config
    let agent_config_out = AgentConfigOut {
        chains: nodes
            .iter()
            .map(|v| {
                (
                    format!("cosmostest{}", v.domain),
                    AgentConfig::new(osmosisd.clone(), validator, v),
                )
            })
            .collect::<BTreeMap<String, AgentConfig>>(),
    };

    let agent_config_path = concat_path(&config_dir, "config.json");
    fs::write(
        &agent_config_path,
        serde_json::to_string_pretty(&agent_config_out).unwrap(),
    )
    .unwrap();

    let hpl_val = agent_config_out
        .chains
        .clone()
        .into_values()
        .map(|agent_config| launch_cosmos_validator(agent_config, agent_config_path.clone(), debug))
        .collect::<Vec<_>>();
    let hpl_rly_metrics_port = metrics_port_start + node_count + 1u32;
    let hpl_rly = launch_cosmos_relayer(
        agent_config_path,
        agent_config_out.chains.into_keys().collect::<Vec<_>>(),
        hpl_rly_metrics_port,
        debug,
    );

    // give things a chance to fully start.
    sleep(Duration::from_secs(10));

    let starting_relayer_balance: f64 = agent_balance_sum(hpl_rly_metrics_port).unwrap();

    // dispatch messages
    let mut dispatched_messages = 0;

    for node in nodes.iter() {
        let targets = nodes
            .iter()
            .filter(|v| v.domain != node.domain)
            .collect::<Vec<_>>();

        if !targets.is_empty() {
            println!(
                "DISPATCHING MAILBOX: {} -> {:?}",
                node.domain,
                targets.iter().map(|v| v.domain).collect::<Vec<_>>()
            );
        }

        for target in targets {
            dispatched_messages += 1;
            let cli = OsmosisCLI::new(
                osmosisd.clone(),
                node.launch_resp.home_path.to_str().unwrap(),
            );

            let msg_body: &[u8; 5] = b"hello";

            cli.wasm_execute(
                &node.launch_resp.endpoint,
                linker,
                &node.deployments.mailbox,
                MockDispatch {
                    dispatch: MockDispatchInner {
                        dest_domain: target.domain,
                        recipient_addr: hex::encode(
                            bech32_decode(&target.deployments.mock_receiver).unwrap(),
                        ),
                        msg_body: hex::encode(msg_body),
                        hook: None,
                        metadata: "".to_string(),
                    },
                },
                vec![RawCosmosAmount {
                    denom: "uosmo".to_string(),
                    amount: 25_000_000.to_string(),
                }],
            );
        }
    }

    let _stack = CosmosHyperlaneStack {
        validators: hpl_val.into_iter().map(|v| v.join()).collect(),
        relayer: hpl_rly.join(),
    };

    // Mostly copy-pasta from `rust/utils/run-locally/src/main.rs`
    // TODO: refactor to share code
    let loop_start = Instant::now();
    let mut failure_occurred = false;
    loop {
        // look for the end condition.
        if termination_invariants_met(
            hpl_rly_metrics_port,
            dispatched_messages,
            starting_relayer_balance,
        )
        .unwrap_or(false)
        {
            // end condition reached successfully
            break;
        } else if (Instant::now() - loop_start).as_secs() > TIMEOUT_SECS {
            // we ran out of time
            log!("timeout reached before message submission was confirmed");
            failure_occurred = true;
            break;
        }

        sleep(Duration::from_secs(5));
    }

    if failure_occurred {
        panic!("E2E tests failed");
    } else {
        log!("E2E tests passed");
    }
}

fn termination_invariants_met(
    relayer_metrics_port: u32,
    messages_expected: u32,
    starting_relayer_balance: f64,
) -> eyre::Result<bool> {
    let gas_payments_scraped = fetch_metric(
        &relayer_metrics_port.to_string(),
        "hyperlane_contract_sync_stored_events",
        &hashmap! {"data_type" => "gas_payment"},
    )?
    .iter()
    .sum::<u32>();
    let expected_gas_payments = messages_expected;
    if gas_payments_scraped != expected_gas_payments {
        log!(
            "Relayer has indexed {} gas payments, expected {}",
            gas_payments_scraped,
            expected_gas_payments
        );
        return Ok(false);
    }

    let delivered_messages_scraped = fetch_metric(
        &relayer_metrics_port.to_string(),
        "hyperlane_operations_processed_count",
        &hashmap! {"phase" => "confirmed"},
    )?
    .iter()
    .sum::<u32>();
    if delivered_messages_scraped != messages_expected {
        log!(
            "Relayer confirmed {} submitted messages, expected {}",
            delivered_messages_scraped,
            messages_expected
        );
        return Ok(false);
    }

    let ending_relayer_balance: f64 = agent_balance_sum(relayer_metrics_port).unwrap();

    // Make sure the balance was correctly updated in the metrics.
    // Ideally, make sure that the difference is >= gas_per_tx * gas_cost, set here:
    // https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/c2288eb31734ba1f2f997e2c6ecb30176427bc2c/rust/utils/run-locally/src/cosmos/cli.rs#L55
    // What's stopping this is that the format returned by the `uosmo` balance query is a surprisingly low number (0.000003999999995184)
    // but then maybe the gas_per_tx is just very low - how can we check that? (maybe by simulating said tx)
    if starting_relayer_balance <= ending_relayer_balance {
        log!(
            "Expected starting relayer balance to be greater than ending relayer balance, but got {} <= {}",
            starting_relayer_balance,
            ending_relayer_balance
        );
        return Ok(false);
    }

    log!("Termination invariants have been meet");
    Ok(true)
}

#[cfg(feature = "cosmos")]
mod test {
    use super::*;

    #[test]
    fn test_run() {
        run_locally()
    }
}
