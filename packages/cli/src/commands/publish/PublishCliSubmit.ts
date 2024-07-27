import { AccountInfo, Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { SignWithPublisherKeypair } from "@solana-mobile/dapp-store-publishing-tools";
import { publishSubmit } from "@solana-mobile/dapp-store-publishing-tools";
import nacl from "tweetnacl";
import { checkMintedStatus, showMessage } from "../../CliUtils.js";
import { Buffer } from "buffer";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

type PublishSubmitCommandInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
  alphaTest?: boolean;
};

export const publishSubmitCommand = async ({
  appMintAddress,
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  compliesWithSolanaDappStorePolicies = false,
  requestorIsAuthorized = false,
  alphaTest
}: PublishSubmitCommandInput) => {
  showMessage(
    `Publishing Estimates`,
    "New app submissions take around 3-4 business days for review.",
    "warning"
  );

  if (!compliesWithSolanaDappStorePolicies) {
    console.error(
      "ERROR: Cannot submit a request for which the requestor does not attest that it complies with Solana dApp Store policies"
    );
    return;
  } else if (!requestorIsAuthorized) {
    console.error(
      "ERROR: Cannot submit a request for which the requestor does not attest they are authorized to do so"
    );
    return;
  }

  const connection = new Connection(url);
  const {
    publisher: publisherDetails,
    app: appDetails,
    release: releaseDetails,
    solana_mobile_dapp_publisher_portal: solanaMobileDappPublisherPortalDetails,
    lastUpdatedVersionOnStore: lastUpdatedVersionOnStore,
  } = await loadPublishDetailsWithChecks();

  if (alphaTest && solanaMobileDappPublisherPortalDetails.alpha_testers == undefined) {
    throw new Error(`Alpha test submission without specifying any testers.\nAdd field alpha_testers in your 'config.yaml' file.`)
  }

  const sign = ((buf: Buffer) =>
    nacl.sign(buf, signer.secretKey)) as SignWithPublisherKeypair;

  const pubAddr = publisherDetails.address;
  const appAddr = appMintAddress ?? appDetails.address;
  const releaseAddr = releaseMintAddress ?? releaseDetails.address;

  if (lastUpdatedVersionOnStore != null && releaseAddr === lastUpdatedVersionOnStore.address) {
    throw new Error(`You've already submitted this version for review.`);
  }

  await checkMintedStatus(connection, pubAddr, appAddr, releaseAddr);

  await publishSubmit(
    { connection, sign },
    {
      appMintAddress: appAddr,
      releaseMintAddress: releaseAddr,
      publisherDetails,
      solanaMobileDappPublisherPortalDetails,
      compliesWithSolanaDappStorePolicies,
      requestorIsAuthorized,
      alphaTest,
    },
    dryRun
  );

  if (!alphaTest) {
    await writeToPublishDetails(
      {
        lastUpdatedVersionOnStore: { address: releaseAddr }
      });
  }
};
