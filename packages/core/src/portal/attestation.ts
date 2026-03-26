import type {
  PublicationAttestationBlockData,
  PublicationAttestationClient,
  PublicationSigner,
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
  signer: Pick<PublicationSigner, 'signMessage'>,
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
  const signedMessageFromSigner = await signer.signMessage(attestationBuffer);
  const signedMessageBuffer =
    signedMessageFromSigner.length === 64
      ? (() => {
          const payload = new Uint8Array(64 + attestationBuffer.length);
          payload.set(signedMessageFromSigner, 0);
          payload.set(attestationBuffer, 64);
          return payload;
        })()
      : signedMessageFromSigner;
  const signature = signedMessageBuffer.slice(0, 64);

  if (signature.length !== 64) {
    throw new Error(
      `Invalid signature length: expected 64, got ${signature.length}`,
    );
  }

  return {
    payload: Buffer.from(signedMessageBuffer).toString('base64'),
    attestationPayload: Buffer.from(signedMessageBuffer).toString('base64'),
    requestUniqueId,
    attestation,
  };
};

export const createAttestationPayloadFromClient = async (
  client: PublicationAttestationClient,
  signer: Pick<PublicationSigner, 'signMessage'>,
): Promise<PublicationAttestationResult> => {
  const blockData = await client.getBlockData();
  return createAttestationPayload(blockData, signer);
};
