import { BigNumber, ethers } from 'ethers';
import { Counter, Gauge, Registry } from 'prom-client';
import { format } from 'util';

import { HelloWorldApp } from '@abacus-network/helloworld';
import { ChainName, InterchainGasCalculator } from '@abacus-network/sdk';
import { debug, error, log, utils, warn } from '@abacus-network/utils';

import { KEY_ROLE_ENUM } from '../../src/agents/roles';
import { startMetricsServer } from '../../src/utils/metrics';
import {
  assertChain,
  assertContext,
  diagonalize,
  sleep,
} from '../../src/utils/utils';
import { assertEnvironment, getArgs, getCoreEnvironmentConfig } from '../utils';

import { getApp } from './utils';

const metricsRegister = new Registry();
const messagesSendCount = new Counter({
  name: 'abacus_kathy_messages',
  help: 'Count of messages sent; records successes and failures by status label',
  registers: [metricsRegister],
  labelNames: ['origin', 'remote', 'status'],
});
const currentPairingIndexGauge = new Gauge({
  name: 'abacus_kathy_pairing_index',
  help: 'The current message pairing index kathy is on, this is useful for seeing if kathy is always crashing around the same pairing as pairings are deterministically ordered.',
  registers: [metricsRegister],
  labelNames: [],
});
const messageSendSeconds = new Counter({
  name: 'abacus_kathy_message_send_seconds',
  help: 'Total time spent waiting on messages to get sent not including time spent waiting on it to be received.',
  registers: [metricsRegister],
  labelNames: ['origin', 'remote'],
});
const messageReceiptSeconds = new Counter({
  name: 'abacus_kathy_message_receipt_seconds',
  help: 'Total time spent waiting on messages to be received including time to be sent.',
  registers: [metricsRegister],
  labelNames: ['origin', 'remote'],
});
const walletBalance = new Gauge({
  name: 'abacus_wallet_balance',
  help: 'Current balance of eth and other tokens in the `tokens` map for the wallet addresses in the `wallets` set',
  registers: [metricsRegister],
  labelNames: [
    'chain',
    'wallet_address',
    'wallet_name',
    'token_address',
    'token_symbol',
    'token_name',
  ],
});

/** The maximum number of messages we will allow to get queued up if we are sending too slowly. */
const MAX_MESSAGES_ALLOWED_TO_SEND = 5;

function getKathyArgs() {
  return getArgs()
    .coerce('e', assertEnvironment)
    .demandOption('e')

    .coerce('context', assertContext)
    .demandOption('context')

    .boolean('cycle-once')
    .describe(
      'cycle-once',
      'If true, will cycle through all chain pairs once as quick as possible',
    )
    .default('cycle-once', false)

    .number('full-cycle-time')
    .describe(
      'full-cycle-time',
      'How long it should take to go through all the message pairings in milliseconds. Ignored if --cycle-once is true. Defaults to 6 hours.',
    )
    .default('full-cycle-time', 1000 * 60 * 60 * 6) // 6 hrs

    .number('message-send-timeout')
    .describe(
      'message-send-timeout',
      'How long to wait for a message to be sent in milliseconds. Defaults to 10 min.',
    )
    .default('message-send-timeout', 10 * 60 * 1000) // 10 min

    .number('message-receipt-timeout')
    .describe(
      'message-receipt-timeout',
      'How long to wait for a message to be received on the destination in milliseconds. Defaults to 10 min.',
    )
    .default('message-receipt-timeout', 10 * 60 * 1000) // 10 min

    .string('chains-to-skip')
    .array('chains-to-skip')
    .describe('chains-to-skip', 'Chains to skip sending from or sending to.')
    .default('chains-to-skip', [])
    .demandOption('chains-to-skip')
    .coerce('chains-to-skip', (chainStrs: string[]) =>
      chainStrs.map((chainStr: string) => assertChain(chainStr)),
    ).argv;
}

