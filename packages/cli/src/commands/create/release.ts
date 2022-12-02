import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";

import { getAndroidDetails, getConfigFile, saveToConfig } from "../../utils.js";
import path from "path";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  version: string;
  buildToolsPath: string;
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
  buildToolsPath,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getConfigFile();

  if (buildToolsPath && buildToolsPath.length > 0) {
    //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry
    const apkSrc = release.files[0].path;
    const apkPath = path.join(process.cwd(), "dapp-store", "files", apkSrc);

    release.android_details = await getAndroidDetails(buildToolsPath, apkPath);
  }

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
