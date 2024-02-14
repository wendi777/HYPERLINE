import { expect } from 'chai';

import { zksyncera } from '../consts/chainMetadata';
import { Chains } from '../consts/chains';
import { MultiProtocolProvider } from '../providers/MultiProtocolProvider';

describe('MultiProtocolProvider', () => {
  describe('constructs', () => {
    it('creates a multi protocol provider without type extension', async () => {
      const multiProvider = new MultiProtocolProvider();
      const ethMetadata = multiProvider.getChainMetadata(Chains.zksyncera);
      expect(ethMetadata.name).to.equal(Chains.zksyncera);
    });
    it('creates a multi protocol provider with type extension', async () => {
      const multiProvider = new MultiProtocolProvider<{
        foo: string;
        bar: number;
      }>({
        [Chains.zksyncera]: { ...zksyncera, foo: '0x123', bar: 1 },
      });
      const ethMetadata = multiProvider.getChainMetadata(Chains.zksyncera);
      expect(ethMetadata.foo).to.equal('0x123');
      expect(ethMetadata.bar).to.equal(1);
    });
  });
});
