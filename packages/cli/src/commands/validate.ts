import {
  createAppJson,
  createPublisherJson,
  createReleaseJson,
  validateApp,
  validatePublisher,
  validateRelease,
} from "@solana-mobile/dapp-publishing-tools";
import { debug, getConfigFile } from "../utils.js";

import type { Keypair } from "@solana/web3.js";
import type { MetaplexFile } from "@metaplex-foundation/js";

export const validateCommand = async ({
  signer,
  buildToolsPath,
}: {
  signer: Keypair;
  buildToolsPath?: string;
}) => {
  const {
    publisher: publisherDetails,
    app: appDetails,
    release: releaseDetails,
  } = await getConfigFile(buildToolsPath);

  debug({ publisherDetails, appDetails, releaseDetails });

  const publisherJson = createPublisherJson(publisherDetails);
  if (typeof publisherJson.image !== "string") {
    publisherJson.image = (publisherJson.image as MetaplexFile).fileName;
  }
  debug(JSON.stringify({ publisherJson }, null, 2));

  try {
    validatePublisher(publisherJson);
    console.info(`Publisher JSON valid!`);
  } catch (e) {
    console.error(e);
  }

  const appJson = createAppJson(appDetails, signer.publicKey);
  if (typeof appJson.image !== "string") {
    appJson.image = (appJson.image as MetaplexFile).fileName;
  }
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
