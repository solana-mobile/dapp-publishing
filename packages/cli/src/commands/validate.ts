import {
  createPublisherJson,
  validatePublisher,
} from "@solana-mobile/dapp-publishing-tools";
import { getPublisherDetails } from "./create/publisher";
import type { Keypair } from "@solana/web3.js";
import { debug } from "../utils";

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
};
