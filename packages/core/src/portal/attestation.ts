import { createSignableMessage, type MessagePartialSigner } from '@solana/kit';

import type {
  PublicationAttestationBlockData,
  PublicationAttestationClient,
} from './types.js';

export type PublicationAttestation = {
  slot_number: number;
  blockhash: string;
  request_unique_id: string;
};

export type PublicationAttestationResult = {
  payload: string;
  attestationPayload: string;
  requestUniqueId: string;
  attestation: PublicationAttestation;
};

export const createRequestUniqueId = () => {
  const requestUniqueIdLength = 32;
  const charset = '0123456789';

  return Array(requestUniqueIdLength)
    .fill(undefined)
    .map(() => charset.charAt(Math.floor(Math.random() * charset.length)))
    .join('');
};

export const createAttestationPayload = async (
  blockData: PublicationAttestationBlockData,
  signer: MessagePartialSigner,
): Promise<PublicationAttestationResult> => {
  const requestUniqueId = createRequestUniqueId();
  const attestation: PublicationAttestation = {
    slot_number: blockData.slot,
    blockhash: blockData.blockhash,
    request_unique_id: requestUniqueId,
  };

  const attestationBuffer = new TextEncoder().encode(
    JSON.stringify(attestation),
  );
  const [signatures] = await signer.signMessages([
    createSignableMessage(attestationBuffer),
  ]);
  const signature = signatures?.[signer.address];

  if (signature?.length !== 64) {
    throw new Error(
      `Invalid signature length: expected 64, got ${signature?.length ?? 0}`,
    );
  }

  const signedMessageBuffer = new Uint8Array(64 + attestationBuffer.length);
  signedMessageBuffer.set(signature, 0);
  signedMessageBuffer.set(attestationBuffer, 64);

  return {
    payload: Buffer.from(signedMessageBuffer).toString('base64'),
    attestationPayload: Buffer.from(signedMessageBuffer).toString('base64'),
    requestUniqueId,
    attestation,
  };
};

export const createAttestationPayloadFromClient = async (
  client: PublicationAttestationClient,
  signer: MessagePartialSigner,
): Promise<PublicationAttestationResult> => {
  const blockData = await client.getBlockData();
  return createAttestationPayload(blockData, signer);
};
