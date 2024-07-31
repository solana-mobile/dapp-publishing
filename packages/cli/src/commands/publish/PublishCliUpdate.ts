import { Connection, Keypair } from "@solana/web3.js";
import type { SignWithPublisherKeypair } from "@solana-mobile/dapp-store-publishing-tools";
import { publishUpdate } from "@solana-mobile/dapp-store-publishing-tools";
import { checkMintedStatus, showMessage } from "../../CliUtils.js";
import nacl from "tweetnacl";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

type PublishUpdateCommandInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
  critical: boolean;
  alphaTest?: boolean;
};

export const publishUpdateCommand = async ({
  appMintAddress,
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  compliesWithSolanaDappStorePolicies = false,
  requestorIsAuthorized = false,
  critical = false,
  alphaTest,
}: PublishUpdateCommandInput) => {

  showMessage(
    `Publishing Estimates`,
    "App update approvals take around 1-2 business days for review.",
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

  const connection = new Connection(
    url,
    {
      commitment: "confirmed",
    }
  );

  const {
    publisher: publisherDetails,
    app: appDetails,
    release: releaseDetails,
    solana_mobile_dapp_publisher_portal: solanaMobileDappPublisherPortalDetails,
    lastUpdatedVersionOnStore: lastUpdatedVersionOnStore
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

  await publishUpdate(
    { connection, sign },
    {
      appMintAddress: appMintAddress ?? appDetails.address,
      releaseMintAddress: releaseMintAddress ?? releaseDetails.address,
      publisherDetails,
      solanaMobileDappPublisherPortalDetails,
      compliesWithSolanaDappStorePolicies,
      requestorIsAuthorized,
      criticalUpdate: critical,
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
