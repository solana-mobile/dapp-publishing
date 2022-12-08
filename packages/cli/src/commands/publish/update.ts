import { Connection, Keypair } from "@solana/web3.js";
import type { SignWithPublisherKeypair } from "@solana-mobile/dapp-store-publishing-tools";
import { publishUpdate } from "@solana-mobile/dapp-store-publishing-tools";
import { getConfigFile } from "../../utils.js";
import nacl from "tweetnacl";

type PublishUpdateCommandInput = {
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
  critical: boolean;
};

export const publishUpdateCommand = async ({
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  compliesWithSolanaDappStorePolicies = false,
  requestorIsAuthorized = false,
  critical = false,
}: PublishUpdateCommandInput) => {
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
    release: releaseDetails,
    solana_mobile_dapp_publisher_portal: solanaMobileDappPublisherPortalDetails,
  } = await getConfigFile();
  const sign = ((buf: Buffer) =>
    nacl.sign(buf, signer.secretKey)) as SignWithPublisherKeypair;

  await publishUpdate(
    { connection, sign },
    {
      releaseMintAddress: releaseMintAddress ?? releaseDetails.address,
      publisherDetails,
      solanaMobileDappPublisherPortalDetails,
      compliesWithSolanaDappStorePolicies,
      requestorIsAuthorized,
      criticalUpdate: critical,
    },
    dryRun
  );
};