// Returns whether an error occurred
async function main(): Promise<boolean> {
  const {
    e: environment,
    context,
    chainsToSkip,
    cycleOnce,
    fullCycleTime,
    messageSendTimeout,
    messageReceiptTimeout,
  } = await getKathyArgs();

  let errorOccurred = false;

  startMetricsServer(metricsRegister);
  debug('Starting up', { environment });

  const coreConfig = getCoreEnvironmentConfig(environment);
  const app = await getApp(coreConfig, context, KEY_ROLE_ENUM.Kathy);
  const gasCalculator = InterchainGasCalculator.fromEnvironment(
    environment,
    app.multiProvider as any,
  );
  const appChains = app.chains();

  // Ensure the specified chains to skip are actually valid for the app.
  // Despite setting a default and demanding it as an option, yargs believes
  // chainsToSkip can possibly be undefined.
  for (const chainToSkip of chainsToSkip!) {
    if (!appChains.includes(chainToSkip)) {
      throw Error(
        `Chain to skip ${chainToSkip} invalid, not found in ${appChains}`,
      );
    }
  }

  const chains = appChains.filter(
    (chain) => !chainsToSkip || !chainsToSkip.includes(chain),
  );
  const pairings = diagonalize(
    chains.map((origin) =>
      chains.map((destination) =>
        origin == destination ? null : { origin, destination },
      ),
    ),
  )
    .filter((v) => v !== null)
    .map((v) => v!);

  debug('Pairings calculated', { chains, pairings });

  let allowedToSend: number;
  let currentPairingIndex: number;
  let sendFrequency: number | undefined;

  if (cycleOnce) {
    // If we're cycling just once, we're allowed to send all the pairings
    allowedToSend = pairings.length;
    // Start with pairing 0
    currentPairingIndex = 0;

    debug('Cycling once through all pairs');
  } else {
    // If we are not cycling just once and are running this as a service, do so at an interval.
    // Track how many we are still allowed to send in case some messages send slower than expected.
    allowedToSend = 1;
    sendFrequency = fullCycleTime / pairings.length;
    // in case we are restarting kathy, keep it from always running the exact same messages first
    currentPairingIndex = Date.now() % pairings.length;

    debug('Running as a service', {
      sendFrequency,
    });

    setInterval(() => {
      // bucket cap since if we are getting really behind it probably does not make sense to let it run away.
      allowedToSend = Math.min(allowedToSend + 1, MAX_MESSAGES_ALLOWED_TO_SEND);
      debug('Tick; allowed to send another message', {
        allowedToSend,
        sendFrequency,
      });
    }, sendFrequency);
  }

  // init the metrics because it can take a while for kathy to get through everything and we do not
  // want the metrics to be reported as null in the meantime.
  for (const { origin, destination: remote } of pairings) {
    messagesSendCount.labels({ origin, remote, status: 'success' }).inc(0);
    messagesSendCount.labels({ origin, remote, status: 'failure' }).inc(0);
    messageSendSeconds.labels({ origin, remote }).inc(0);
    messageReceiptSeconds.labels({ origin, remote }).inc(0);
  }
  await Promise.all(
    chains.map(async (chain) => {
      await updateWalletBalanceMetricFor(app, chain);
    }),
  );

  while (true) {
    currentPairingIndexGauge.set(currentPairingIndex);
    const { origin, destination } = pairings[currentPairingIndex];
    const labels = {
      origin,
      remote: destination,
    };
    const logCtx = {
      currentPairingIndex,
      origin,
      destination,
    };
    // wait until we are allowed to send the message; we don't want to send on
    // the interval directly because low intervals could cause multiple to be
    // sent concurrently. Using allowedToSend creates a token-bucket system that
    // allows for a few to be sent if one message takes significantly longer
    // than most do. It is also more accurate to do it this way for keeping the
    // interval schedule than to use a fixed sleep which would not account for
    // how long messages took to send.
    // In the cycle-once case, the loop is expected to exit before ever hitting
    // this condition.
    if (allowedToSend <= 0) {
      debug('Waiting before sending next message', {
        ...logCtx,
        sendFrequency,
      });
      while (allowedToSend <= 0) await sleep(1000);
    }
    allowedToSend--;

    debug('Initiating sending of new message', logCtx);

    try {
      await sendMessage(
        app,
        origin,
        destination,
        gasCalculator,
        messageSendTimeout,
        messageReceiptTimeout,
      );
      log('Message sent successfully', { origin, destination });
      messagesSendCount.labels({ ...labels, status: 'success' }).inc();
    } catch (e) {
      error(`Error sending message, continuing...`, {
        error: format(e),
        ...logCtx,
      });
      messagesSendCount.labels({ ...labels, status: 'failure' }).inc();
      errorOccurred = true;
    }
    updateWalletBalanceMetricFor(app, origin).catch((e) => {
      warn('Failed to update wallet balance for chain', {
        chain: origin,
        err: format(e),
      });
    });

    // Print stats once every cycle through the pairings.
    // For the cycle-once case, it's important this checks if the current index is
    // the final index in pairings. For the long-running case, this index choice
    // is arbitrary.
    if (currentPairingIndex == pairings.length - 1) {
      for (const [origin, destinationStats] of Object.entries(
        await app.stats(),
      )) {
        for (const [destination, counts] of Object.entries(destinationStats)) {
          debug('Message stats', { origin, destination, ...counts });
        }
      }

      if (cycleOnce) {
        log('Finished cycling through all pairs once');
        break;
      }
    }

    // Move on to the next index
    currentPairingIndex++;
  }
  return errorOccurred;
}

