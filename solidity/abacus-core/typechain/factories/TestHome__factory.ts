/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import {
  Signer,
  utils,
  BigNumberish,
  Contract,
  ContractFactory,
  Overrides,
} from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type { TestHome, TestHomeInterface } from "../TestHome";

const _abi = [
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_localDomain",
        type: "uint32",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "messageHash",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "leafIndex",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint64",
        name: "destinationAndNonce",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "committedRoot",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "message",
        type: "bytes",
      },
    ],
    name: "Dispatch",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "oldRoot",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32[2]",
        name: "newRoot",
        type: "bytes32[2]",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "signature2",
        type: "bytes",
      },
    ],
    name: "DoubleUpdate",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "oldRoot",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "newRoot",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "ImproperUpdate",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "updater",
        type: "address",
      },
    ],
    name: "NewUpdater",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "updaterManager",
        type: "address",
      },
    ],
    name: "NewUpdaterManager",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint32",
        name: "homeDomain",
        type: "uint32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "oldRoot",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "newRoot",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "Update",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "updater",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "reporter",
        type: "address",
      },
    ],
    name: "UpdaterSlashed",
    type: "event",
  },
  {
    inputs: [],
    name: "MAX_MESSAGE_BODY_BYTES",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "committedRoot",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "count",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_destinationDomain",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "_recipientAddress",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "_messageBody",
        type: "bytes",
      },
    ],
    name: "dispatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "_oldRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes32[2]",
        name: "_newRoot",
        type: "bytes32[2]",
      },
      {
        internalType: "bytes",
        name: "_signature",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "_signature2",
        type: "bytes",
      },
    ],
    name: "doubleUpdate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "homeDomainHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "_oldRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "_newRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "_signature",
        type: "bytes",
      },
    ],
    name: "improperUpdate",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract IUpdaterManager",
        name: "_updaterManager",
        type: "address",
      },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "localDomain",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextLeafIndex",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    name: "nonces",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "proof",
    outputs: [
      {
        internalType: "bytes32[32]",
        name: "",
        type: "bytes32[32]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "_item",
        type: "bytes32",
      },
    ],
    name: "queueContains",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "queueEnd",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "queueLength",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "root",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "setFailed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_updater",
        type: "address",
      },
    ],
    name: "setUpdater",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_updaterManager",
        type: "address",
      },
    ],
    name: "setUpdaterManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "state",
    outputs: [
      {
        internalType: "enum Common.States",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "suggestUpdate",
    outputs: [
      {
        internalType: "bytes32",
        name: "_committedRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "_new",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_destination",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "_nonce",
        type: "uint32",
      },
    ],
    name: "testDestinationAndNonce",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [],
    name: "testHomeDomainHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "tree",
    outputs: [
      {
        internalType: "uint256",
        name: "count",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "_committedRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "_newRoot",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "_signature",
        type: "bytes",
      },
    ],
    name: "update",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "updater",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "updaterManager",
    outputs: [
      {
        internalType: "contract IUpdaterManager",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const _bytecode =
  "0x60a060405234801561001057600080fd5b506040516131d93803806131d98339818101604052602081101561003357600080fd5b505160e081901b6001600160e01b03191660805263ffffffff1661316661007360003980610a785280610bde52806110b552806116fd52506131666000f3fe608060405234801561001057600080fd5b50600436106101e55760003560e01c80639776120e1161010f578063df034cd0116100a2578063fa31de0111610071578063fa31de011461069b578063faf924cf14610753578063fd54b22814610794578063ffa1ad741461079c576101e5565b8063df034cd014610650578063ebf0c71714610658578063f2fde38b14610660578063f6d1610214610693576101e5565b8063b31c01fb116100de578063b31c01fb1461051f578063b95a2001146105d1578063c19d93fb146105f4578063c4d66de81461061d576101e5565b80639776120e146104a95780639d54f419146104dc5780639df6c8e11461050f578063ab91c7b014610517576101e5565b80635146366e11610187578063715018a611610156578063715018a61461039d5780638d3638f4146103a55780638da5cb5b146103c65780638e4e30e0146103f7576101e5565b80635146366e1461033d5780635221c81814610345578063522ae0021461038d57806367a6771d14610395576101e5565b806319d9d21a116101c357806319d9d21a146102165780632bef2892146102e357806336e104de1461031457806345630b1a14610335576101e5565b806306661abd146101ea5780630be4f42214610204578063146901db1461020c575b600080fd5b6101f26107ba565b60408051918252519081900360200190f35b6101f26107c0565b6102146107cf565b005b610214600480360360a081101561022c57600080fd5b813591602081019181019060808101606082013564010000000081111561025257600080fd5b82018360208201111561026457600080fd5b8035906020019184600183028401116401000000008311171561028657600080fd5b9193909290916020810190356401000000008111156102a457600080fd5b8201836020820111156102b657600080fd5b803590602001918460018302840111640100000000831117156102d857600080fd5b5090925090506107d9565b610300600480360360208110156102f957600080fd5b5035610a36565b604080519115158252519081900360200190f35b61031c610a49565b6040805192835260208301919091528051918290030190f35b6101f2610a71565b6101f2610a9c565b6103706004803603604081101561035b57600080fd5b5063ffffffff81358116916020013516610aa6565b6040805167ffffffffffffffff9092168252519081900360200190f35b6101f2610ab9565b6101f2610abf565b610214610ac5565b6103ad610bdc565b6040805163ffffffff9092168252519081900360200190f35b6103ce610c00565b6040805173ffffffffffffffffffffffffffffffffffffffff9092168252519081900360200190f35b6103006004803603606081101561040d57600080fd5b81359160208101359181019060608101604082013564010000000081111561043457600080fd5b82018360208201111561044657600080fd5b8035906020019184600183028401116401000000008311171561046857600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550610c1c945050505050565b610214600480360360208110156104bf57600080fd5b503573ffffffffffffffffffffffffffffffffffffffff16610e6e565b610214600480360360208110156104f257600080fd5b503573ffffffffffffffffffffffffffffffffffffffff16610f22565b6103ce610fb2565b6101f2610fcf565b6102146004803603606081101561053557600080fd5b81359160208101359181019060608101604082013564010000000081111561055c57600080fd5b82018360208201111561056e57600080fd5b8035906020019184600183028401116401000000008311171561059057600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550610fdb945050505050565b6103ad600480360360208110156105e757600080fd5b503563ffffffff16611179565b6105fc611192565b6040518082600281111561060c57fe5b815260200191505060405180910390f35b6102146004803603602081101561063357600080fd5b503573ffffffffffffffffffffffffffffffffffffffff166111b3565b6103ce6113ce565b6101f26113ea565b6102146004803603602081101561067657600080fd5b503573ffffffffffffffffffffffffffffffffffffffff166113f6565b6101f2611598565b610214600480360360608110156106b157600080fd5b63ffffffff823516916020810135918101906060810160408201356401000000008111156106de57600080fd5b8201836020820111156106f057600080fd5b8035906020019184600183028401116401000000008311171561071257600080fd5b91908080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152509295506115a4945050505050565b61075b61181a565b604051808261040080838360005b83811015610781578181015183820152602001610769565b5050505090500191505060405180910390f35b6101f261192d565b6107a4611933565b6040805160ff9092168252519081900360200190f35b60545490565b60006107ca6107ba565b905090565b6107d7611938565b565b600260865474010000000000000000000000000000000000000000900460ff16600281111561080457fe5b141561087157604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f6661696c65642073746174650000000000000000000000000000000000000000604482015290519081900360640190fd5b604080516020601f86018190048102820181019092528481526108b3918891883591889088908190840183828082843760009201919091525061197992505050565b8015610902575061090286866001602002013584848080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061197992505050565b801561091357508435602086013514155b15610a2e57610920611a0b565b7f2c3f60bab4170347826231b75a920b5053941ddebc6eed6fd2c25721648b186f8686868686866040518087815260200186600260200280828437600083820152601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01690910182810360409081018252810186905290506020810160608201878780828437600083820152601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01690910184810383528581526020019050858580828437600083820152604051601f9091017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169092018290039a509098505050505050505050a15b505050505050565b6000610a43600183611ae7565b92915050565b600080610a566001611b57565b15610a6d576087549150610a6a6001611b97565b90505b9091565b60006107ca7f0000000000000000000000000000000000000000000000000000000000000000611bd4565b60006107ca610a71565b6000610ab28383611c49565b9392505050565b61080081565b60875481565b610acd611c63565b73ffffffffffffffffffffffffffffffffffffffff16610aeb610c00565b73ffffffffffffffffffffffffffffffffffffffff1614610b6d57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b60e95460405160009173ffffffffffffffffffffffffffffffffffffffff16907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908390a360e980547fffffffffffffffffffffffff0000000000000000000000000000000000000000169055565b7f000000000000000000000000000000000000000000000000000000000000000081565b60e95473ffffffffffffffffffffffffffffffffffffffff1690565b6000600260865474010000000000000000000000000000000000000000900460ff166002811115610c4957fe5b1415610cb657604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f6661696c65642073746174650000000000000000000000000000000000000000604482015290519081900360640190fd5b610cc1848484611979565b610d2c57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f2175706461746572207369670000000000000000000000000000000000000000604482015290519081900360640190fd5b6087548414610d9c57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601460248201527f6e6f7420612063757272656e7420757064617465000000000000000000000000604482015290519081900360640190fd5b610da7600184611ae7565b610e6457610db3611a0b565b7f6844fd5e21c932b5197b78ac11bf96e2eaa4e882dd0c88087060cf2065c04ab28484846040518084815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b83811015610e20578181015183820152602001610e08565b50505050905090810190601f168015610e4d5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a1506001610ab2565b5060009392505050565b610e76611c63565b73ffffffffffffffffffffffffffffffffffffffff16610e94610c00565b73ffffffffffffffffffffffffffffffffffffffff1614610f1657604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b610f1f81611c67565b50565b61011c5473ffffffffffffffffffffffffffffffffffffffff163314610fa957604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600f60248201527f21757064617465724d616e616765720000000000000000000000000000000000604482015290519081900360640190fd5b610f1f81611d55565b61011c5473ffffffffffffffffffffffffffffffffffffffff1681565b60006107ca6001611b57565b600260865474010000000000000000000000000000000000000000900460ff16600281111561100657fe5b141561107357604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f6661696c65642073746174650000000000000000000000000000000000000000604482015290519081900360640190fd5b61107e838383610c1c565b1561108857611174565b60006110946001611dce565b9050828114156110a457506110aa565b50611088565b8160878190555081837f000000000000000000000000000000000000000000000000000000000000000063ffffffff167f608828ad904a0c9250c09004ba7226efb08f35a5c815bb3f76b5a8a271cd08b2846040518080602001828103825283818151815260200191508051906020019080838360005b83811015611139578181015183820152602001611121565b50505050905090810190601f1680156111665780820380516001836020036101000a031916815260200191505b509250505060405180910390a45b505050565b61011b6020526000908152604090205463ffffffff1681565b60865474010000000000000000000000000000000000000000900460ff1681565b600054610100900460ff16806111cc57506111cc611f07565b806111da575060005460ff16155b61122f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff1615801561129557600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790555b61129d611f18565b6112a561203b565b6112ae82611c67565b61011c54604080517fdf034cd0000000000000000000000000000000000000000000000000000000008152905160009273ffffffffffffffffffffffffffffffffffffffff169163df034cd0916004808301926020929190829003018186803b15801561131a57600080fd5b505afa15801561132e573d6000803e3d6000fd5b505050506040513d602081101561134457600080fd5b5051905061135181612127565b6040805173ffffffffffffffffffffffffffffffffffffffff8316815290517f9e5f57e4ee5f9eeac3131028d48f19d80820ce6fa93c4c66cc82a3e2b9837c329181900360200190a15080156113ca57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff1690555b5050565b60865473ffffffffffffffffffffffffffffffffffffffff1681565b60006107ca60346122b4565b6113fe611c63565b73ffffffffffffffffffffffffffffffffffffffff1661141c610c00565b73ffffffffffffffffffffffffffffffffffffffff161461149e57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b73ffffffffffffffffffffffffffffffffffffffff811661150a576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806130996026913960400191505060405180910390fd5b60e95460405173ffffffffffffffffffffffffffffffffffffffff8084169216907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a360e980547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff92909216919091179055565b60006107ca6001611b97565b600260865474010000000000000000000000000000000000000000900460ff1660028111156115cf57fe5b141561163c57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f6661696c65642073746174650000000000000000000000000000000000000000604482015290519081900360640190fd5b610800815111156116ae57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f6d736720746f6f206c6f6e670000000000000000000000000000000000000000604482015290519081900360640190fd5b63ffffffff808416600090815261011b602052604081208054808416600181019094167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000009091161790556117267f000000000000000000000000000000000000000000000000000000000000000033848888886122c7565b8051602082012090915061173b60348261239d565b61174e6117466113ea565b6001906124a5565b506117598684611c49565b67ffffffffffffffff16600161176d6107ba565b03827f9d4c83d2e57d7d381feb264b44a5015e7f9ef26340f4fc46b558a6dc16dd811a608754866040518083815260200180602001828103825283818151815260200191508051906020019080838360005b838110156117d75781810151838201526020016117bf565b50505050905090810190601f1680156118045780820380516001836020036101000a031916815260200191505b50935050505060405180910390a4505050505050565b611822613079565b61182a613079565b6000611834612512565b6054549091506000805b602081101561192357600183821c1660006034836020811061185c57fe5b0154905081600114156118b5578087846020811061187657fe5b60200201818152505080846040516020018083815260200182815260200192505050604051602081830303815290604052805190602001209350611919565b838684602081106118c257fe5b6020020151604051602001808381526020018281526020019250505060405160208183030381529060405280519060200120935085836020811061190257fe5b602002015187846020811061191357fe5b60200201525b505060010161183e565b5092935050505090565b60545481565b600081565b608680547fffffffffffffffffffffff00ffffffffffffffffffffffffffffffffffffffff1674020000000000000000000000000000000000000000179055565b600080611984610a71565b85856040516020018084815260200183815260200182815260200193505050506040516020818303038152906040528051906020012090506119c5816129d3565b60865490915073ffffffffffffffffffffffffffffffffffffffff166119eb8285612a24565b73ffffffffffffffffffffffffffffffffffffffff161495945050505050565b611a13611938565b61011c54604080517f5b3c2cbf000000000000000000000000000000000000000000000000000000008152336004820152905173ffffffffffffffffffffffffffffffffffffffff90921691635b3c2cbf9160248082019260009290919082900301818387803b158015611a8657600080fd5b505af1158015611a9a573d6000803e3d6000fd5b505060865460405133935073ffffffffffffffffffffffffffffffffffffffff90911691507f98064af315f26d7333ba107ba43a128ec74345f4d4e6f2549840fe092a1c8bce90600090a3565b81546000906fffffffffffffffffffffffffffffffff165b835470010000000000000000000000000000000090046fffffffffffffffffffffffffffffffff168111610e64576000818152600185016020526040902054831415611b4f576001915050610a43565b600101611aff565b80546000906fffffffffffffffffffffffffffffffff700100000000000000000000000000000000820481169116611b8f8282612abe565b949350505050565b805470010000000000000000000000000000000090046fffffffffffffffffffffffffffffffff1660009081526001909101602052604090205490565b6040805160e09290921b7fffffffff00000000000000000000000000000000000000000000000000000000166020808401919091527f4f5054494353000000000000000000000000000000000000000000000000000060248401528151808403600a018152602a909301909152815191012090565b63ffffffff1660209190911b67ffffffff00000000161790565b3390565b611c7081612ad8565b611cdb57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601860248201527f21636f6e747261637420757064617465724d616e616765720000000000000000604482015290519081900360640190fd5b61011c805473ffffffffffffffffffffffffffffffffffffffff83167fffffffffffffffffffffffff0000000000000000000000000000000000000000909116811790915560408051918252517f958d788fb4c373604cd4c73aa8c592de127d0819b49bb4dc02c8ecd666e965bf9181900360200190a150565b6086805473ffffffffffffffffffffffffffffffffffffffff83167fffffffffffffffffffffffff0000000000000000000000000000000000000000909116811790915560408051918252517f9e5f57e4ee5f9eeac3131028d48f19d80820ce6fa93c4c66cc82a3e2b9837c329181900360200190a150565b80546000906fffffffffffffffffffffffffffffffff700100000000000000000000000000000000820481169116611e068282612abe565b611e7157604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600560248201527f456d707479000000000000000000000000000000000000000000000000000000604482015290519081900360640190fd5b6fffffffffffffffffffffffffffffffff8116600090815260018501602052604090205492508215611ec2576fffffffffffffffffffffffffffffffff811660009081526001850160205260408120555b83547fffffffffffffffffffffffffffffffff00000000000000000000000000000000166001919091016fffffffffffffffffffffffffffffffff1617909255919050565b6000611f1230612ad8565b15905090565b600054610100900460ff1680611f315750611f31611f07565b80611f3f575060005460ff16155b611f94576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff16158015611ffa57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790555b612002612ade565b61200a612bf0565b8015610f1f57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff16905550565b600054610100900460ff16806120545750612054611f07565b80612062575060005460ff16155b6120b7576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff1615801561211d57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790555b61200a6001612d80565b600054610100900460ff16806121405750612140611f07565b8061214e575060005460ff16155b6121a3576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff1615801561220957600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790555b608680547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff8416177fffffffffffffffffffffff00ffffffffffffffffffffffffffffffffffffffff167401000000000000000000000000000000000000000017905580156113ca57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff1690555050565b6000610a43826122c2612512565b612dc4565b6060868686868686604051602001808763ffffffff1660e01b81526004018681526020018563ffffffff1660e01b81526004018463ffffffff1660e01b815260040183815260200182805190602001908083835b6020831061235857805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0909201916020918201910161231b565b6001836020036101000a038019825116818451168082178552505050505050905001965050505050505060405160208183030381529060405290509695505050505050565b602082015463ffffffff1161241357604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601060248201527f6d65726b6c6520747265652066756c6c00000000000000000000000000000000604482015290519081900360640190fd5b6020820180546001019081905560005b60208110156124a257816001166001141561244f578284826020811061244557fe5b0155506113ca9050565b83816020811061245b57fe5b01548360405160200180838152602001828152602001925050506040516020818303038152906040528051906020012092506002828161249757fe5b049150600101612423565b50fe5b81546fffffffffffffffffffffffffffffffff8082167001000000000000000000000000000000009283900482166001019182169092029190911783558115610a43576fffffffffffffffffffffffffffffffff8116600090815260019390930160205260409092205590565b61251a613079565b600081527fad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb560208201527fb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3060408201527f21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba8560608201527fe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a1934460808201527f0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d60a08201527f887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a196860c08201527fffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f8360e08201527f9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af6101008201527fcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e06101208201527ff9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a56101408201527ff8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8926101608201527f3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c6101808201527fc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb6101a08201527f5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc6101c08201527fda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d26101e08201527f2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f6102008201527fe1d3b5c807b281e4683cc6d6315cf95b9ade8641defcb32372f1c126e398ef7a6102208201527f5a2dce0a8a7f68bb74560f8f71837c2c2ebbcbf7fffb42ae1896f13f7c7479a06102408201527fb46a28b6f55540f89444f63de0378e3d121be09e06cc9ded1c20e65876d36aa06102608201527fc65e9645644786b620e2dd2ad648ddfcbf4a7e5b1a3a4ecfe7f64667a3f0b7e26102808201527ff4418588ed35a2458cffeb39b93d26f18d2ab13bdce6aee58e7b99359ec2dfd96102a08201527f5a9c16dc00d6ef18b7933a6f8dc65ccb55667138776f7dea101070dc8796e3776102c08201527f4df84f40ae0c8229d0d6069e5c8f39a7c299677a09d367fc7b05e3bc380ee6526102e08201527fcdc72595f74c7b1043d0e1ffbab734648c838dfb0527d971b602bc216c9619ef6103008201527f0abf5ac974a1ed57f4050aa510dd9c74f508277b39d7973bb2dfccc5eeb0618d6103208201527fb8cd74046ff337f0a7bf2c8e03e10f642c1886798d71806ab1e888d9e5ee87d06103408201527f838c5655cb21c6cb83313b5a631175dff4963772cce9108188b34ac87c81c41e6103608201527f662ee4dd2dd7b2bc707961b1e646c4047669dcb6584f0d8d770daf5d7e7deb2e6103808201527f388ab20e2573d171a88108e79d820e98f26c0b84aa8b2f4aa4968dbb818ea3226103a08201527f93237c50ba75ee485f4c22adf2f741400bdf8d6a9cc7df7ecae576221665d7356103c08201527f8448818bb4ae4562849e949e17ac16e0be16688e156b5cf15e098c627c0056a96103e082015290565b604080517f19457468657265756d205369676e6564204d6573736167653a0a333200000000602080830191909152603c8083019490945282518083039094018452605c909101909152815191012090565b60008151604114612a9657604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601f60248201527f45434453413a20696e76616c6964207369676e6174757265206c656e67746800604482015290519081900360640190fd5b60208201516040830151606084015160001a612ab486828585612e82565b9695505050505050565b60019103016fffffffffffffffffffffffffffffffff1690565b3b151590565b600054610100900460ff1680612af75750612af7611f07565b80612b05575060005460ff16155b612b5a576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff1615801561200a57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790558015610f1f57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff16905550565b600054610100900460ff1680612c095750612c09611f07565b80612c17575060005460ff16155b612c6c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e8152602001806130e1602e913960400191505060405180910390fd5b600054610100900460ff16158015612cd257600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff909116610100171660011790555b6000612cdc611c63565b60e980547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff8316908117909155604051919250906000907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a3508015610f1f57600080547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff16905550565b80546fffffffffffffffffffffffffffffffff16610f1f5780547fffffffffffffffffffffffffffffffff0000000000000000000000000000000016600117815550565b6020820154600090815b6020811015612e7a57600182821c166000868360208110612deb57fe5b015490508160011415612e2e5780856040516020018083815260200182815260200192505050604051602081830303815290604052805190602001209450612e70565b84868460208110612e3b57fe5b602002015160405160200180838152602001828152602001925050506040516020818303038152906040528051906020012094505b5050600101612dce565b505092915050565b60007f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0821115612efd576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806130bf6022913960400191505060405180910390fd5b8360ff16601b1480612f1257508360ff16601c145b612f67576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602281526020018061310f6022913960400191505060405180910390fd5b600060018686868660405160008152602001604052604051808581526020018460ff1681526020018381526020018281526020019450505050506020604051602081039080840390855afa158015612fc3573d6000803e3d6000fd5b50506040517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0015191505073ffffffffffffffffffffffffffffffffffffffff811661307057604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601860248201527f45434453413a20696e76616c6964207369676e61747572650000000000000000604482015290519081900360640190fd5b95945050505050565b604051806104000160405280602090602082028036833750919291505056fe4f776e61626c653a206e6577206f776e657220697320746865207a65726f206164647265737345434453413a20696e76616c6964207369676e6174757265202773272076616c7565496e697469616c697a61626c653a20636f6e747261637420697320616c726561647920696e697469616c697a656445434453413a20696e76616c6964207369676e6174757265202776272076616c7565a2646970667358221220574f522ea31d17541da761da64547c4b78f7dafce6ea995148677dd8671a857164736f6c63430007060033";

export class TestHome__factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _localDomain: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<TestHome> {
    return super.deploy(_localDomain, overrides || {}) as Promise<TestHome>;
  }
  getDeployTransaction(
    _localDomain: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(_localDomain, overrides || {});
  }
  attach(address: string): TestHome {
    return super.attach(address) as TestHome;
  }
  connect(signer: Signer): TestHome__factory {
    return super.connect(signer) as TestHome__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): TestHomeInterface {
    return new utils.Interface(_abi) as TestHomeInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): TestHome {
    return new Contract(address, _abi, signerOrProvider) as TestHome;
  }
}
