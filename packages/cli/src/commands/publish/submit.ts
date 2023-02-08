import { AccountInfo, Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { SignWithPublisherKeypair } from "@solana-mobile/dapp-store-publishing-tools";
import { publishSubmit } from "@solana-mobile/dapp-store-publishing-tools";
import nacl from "tweetnacl";
import { getConfigFile } from "../../utils.js";
import { Buffer } from "buffer";

type PublishSubmitCommandInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
};

export const publishSubmitCommand = async ({
  appMintAddress,
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  compliesWithSolanaDappStorePolicies = false,
  requestorIsAuthorized = false,
}: PublishSubmitCommandInput) => {
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
  } = await getConfigFile();

  const sign = ((buf: Buffer) =>
    nacl.sign(buf, signer.secretKey)) as SignWithPublisherKeypair;

  const pubAddr = publisherDetails.address;
  const appAddr = appMintAddress ?? appDetails.address;
  const releaseAddr = releaseMintAddress ?? releaseDetails.address;

  try {
    const results = await connection.getMultipleAccountsInfo([
      new PublicKey(pubAddr),
      new PublicKey(appAddr),
      new PublicKey(releaseAddr),
    ]);

    if (results?.length == 3) {
      await publishSubmit(
        { connection, sign },
        {
          appMintAddress: appAddr,
          releaseMintAddress: releaseAddr,
          publisherDetails,
          solanaMobileDappPublisherPortalDetails,
          compliesWithSolanaDappStorePolicies,
          requestorIsAuthorized,
        },
        dryRun
      );
    } else {
      throw new Error("");
    }
  } catch (e) {
    throw new Error("Please ensure you have minted all of your NFTs before submitting to the dApp store.");
  }
};
