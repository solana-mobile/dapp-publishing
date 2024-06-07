import type { Publisher } from "@solana-mobile/dapp-store-publishing-tools";
import { createPublisher } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
} from "@solana/web3.js";

import {
  Constants,
  getMetaplexInstance,
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";
import { sendAndConfirmTransaction } from "../utils.js";

const createPublisherNft = async (
  {
    connection,
    publisher,
    publisherDetails,
    storageParams,
    priorityFeeLamports,
  }: {
    connection: Connection;
    publisher: Keypair;
    publisherDetails: Publisher;
    storageParams: string;
    priorityFeeLamports: number;
  },
) => {
  console.info(`Creating Publisher NFT`);
  const mintAddress = Keypair.generate();
  const metaplex = getMetaplexInstance(connection, publisher, storageParams);
  const txBuilder = await createPublisher(
    { mintAddress, publisherDetails, priorityFeeLamports },
    { metaplex, publisher }
  );

  console.info(`Publisher NFT data upload complete\nSigning transaction now`);

  const { response } = await sendAndConfirmTransaction(metaplex, txBuilder);

  return {
    publisherAddress: mintAddress.publicKey.toBase58(),
    transactionSignature: response.signature,
  };
};

export const createPublisherCommand = async ({
  signer,
  url,
  dryRun,
  storageParams,
  priorityFeeLamports = Constants.DEFAULT_PRIORITY_FEE,
}: {
  signer: Keypair;
  url: string;
  dryRun: boolean;
  storageParams: string;
  priorityFeeLamports: number;
}) => {
  const connection = new Connection(
    url,
    {
      commitment: "confirmed",
    }
  );

  const { publisher: publisherDetails } = await loadPublishDetailsWithChecks();

  if (!dryRun) {
    const { publisherAddress, transactionSignature } = await createPublisherNft(
      {
        connection,
        publisher: signer,
        publisherDetails,
        storageParams: storageParams,
        priorityFeeLamports: priorityFeeLamports,
      },
    );

    await writeToPublishDetails({ publisher: { address: publisherAddress } });

    return { publisherAddress, transactionSignature };
  }

  return { publisherAddress: "", transactionSignature: "" };
};
