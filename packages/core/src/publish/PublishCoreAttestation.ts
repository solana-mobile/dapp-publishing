import { Connection } from '@solana/web3.js';

import {
  createAttestationPayload as createPortalAttestationPayload,
  type PublicationAttestationResult,
} from '../portal/attestation.js';

export type SignWithPublisherKeypair = (buf: Buffer) => Buffer;

type Attestation = PublicationAttestationResult;

export const createAttestationPayload = async (
  connection: Connection,
  sign: SignWithPublisherKeypair,
): Promise<Attestation> => {
  const blockhash = await connection.getLatestBlockhashAndContext('finalized');
  return createPortalAttestationPayload(
    {
      slot: blockhash.context.slot,
      blockhash: blockhash.value.blockhash,
    },
    {
      signMessage: async (message: Uint8Array) => sign(Buffer.from(message)),
    },
  );
};
