import fs from 'node:fs';

import { Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import {
  createPublicationSigner,
  type PublicationSigner,
} from '@solana-mobile/dapp-store-publishing-tools';

import { showMessage } from './messages.js';

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, 'utf-8');
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch {
    showMessage(
      'KeyPair Error',
      'Something went wrong when attempting to retrieve the keypair at ' +
        pathToKeypairFile,
      'error',
    );
  }
};

export function createPublicationSignerFromKeypair(
  keypair: Keypair,
): PublicationSigner {
  return createPublicationSigner({
    publicKey: keypair.publicKey.toBase58(),
    signTransaction: async (transaction: Transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    },
    signMessage: async (message: Uint8Array) =>
      nacl.sign.detached(message, keypair.secretKey),
  });
}
