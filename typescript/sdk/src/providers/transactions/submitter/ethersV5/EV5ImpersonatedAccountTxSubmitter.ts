import { TransactionReceipt } from '@ethersproject/providers';
import { PopulatedTransaction } from 'ethers';
import { Logger } from 'pino';

import { rootLogger } from '@hyperlane-xyz/utils';

import {
  impersonateAccount,
  stopImpersonatingAccount,
} from '../../../../utils/fork.js';
import { MultiProvider } from '../../../MultiProvider.js';
import { TxSubmitterType } from '../TxSubmitterTypes.js';

import { EV5JsonRpcTxSubmitter } from './EV5JsonRpcTxSubmitter.js';
import { EV5ImpersonatedAccountTxSubmitterProps } from './types.js';

export class EV5ImpersonatedAccountTxSubmitter extends EV5JsonRpcTxSubmitter {
  public readonly txSubmitterType: TxSubmitterType =
    TxSubmitterType.IMPERSONATED_ACCOUNT;

  protected readonly logger: Logger = rootLogger.child({
    module: 'impersonated-account-submitter',
  });

  constructor(
    multiProvider: MultiProvider,
    public readonly props: EV5ImpersonatedAccountTxSubmitterProps,
  ) {
    super(multiProvider);
  }

  public async submit(
    ...txs: PopulatedTransaction[]
  ): Promise<TransactionReceipt[]> {
    const impersonatedAccount = await impersonateAccount(
      this.props.userAddress,
    );
    this.multiProvider.setSharedSigner(impersonatedAccount);
    const transactionReceipts = await super.submit(...txs);
    await stopImpersonatingAccount(this.props.userAddress);
    return transactionReceipts;
  }
}
