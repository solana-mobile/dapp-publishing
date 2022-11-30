import {
  createPublisherJson,
  validatePublisher,
  createAppJson,
  validateApp,
  createReleaseJson,
  validateRelease,
} from "@solana-mobile/dapp-publishing-tools";
import { debug, getConfigFile } from "../utils.js";

import type { Keypair } from "@solana/web3.js";

export const validateCommand = async ({ signer }: { signer: Keypair }) => {
  const {
    publisher: publisherDetails,
    app: appDetails,
    release: releaseDetails,
  } = getConfigFile();

  debug({ publisherDetails, appDetails, releaseDetails });

  const publisherJson = createPublisherJson(publisherDetails);
  debug(JSON.stringify({ publisherJson }, null, 2));

  try {
    validatePublisher(publisherJson);
    console.info(`Publisher JSON valid!`);
  } catch (e) {
    console.error(e);
  }

  const appJson = createAppJson(appDetails, signer.publicKey);
  debug(JSON.stringify({ appJson }, null, 2));

  try {
    validateApp(appJson);
    console.info(`App JSON valid!`);
  } catch (e) {
    console.error(e);
  }

  const releaseJson = await createReleaseJson(
    { releaseDetails, appDetails, publisherDetails },
    signer.publicKey
  );
  debug(JSON.stringify({ releaseJson }, null, 2));

  try {
    validateRelease(releaseJson);
    console.info(`Release JSON valid!`);
  } catch (e) {
    console.error(e);
  }
};
