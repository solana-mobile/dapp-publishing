import { Connection, GetVersionedBlockConfig } from "@solana/web3.js";
import { SignWithPublisherKeypair } from "./types";

//
// Construct and sign attestation payloads
//

type Attestation = {
  slot_number: number;
  blockhash: string;
  request_unique_id: string;
};

export const createAttestationPayload = async (connection: Connection, sign: SignWithPublisherKeypair) => {
  const REQUEST_UNIQUE_ID_LEN = 32;
  const REQUEST_UNIQUE_ID_CHAR_SET = "0123456789";
  const requestUniqueId = Array(REQUEST_UNIQUE_ID_LEN).fill(undefined).map((_) =>
    REQUEST_UNIQUE_ID_CHAR_SET.charAt(Math.floor(Math.random() * REQUEST_UNIQUE_ID_CHAR_SET.length))
  ).join("")

  const slot = await connection.getSlot("finalized");
  const block = await connection.getBlock(slot, { commitment: "finalized", maxSupportedTransactionVersion: 0, rewards: false, transactionDetails: "none" } as GetVersionedBlockConfig);

  const attestation: Attestation = {
    slot_number: slot,
    blockhash: block?.blockhash!!,
    request_unique_id: requestUniqueId
  };
  const signedAttestation = sign(Buffer.from(JSON.stringify(attestation)));

  return { attestationPayload: Buffer.from(signedAttestation.buffer).toString("base64"), requestUniqueId };
};
