import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

import { DomainIdToChainName, VerificationInput } from '@abacus-network/sdk';

import { readJSON, writeJSON } from '../src/utils/utils';

import {
  getCoreContractsSdkFilepath,
  getCoreVerificationDirectory,
  getEnvironment,
} from './utils';

async function main() {
  const environment = await getEnvironment();

  let simulatedVerification = readJSON(
    getCoreVerificationDirectory(environment),
    'verification.json',
  );
  let simulatedVerificationRaw = fs.readFileSync(
    path.join(getCoreVerificationDirectory(environment), 'verification.json'),
    { encoding: 'utf8' },
  );
  const coreAddresses = readJSON(
    getCoreContractsSdkFilepath(),
    `${environment}.json`,
  );

  for (const chain of Object.keys(coreAddresses)) {
    console.group(chain);
    const verification = simulatedVerification[chain] as VerificationInput;
    const addresses = coreAddresses[chain];

    // @ts-ignore
    const arbitraryInbox = Object.values(addresses.inboxes)[0].inbox;

    let beacons: any = {};
    let replaceMap: any = {};

    // populate address replacement map
    for (const input of verification) {
      let actual = ethers.constants.AddressZero;
      switch (input.name) {
        case 'upgradeBeaconController':
        case 'abacusConnectionManager':
        case 'outboxValidatorManager':
          actual = addresses[input.name];
          break;
        case 'interchainGasPaymaster':
          actual = ethers.constants.AddressZero;
          break;
        case 'outbox':
          actual = addresses.outbox.implementation;
          break;
        case 'inbox':
          actual = arbitraryInbox.implementation;
          break;
        case 'inboxValidatorManager':
          const remoteDomainId = input.constructorArguments[0];
          const remoteChain = DomainIdToChainName[remoteDomainId];
          actual = addresses.inboxes[remoteChain].inboxValidatorManager;
          break;
        case 'UpgradeBeacon':
          const [implementation, _controller] = input.constructorArguments;
          // match implementation with outbox or inbox
          const outboxVerificationInput = verification.find(
            (v) => v.name === 'outbox',
          )!;
          const inboxVerificationInput = verification.find(
            (v) => v.name === 'inbox',
          )!;
          if (outboxVerificationInput.address === implementation) {
            beacons['outbox'] = input.address;
            actual = addresses.outbox.beacon;
          } else if (inboxVerificationInput.address === implementation) {
            beacons['inbox'] = input.address;
            actual = arbitraryInbox.beacon;
          } else {
            beacons['interchainGasPaymaster'] = input.address;
            actual = ethers.constants.AddressZero;
          }
          break;
        case 'UpgradeBeaconProxy':
          const [beacon, initData] = input.constructorArguments;
          // match beacon with outbox or inbox
          if (beacon === beacons['inbox']) {
            // decode init data
            const abiCoder = new ethers.utils.AbiCoder();
            const inboxInitializeTypes = ['uint32', 'address'];
            const [remoteDomainId, _validatorManager] = abiCoder.decode(
              inboxInitializeTypes,
              `0x${initData.slice(10)}`,
            );
            const remoteChain = DomainIdToChainName[remoteDomainId];

            actual = addresses.inboxes[remoteChain].inbox.proxy;
          } else if (beacon === beacons['outbox']) {
            actual = addresses.outbox.proxy;
          } else {
            // interchainGasPaymaster
            actual = ethers.constants.AddressZero;
          }
          break;
        default:
          throw new Error(`Unknown contract ${input.name}`);
      }
      console.log(`${input.address} ${actual} (${input.name})`);
      replaceMap[input.address.slice(2)] = actual.slice(2);
    }

    console.groupEnd();
    // replace addresses
    for (const [key, val] of Object.entries(replaceMap)) {
      simulatedVerificationRaw = simulatedVerificationRaw.replaceAll(
        `(?i)${key}`, // case-insensitive
        val as string,
      );
    }
  }

  const replaced = JSON.parse(simulatedVerificationRaw);
  writeJSON(
    getCoreVerificationDirectory(environment),
    'verification.json',
    replaced,
  );
}

main().then().catch();