async function sendMessage(
  app: HelloWorldApp<any>,
  origin: ChainName,
  destination: ChainName,
  gasCalc: InterchainGasCalculator<any>,
  messageSendTimeout: number,
  messageReceiptTimeout: number,
) {
  const startTime = Date.now();
  const msg = 'Hello!';
  const expectedHandleGas = BigNumber.from(100_000);

  let value = await utils.retryAsync(
    () =>
      gasCalc.estimatePaymentForHandleGas(
        origin,
        destination,
        expectedHandleGas,
      ),
    2,
  );
  const metricLabels = { origin, remote: destination };

  log('Sending message', {
    origin,
    destination,
    interchainGasPayment: value.toString(),
  });

  // For now, pay just 1 wei, as Kathy typically doesn't have enough
  // funds to send from a cheap chain to expensive chains like Ethereum.
  //
  // TODO remove this once the Kathy key is funded with a higher
  // balance and interchain gas payments are cycled back into
  // the funder frequently.
  value = BigNumber.from(1);
  // Log it as an obvious reminder
  log('Intentionally setting interchain gas payment to 1');

  const channelStatsBefore = await app.channelStats(origin, destination);
  const receipt = await utils.retryAsync(
    () =>
      utils.timeout(
        app.sendHelloWorld(origin, destination, msg, value),
        messageSendTimeout,
        'Timeout sending message',
      ),
    2,
  );
  messageSendSeconds.labels(metricLabels).inc((Date.now() - startTime) / 1000);
  log('Message sent', {
    origin,
    destination,
    events: receipt.events,
    logs: receipt.logs,
  });

  try {
    await utils.timeout(
      app.waitForMessageReceipt(receipt),
      messageReceiptTimeout,
      'Timeout waiting for message to be received',
    );
  } catch (error) {
    // If we weren't able to get the receipt for message processing, try to read the state to ensure it wasn't a transient provider issue
    const channelStatsNow = await app.channelStats(origin, destination);
    if (channelStatsNow.received <= channelStatsBefore.received) {
      throw error;
    }
    log(
      'Did not receive event for message delivery even though it was delivered',
      { origin, destination },
    );
  }

  messageReceiptSeconds
    .labels(metricLabels)
    .inc((Date.now() - startTime) / 1000);
  log('Message received', {
    origin,
    destination,
  });
}

async function updateWalletBalanceMetricFor(
  app: HelloWorldApp<any>,
  chain: ChainName,
): Promise<void> {
  const provider = app.multiProvider.getChainConnection(chain).provider;
  const signerAddress = await app
    .getContracts(chain)
    .router.signer.getAddress();
  const signerBalance = await provider.getBalance(signerAddress);
  const balance = parseFloat(ethers.utils.formatEther(signerBalance));
  walletBalance
    .labels({
      chain,
      // this address should not have the 0x prefix and should be all lowercase
      wallet_address: signerAddress.toLowerCase().slice(2),
      wallet_name: 'kathy',
      token_address: 'none',
      token_name: 'Native',
      token_symbol: 'Native',
    })
    .set(balance);
  debug('Wallet balance updated for chain', { chain, signerAddress, balance });
}

main()
  .then((errorOccurred: boolean) => {
    log('Main exited');
    if (errorOccurred) {
      error('An error occurred at some point');
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .catch((e) => {
    error('Error in main', { error: format(e) });
    process.exit(1);
  });
