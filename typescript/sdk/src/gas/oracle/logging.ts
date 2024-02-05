import { BigNumber, ethers } from 'ethers';

import { TOKEN_EXCHANGE_RATE_EXPONENT } from '../../consts/igp';
import { ChainName } from '../../types';

import { RemoteGasData } from './types';

export function prettyRemoteGasDataConfig(
  chain: ChainName,
  config: RemoteGasData,
): string {
  return `\tRemote: (${chain})\n${prettyRemoteGasData(config)}`;
}

export function prettyRemoteGasData(data: RemoteGasData): string {
  return `\tToken exchange rate: ${prettyTokenExchangeRate(
    data.tokenExchangeRate,
  )}\n\tGas price: ${data.gasPrice.toString()}`;
}

export function prettyTokenExchangeRate(tokenExchangeRate: BigNumber): string {
  return `${tokenExchangeRate.toString()} (${ethers.utils.formatUnits(
    tokenExchangeRate,
    TOKEN_EXCHANGE_RATE_EXPONENT,
  )})`;
}