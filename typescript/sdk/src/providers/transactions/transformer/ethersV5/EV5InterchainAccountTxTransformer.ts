import { ethers } from 'ethers';
import { Logger } from 'pino';

import {
  assert,
  concurrentMap,
  objMap,
  rootLogger,
} from '@hyperlane-xyz/utils';

import { DEFAULT_CONTRACT_READ_CONCURRENCY } from '../../../../consts/concurrency.js';
import {
  InterchainAccount,
  buildInterchainAccountApp,
} from '../../../../middleware/account/InterchainAccount.js';
import { ChainName } from '../../../../types.js';
import { MultiProvider } from '../../../MultiProvider.js';
import { CallData, PopulatedTransaction } from '../../types.js';
import { TxTransformerType } from '../TxTransformerTypes.js';

import { EV5TxTransformerInterface } from './EV5TxTransformerInterface.js';
import { EV5InterchainAccountTxTransformerProps } from './types.js';

export class EV5InterchainAccountTxTransformer
  implements EV5TxTransformerInterface
{
  public readonly txTransformerType: TxTransformerType =
    TxTransformerType.INTERCHAIN_ACCOUNT;
  protected readonly logger: Logger = rootLogger.child({
    module: 'ica-transformer',
  });

  constructor(
    public readonly multiProvider: MultiProvider,
    public readonly props: EV5InterchainAccountTxTransformerProps,
    private readonly concurrency: number = multiProvider.tryGetRpcConcurrency(
      props.chain,
    ) ?? DEFAULT_CONTRACT_READ_CONCURRENCY,
  ) {
    assert(
      this.props.config.localRouter,
      'Invalid AccountConfig: Cannot retrieve InterchainAccount.',
    );
  }

  public async transform(
    ...txs: PopulatedTransaction[]
  ): Promise<ethers.PopulatedTransaction[]> {
    const txChainsToInnerCalls: Record<ChainName, CallData[]> = txs.reduce(
      (
        txChainToInnerCalls: Record<ChainName, CallData[]>,
        { to, data, chainId }: PopulatedTransaction,
      ) => {
        const txChain = this.multiProvider.getChainName(chainId);
        txChainToInnerCalls[txChain] ||= [];
        txChainToInnerCalls[txChain].push({ to, data });
        return txChainToInnerCalls;
      },
      {},
    );

    const interchainAccountApp: InterchainAccount = buildInterchainAccountApp(
      this.multiProvider,
      this.props.chain,
      this.props.config,
    );

    const transformedTxs: Promise<ethers.PopulatedTransaction>[] = [];
    objMap(txChainsToInnerCalls, (destination, innerCalls) => {
      transformedTxs.push(
        interchainAccountApp.getCallRemote({
          chain: this.props.chain,
          destination,
          innerCalls,
          config: this.props.config,
          hookMetadata: this.props.hookMetadata,
        }),
      );
    });

    return concurrentMap(
      this.concurrency,
      transformedTxs,
      async (transformedTx) => transformedTx,
    );
  }
}
