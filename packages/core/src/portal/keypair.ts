import fs from "node:fs";

import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";

import { PublishingError } from "../errors.js";
import { createPublicationSigner } from "./signer.js";
import type { PublicationSigner } from "./types.js";

export function createPublicationSignerFromKeypair(
  keypair: Keypair
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

/** Loads a Solana CLI JSON keypair file (array of 64 secret key bytes). */
export function loadKeypairSignerFromFile(path: string): PublicationSigner {
  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(path, "utf-8")))
    );
  } catch (error) {
    throw new PublishingError(
      "INVALID_KEYPAIR",
      `Unable to load a Solana keypair from ${path}`,
      { cause: error }
    );
  }
  return createPublicationSignerFromKeypair(keypair);
}
