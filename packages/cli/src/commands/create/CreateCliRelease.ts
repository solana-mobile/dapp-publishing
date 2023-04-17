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
import { CachedStorageDriver } from "../../upload/CachedStorageDriver.js";

import {
  getConfigWithChecks,
  getMetaplexInstance,
  saveToConfig,
} from "../../CliUtils.js";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  buildToolsPath: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  appDetails,
  publisherDetails,
  connection,
  publisher,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  appDetails: App;
  publisherDetails: Publisher;
  connection: Connection;
  publisher: Keypair;
}) => {
  const releaseMintAddress = Keypair.generate();

  const metaplex = getMetaplexInstance(connection, publisher);

  const { txBuilder } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
    },
    { metaplex, publisher }
  );

  const blockhash = await connection.getLatestBlockhashAndContext();
  const tx = txBuilder.toTransaction(blockhash.value);
  tx.sign(releaseMintAddress, publisher);

  const txSig = await sendAndConfirmTransaction(connection, tx, [
    publisher,
    releaseMintAddress,
  ], {
    minContextSlot: blockhash.context.slot
  });
  console.info({
    txSig,
    releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
  });

  return { releaseAddress: releaseMintAddress.publicKey.toBase58() };
};

export const createReleaseCommand = async ({
  appMintAddress,
  buildToolsPath,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getConfigWithChecks(buildToolsPath);

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
    });

    saveToConfig({
      release: { address: releaseAddress },
    });

    return { releaseAddress };
  }
};
