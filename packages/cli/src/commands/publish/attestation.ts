import { Connection, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

//
// Construct and sign attestation payloads
//

type Attestation = {
  timestamp_blockhash: string;
  request_unique_id: string;
};

export const createAttestationPayload = async (connection: Connection, publisher: Keypair) => {
  const REQUEST_UNIQUE_ID_LEN = 32;
  const REQUEST_UNIQUE_ID_CHAR_SET = "0123456789";
  const requestUniqueId = Array(REQUEST_UNIQUE_ID_LEN).fill(undefined).map((_) =>
    REQUEST_UNIQUE_ID_CHAR_SET.charAt(Math.floor(Math.random() * REQUEST_UNIQUE_ID_CHAR_SET.length))
  ).join("")

  const blockhash = await connection.getLatestBlockhash();

  const attestation: Attestation = {
    timestamp_blockhash: blockhash.blockhash,
    request_unique_id: requestUniqueId
  };
  const signedAttestation = nacl.sign(Buffer.from(JSON.stringify(attestation)), publisher.secretKey);

  return { attestationPayload: Buffer.from(signedAttestation.buffer).toString("base64"), requestUniqueId };
};
