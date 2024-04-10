import type { App } from "@solana-mobile/dapp-store-publishing-tools";
import { createApp } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  Constants,
  getMetaplexInstance,
  showMessage,
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

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
  { dryRun }: { dryRun?: boolean }
) => {
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

  const maxTries = 8;
  for (let i = 1; i <= maxTries; i++) {
    try {
      const blockhash = await connection.getLatestBlockhashAndContext();
      const tx = txBuilder.toTransaction(blockhash.value);
      tx.sign(mintAddress, publisher);

      if (!dryRun) {
        const txSig = await sendAndConfirmTransaction(connection, tx, [
          publisher,
          mintAddress,
        ], {
          minContextSlot: blockhash.context.slot
        });
        console.info({ txSig, mintAddress: mintAddress.publicKey.toBase58() });
      }

      return { appAddress: mintAddress.publicKey.toBase58() };
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
  const connection = new Connection(url);

  const { app: appDetails, publisher: publisherDetails } =
    await loadPublishDetailsWithChecks();

  const { appAddress } = await createAppNft(
    {
      connection,
      publisher: signer,
      publisherMintAddress: publisherDetails.address ?? publisherMintAddress,
      appDetails,
      storageParams,
      priorityFeeLamports
    },
    { dryRun }
  );

  if (!dryRun) {
    await writeToPublishDetails({ app: { address: appAddress } });
  }

  return { appAddress };
};
