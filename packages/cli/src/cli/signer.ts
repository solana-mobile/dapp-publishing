import {
  loadKeypairSignerFromFile,
  type PublicationSigner,
} from "@solana-mobile/dapp-store-publishing-tools";

import { showMessage } from "./messages.js";

export const parseKeypair = (
  pathToKeypairFile: string
): PublicationSigner | undefined => {
  try {
    return loadKeypairSignerFromFile(pathToKeypairFile);
  } catch {
    showMessage(
      "KeyPair Error",
      "Something went wrong when attempting to retrieve the keypair at " +
        pathToKeypairFile,
      "error"
    );
  }
};
