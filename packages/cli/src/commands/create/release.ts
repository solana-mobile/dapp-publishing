import fs from "fs";
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
  showMessage,
} from "../../utils.js";

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

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(releaseMintAddress, publisher);

  const txSig = await sendAndConfirmTransaction(connection, tx, [
    publisher,
    releaseMintAddress,
  ]);
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

  const apkEntry = release.files.find((asset: any) => asset.purpose === "install")!;
  const size = (await fs.promises.stat(apkEntry.uri)).size;
  if (size > 100 * 1024 * 1024) {
    showMessage(
      "APK over 100MB!!",
      "Your APK file is over 100MB, which may result in requiring WiFi or other non-metered download operations for end users.\n\n" +
      "dApp store currently supports only `arm64-v8a` architecture.\n" +
      "Its possible to submit an `arm64-v8a` only variant instead of a combined apk which works on other architectures such as x86\n\n" +
      "Here are some other resources to optimize app size\n" +
      "https://developer.android.com/studio/build/shrink-code" +
      "\n\nIgnore recommendations if not applicable",
      "warning"
    )
  }

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
