import {
  loadKeypairSignerFromFile,
  type PublicationSigner,
} from "@solana-mobile/dapp-store-publishing-tools";

import { showMessage } from "./messages.js";

export const parseKeypair = async (
  pathToKeypairFile: string
): Promise<PublicationSigner | undefined> => {
  try {
    return await loadKeypairSignerFromFile(pathToKeypairFile);
  } catch {
    showMessage(
      "KeyPair Error",
      "Something went wrong when attempting to retrieve the keypair at " +
        pathToKeypairFile,
      "error"
    );
  }
};
