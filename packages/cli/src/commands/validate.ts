import {
  createPublisherJson,
  validatePublisher,
  createAppJson,
  validateApp,
  createReleaseJson,
  validateRelease,
} from "@solana-mobile/dapp-publishing-tools";
import { getPublisherDetails } from "./create/publisher.js";
import type { Keypair } from "@solana/web3.js";
import { debug } from "../utils.js";
import { getAppDetails, getReleaseDetails } from "./create/index.js";

export const validateCommand = async ({ signer }: { signer: Keypair }) => {
  const publisherDetails = await getPublisherDetails({
    publisherAddress: signer.publicKey,
  });
  debug({ publisherDetails });

  const publisherJson = createPublisherJson(publisherDetails);
  debug(JSON.stringify({ publisherJson }, null, 2));

  try {
    validatePublisher(publisherJson);
    console.info(`Publisher JSON valid!`);
  } catch (e) {
    console.error(e);
  }

  const appDetails = await getAppDetails();
  debug({ appDetails });

  const appJson = createAppJson(appDetails, signer.publicKey);
  debug(JSON.stringify({ appJson }, null, 2));

  try {
    validateApp(appJson);
    console.info(`App JSON valid!`);
  } catch (e) {
    console.error(e);
  }

  const releaseDetails = await getReleaseDetails();
  debug({ releaseDetails });

  const releaseJson = createReleaseJson(releaseDetails, signer.publicKey);
  debug(JSON.stringify({ releaseJson }, null, 2));

  try {
    validateRelease(releaseJson);
    console.info(`Release JSON valid!`);
  } catch (e) {
    console.error(e);
  }
};
