import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import type {
  Release,
  App,
  Publisher,
} from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { getConfigFile, saveToConfig } from "../../utils.js";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  version: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

const createReleaseNft = async (
  {
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
  },
  { dryRun }: { dryRun: boolean }
) => {
  const releaseMintAddress = Keypair.generate();
  const { txBuilder } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
    },
    { connection, publisher }
  );

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(releaseMintAddress, publisher);

  if (!dryRun) {
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      publisher,
      releaseMintAddress,
    ]);
    console.info({
      txSig,
      releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
    });
  }

  return { releaseMintAddress: releaseMintAddress.publicKey };
};

export const createReleaseCommand = async ({
  appMintAddress,
  version,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getConfigFile();

  const { releaseMintAddress } = await createReleaseNft(
    {
      appMintAddress,
      connection,
      publisher: signer,
      releaseDetails: {
        ...release,
        version,
      },
      appDetails: app,
      publisherDetails: publisher,
    },
    { dryRun }
  );

  saveToConfig({
    release: { address: releaseMintAddress.toBase58(), version },
  });
};
