import { HyperlaneRelayer, RelayerCacheSchema } from '@hyperlane-xyz/sdk';

import { readFile, writeFile } from 'fs/promises';

import { getArgs } from './agent-utils.js';
import { getHyperlaneCore } from './core-utils.js';

const CACHE_PATH = process.env.RELAYER_CACHE ?? './relayer-cache.json';

async function main() {
  const { environment, chain, txHash } = await getArgs()
    .describe('txHash', 'origin transaction hash')
    .string('txHash')
    .describe('chain', 'origin chain').argv;

  const { core } = await getHyperlaneCore(environment);

  const relayer = new HyperlaneRelayer(core);

  // target subset of chains
  // const chains = ['ethereum', 'polygon', 'bsc']
  const chains = undefined;

  try {
    const contents = await readFile(CACHE_PATH, 'utf-8');
    const data = JSON.parse(contents);
    const cache = RelayerCacheSchema.parse(data);
    relayer.hydrate(cache);
    console.log(`Relayer cache loaded from ${CACHE_PATH}`);
  } catch (e) {
    console.error(`Failed to load cache from ${CACHE_PATH}`);
  }

  if (txHash) {
    await relayer.relayMessagesFromDispatchTx(chain, txHash);
    return;
  }

  relayer.start(chains);

  process.once('SIGINT', async () => {
    relayer.stop(chains);

    const cache = JSON.stringify(relayer.cache);
    await writeFile(CACHE_PATH, cache, 'utf-8');
    console.log(`Relayer cache saved to ${CACHE_PATH}`);

    process.exit(0);
  });
}

main();
