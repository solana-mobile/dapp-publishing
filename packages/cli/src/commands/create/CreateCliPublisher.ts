import type { Publisher } from "@solana-mobile/dapp-store-publishing-tools";
import { createPublisher } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  Constants,
  getMetaplexInstance,
  showMessage,
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

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
  const maxTries = 8;
  for (let i = 1; i <= maxTries; i++) {
    try {
      const blockhash = await connection.getLatestBlockhashAndContext();
      const tx = txBuilder.toTransaction(blockhash.value);
      tx.sign(mintAddress, publisher);

      const txSig = await sendAndConfirmTransaction(connection, tx, [
        publisher,
        mintAddress,
      ], {
        minContextSlot: blockhash.context.slot
      });
      return { publisherAddress: mintAddress.publicKey.toBase58(), transactionSignature: txSig};
    } catch (e) {
      const errorMsg = (e as Error | null)?.message ?? "";
      if (i == maxTries) {
        showMessage("Transaction Failure", errorMsg, "error");
        process.exit(-1)
      } else {
        const retryMsg = errorMsg + "\nWill Retry minting publisher."
        showMessage("Transaction Failure", retryMsg, "standard");
      }
    }
  }
  throw new Error("Unable to mint publisher NFT");
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
  const connection = new Connection(url);

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
