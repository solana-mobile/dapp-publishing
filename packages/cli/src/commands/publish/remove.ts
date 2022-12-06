import { Connection, Keypair } from "@solana/web3.js";
import type { SignWithPublisherKeypair } from "@solana-mobile/dapp-publishing-tools";
import { publishRemove } from "@solana-mobile/dapp-publishing-tools";
import { getConfigFile } from "../../utils.js";
import nacl from "tweetnacl";

type PublishRemoveCommandInput = {
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  requestorIsAuthorized: boolean;
  critical: boolean;
};

export const publishRemoveCommand = async ({
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  requestorIsAuthorized = false,
  critical = false
}: PublishRemoveCommandInput) => {
  if (!requestorIsAuthorized) {
    console.error("ERROR: Cannot submit a request for which the requestor does not attest they are authorized to do so");
    return;
  }

  const connection = new Connection(url);
  const { publisher: publisherDetails } = await getConfigFile();
  const sign = ((buf: Buffer) => nacl.sign(buf, signer.secretKey)) as SignWithPublisherKeypair;

  await publishRemove(
    { connection, sign },
    {
      releaseMintAddress,
      publisherDetails,
      requestorIsAuthorized,
      criticalUpdate: critical,
    },
    dryRun);
};
