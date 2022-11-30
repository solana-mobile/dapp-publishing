import {
  createAppJson,
  createPublisherJson,
  createReleaseJson,
  validateApp,
  validatePublisher,
  validateRelease
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

  // TODO(jon): Remove this hardcoded version
  const { release: releaseDetails } = await getReleaseDetails("v1.0.2", "./my-apk.apk");
  debug({ releaseDetails });

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
