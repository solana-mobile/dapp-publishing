import {
  createAppJson,
  createPublisherJson,
  createReleaseJson,
  validateApp,
  validatePublisher,
  validateRelease,
  metaplexFileReplacer,
} from "@solana-mobile/dapp-store-publishing-tools";
import { debug, showMessage } from "../CliUtils.js";

import type { Keypair } from "@solana/web3.js";
import type { MetaplexFile } from "@metaplex-foundation/js";
import { loadPublishDetailsWithChecks } from "../config/PublishDetails.js";

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
  } = await loadPublishDetailsWithChecks(buildToolsPath);

  debug({ publisherDetails, appDetails, releaseDetails });

  const publisherJson = createPublisherJson(publisherDetails);
  if (typeof publisherJson.image !== "string") {
    publisherJson.image = (publisherJson.image as MetaplexFile)?.fileName;
  }
  debug("publisherJson=", JSON.stringify({ publisherJson }, metaplexFileReplacer, 2));

  try {
    validatePublisher(publisherJson);
  } catch (e) {
    const errorMsg = (e as Error | null)?.message ?? "";
    showMessage(
      "Publisher JSON invalid",
      errorMsg,
      "error"
    )
    return
  }

  const appJson = createAppJson(appDetails, signer.publicKey);
  if (typeof appJson.image !== "string") {
    appJson.image = (appJson.image as MetaplexFile)?.fileName;
  }
  debug("appJson=", JSON.stringify({ appJson }, metaplexFileReplacer, 2));

  try {
    validateApp(appJson);
  } catch (e) {
    const errorMsg = (e as Error | null)?.message ?? "";
    showMessage(
      "App JSON invalid",
      errorMsg,
      "error"
    )
    return
  }

  const releaseJson = await createReleaseJson(
    { releaseDetails, appDetails, publisherDetails },
    signer.publicKey
  );


  if (appDetails.android_package != releaseDetails.android_details.android_package) {
    showMessage(
      "App package name and release package name do not match", 
      "App release specifies " + appDetails.android_package + " while release specifies " + releaseDetails.android_details.android_package,
      "error"
    )
    return
  }

  const objStringified = JSON.stringify(releaseJson, metaplexFileReplacer, 2);
  debug("releaseJson=", objStringified);

  try {
    validateRelease(JSON.parse(objStringified));
  } catch (e) {
    const errorMsg = (e as Error | null)?.message ?? "";
    showMessage(
      "Release JSON invalid",
      errorMsg,
      "error"
    )
    return
  }

  showMessage(
    "Json is Valid",
    "Input data is valid",
    "standard"
  )
};
