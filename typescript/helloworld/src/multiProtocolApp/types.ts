import {
  ChainName,
  IRouterAdapter,
  RouterAddress,
  TypedTransaction,
} from '@hyperlane-xyz/sdk';
import { Address } from '@hyperlane-xyz/utils';

import { StatCounts } from '../app/types';

export interface IHelloWorldAdapter
  extends IRouterAdapter<RouterAddress & { mailbox: Address }> {
  populateSendHelloTx: (
    from: ChainName,
    to: ChainName,
    message: string,
    value: string,
    sender: Address,
  ) => Promise<TypedTransaction>;

  channelStats: (from: ChainName, to: ChainName) => Promise<StatCounts>;
}
