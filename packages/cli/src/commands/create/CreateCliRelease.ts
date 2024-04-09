import type {
  App,
  Publisher,
  Release,
} from "@solana-mobile/dapp-store-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getMetaplexInstance,
  showMessage
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  buildToolsPath: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
  storageParams: string;
  priorityFeeLamports: number;
};

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  appDetails,
  publisherDetails,
  connection,
  publisher,
  storageParams,
  priorityFeeLamports,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  appDetails: App;
  publisherDetails: Publisher;
  connection: Connection;
  publisher: Keypair;
  storageParams: string;
  priorityFeeLamports: number;
}) => {
  const releaseMintAddress = Keypair.generate();

  const metaplex = getMetaplexInstance(connection, publisher, storageParams);

  const { txBuilder } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
      priorityFeeLamports
    },
    { metaplex, publisher }
  );

  const maxTries = 8;
  for (let i = 1; i <= maxTries; i++) {
    try {
      const blockhash = await connection.getLatestBlockhashAndContext();
      const tx = txBuilder.toTransaction(blockhash.value);
      tx.sign(releaseMintAddress, publisher);
      const txSig = await sendAndConfirmTransaction(connection, tx, [
        publisher,
        releaseMintAddress,
      ], {
        minContextSlot: blockhash.context.slot,
      });
      console.info({
        txSig,
        releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
      });
      return { releaseAddress: releaseMintAddress.publicKey.toBase58() };
    } catch (e) {
      const errorMsg = (e as Error | null)?.message ?? "";
      if (i == maxTries) {
        showMessage("Transaction Failure", errorMsg, "error");
        process.exit(-1)
      } else {
        const retryMsg = errorMsg + "\nWill Retry minting release"
        showMessage("Transaction Failure", retryMsg, "standard");
      }
    }
  }
};

export const createReleaseCommand = async ({
  appMintAddress,
  buildToolsPath,
  signer,
  url,
  dryRun = false,
  storageParams,
  priorityFeeLamports = 500000
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await loadPublishDetailsWithChecks(buildToolsPath);

  if (!dryRun) {
    const { releaseAddress } = await createReleaseNft({
      appMintAddress: app.address ?? appMintAddress,
      connection,
      publisher: signer,
      releaseDetails: {
        ...release,
      },
      appDetails: app,
      publisherDetails: publisher,
      storageParams: storageParams,
      priorityFeeLamports: priorityFeeLamports,
    });

    await writeToPublishDetails({ release: { address: releaseAddress }, });

    return { releaseAddress };
  }
};
