import fs from "node:fs";

import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";

import { PublishingError } from "../errors.js";

/** Loads a Solana CLI JSON keypair file (array of 64 secret key bytes). */
export async function loadKeypairSignerFromFile(
  path: string
): Promise<KeyPairSigner> {
  try {
    return await createKeyPairSignerFromBytes(
      new Uint8Array(JSON.parse(fs.readFileSync(path, "utf-8")))
    );
  } catch (error) {
    throw new PublishingError(
      "INVALID_KEYPAIR",
      `Unable to load a Solana keypair from ${path}`,
      { cause: error }
    );
  }
}
