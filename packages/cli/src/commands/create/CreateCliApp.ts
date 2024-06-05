import type { App } from "@solana-mobile/dapp-store-publishing-tools";
import { createApp } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

import {
  Constants,
  getMetaplexInstance,
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";
import { sendAndConfirmTransaction } from "../utils.js";

const createAppNft = async (
  {
    appDetails,
    connection,
    publisherMintAddress,
    publisher,
    storageParams,
    priorityFeeLamports,
  }: {
    appDetails: App;
    connection: Connection;
    publisherMintAddress: string;
    publisher: Keypair;
    storageParams: string;
    priorityFeeLamports: number;
  },
) => {
  console.info(`Creating App NFT`);

  const mintAddress = Keypair.generate();
  const metaplex = getMetaplexInstance(connection, publisher, storageParams);
  const txBuilder = await createApp(
    {
      publisherMintAddress: new PublicKey(publisherMintAddress),
      mintAddress,
      appDetails,
      priorityFeeLamports
    },
    { metaplex, publisher }
  );

  console.info(`App NFT data upload complete\nSigning transaction now`);

  const { response } = await sendAndConfirmTransaction(metaplex, txBuilder);

  return {
    appAddress: mintAddress.publicKey.toBase58(),
    transactionSignature: response.signature,
  };
};

type CreateAppCommandInput = {
  publisherMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
  storageParams: string;
  priorityFeeLamports: number;
};

export const createAppCommand = async ({
  signer,
  url,
  dryRun,
  publisherMintAddress,
  storageParams,
  priorityFeeLamports = Constants.DEFAULT_PRIORITY_FEE,
}: CreateAppCommandInput) => {
  const connection = new Connection(
    url,
    {
      commitment: "confirmed",
    }
  );

  const { app: appDetails, publisher: publisherDetails } =
    await loadPublishDetailsWithChecks();

  if (!dryRun) {
    const { appAddress, transactionSignature } = await createAppNft(
      {
        connection,
        publisher: signer,
        publisherMintAddress: publisherDetails.address ?? publisherMintAddress,
        appDetails,
        storageParams,
        priorityFeeLamports
      },
    );

    await writeToPublishDetails({ app: { address: appAddress } });

    return { appAddress, transactionSignature };
  }
};
