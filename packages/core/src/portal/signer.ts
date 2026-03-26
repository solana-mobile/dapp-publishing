import { Transaction } from '@solana/web3.js';

import type { PublicationSigner } from './types.js';

export type PublicationSignerAdapter = {
  publicKey: string;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export const createPublicationSigner = (
  adapter: PublicationSignerAdapter,
): PublicationSigner => ({
  publicKey: adapter.publicKey,
  signTransaction: adapter.signTransaction,
  signMessage: adapter.signMessage,
});

export const isPublicationSigner = (
  value: unknown,
): value is PublicationSigner =>
  typeof value === 'object' &&
  value !== null &&
  'publicKey' in value &&
  'signTransaction' in value &&
  'signMessage' in value;

export const signSerializedTransaction = async (
  signer: PublicationSigner,
  serializedTransaction: string,
): Promise<string> => {
  const transaction = Transaction.from(
    Buffer.from(serializedTransaction, 'base64'),
  );
  const signedTransaction = await signer.signTransaction(transaction);
  return signedTransaction.serialize().toString('base64');
};

