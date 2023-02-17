import { Create2Factory, Create2Factory__factory } from '@hyperlane-xyz/core';
import { HyperlaneDeployer, MultiProvider } from '@hyperlane-xyz/sdk';
import { CREATE2FACTORY_ADDRESS } from '@hyperlane-xyz/sdk/dist/deploy/HyperlaneDeployer';

export const factories = {
  Create2Factory: new Create2Factory__factory(),
};

type Contracts = {
  Create2Factory: Create2Factory;
};

// Hardcode the bytecode here to be indpendent of the compiler version
const CREATE2FACTORYBYTECODE =
  '0x608060405234801561001057600080fd5b50610640806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c80634af63f0214610046578063c2b1041c14610082578063cf4d643214610095575b600080fd5b610059610054366004610486565b6100a8565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b610059610090366004610514565b6100e7565b6100596100a336600461058a565b6101f4565b604080513360208201529081018290526000906100e09084906060015b604051602081830303815290604052805190602001206102c6565b9392505050565b6040805173ffffffffffffffffffffffffffffffffffffffff8416602082015290810182905260009081906060016040516020818303038152906040528051906020012090503081878760405161013f9291906105fa565b6040519081900381206101b49392916020017fff00000000000000000000000000000000000000000000000000000000000000815260609390931b7fffffffffffffffffffffffffffffffffffffffff0000000000000000000000001660018401526015830191909152603582015260550190565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe081840301815291905280516020909101209695505050505050565b604080513360208201529081018490526000906102159086906060016100c5565b905060008173ffffffffffffffffffffffffffffffffffffffff1684846040516102409291906105fa565b6000604051808303816000865af19150503d806000811461027d576040519150601f19603f3d011682016040523d82523d6000602084013e610282565b606091505b50509050806102bd576040517f4f77232300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b50949350505050565b60008251600003610303576040517f21744a5900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b818351602085016000f5905073ffffffffffffffffffffffffffffffffffffffff811661035c576040517f4102e83a00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8251602084012060405173ffffffffffffffffffffffffffffffffffffffff83169184917f27b8e3132afa95254770e1c1d214eafde52bc47d1b6e1f5dfcbb380c3ca3f53290600090a492915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600082601f8301126103ec57600080fd5b813567ffffffffffffffff80821115610407576104076103ac565b604051601f83017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0908116603f0116810190828211818310171561044d5761044d6103ac565b8160405283815286602085880101111561046657600080fd5b836020870160208301376000602085830101528094505050505092915050565b6000806040838503121561049957600080fd5b823567ffffffffffffffff8111156104b057600080fd5b6104bc858286016103db565b95602094909401359450505050565b60008083601f8401126104dd57600080fd5b50813567ffffffffffffffff8111156104f557600080fd5b60208301915083602082850101111561050d57600080fd5b9250929050565b6000806000806060858703121561052a57600080fd5b843567ffffffffffffffff81111561054157600080fd5b61054d878288016104cb565b909550935050602085013573ffffffffffffffffffffffffffffffffffffffff8116811461057a57600080fd5b9396929550929360400135925050565b600080600080606085870312156105a057600080fd5b843567ffffffffffffffff808211156105b857600080fd5b6105c4888389016103db565b95506020870135945060408701359150808211156105e157600080fd5b506105ee878288016104cb565b95989497509550505050565b818382376000910190815291905056fea2646970667358221220959b7947b895d33da4de69733c07a0543161262edcf0e8d1784935027b47462c64736f6c63430008110033';

export class Create2FactoryDeployer extends HyperlaneDeployer<
  any,
  Contracts,
  typeof factories
> {
  constructor(multiProvider: MultiProvider) {
    super(
      multiProvider,
      multiProvider.mapKnownChains(() => ({})),
      factories,
    );
  }
  async deployContracts(chain: Chain) {
    const chainConnection = this.multiProvider.getChainConnection(chain);
    const signer = this.multiProvider.getChainSigner(chain);
    if (
      (await chainConnection.provider.getCode(CREATE2FACTORY_ADDRESS)) === '0x'
    ) {
      const tx = await signer.signTransaction({
        data: CREATE2FACTORYBYTECODE,
        chainId: 0,
        gasPrice: 100_000_000_000, // 100 gwei
        gasLimit: 5000000,
        value: 0,
        nonce: 0,
      });

      await chainConnection.handleTx(
        chainConnection.provider.sendTransaction(tx),
      );
    }

    const Create2Factory = Create2Factory__factory.connect(
      CREATE2FACTORY_ADDRESS,
      signer,
    );
    return {
      Create2Factory,
    };
  }
}
