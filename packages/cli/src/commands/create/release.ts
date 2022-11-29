import fs from "fs";
import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import { AndroidDetails, createRelease } from "@solana-mobile/dapp-publishing-tools";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { load } from "js-yaml";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  version: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

export const getReleaseDetails = async (
  version: string
): Promise<{ release: Release; app: App; publisher: Publisher }> => {
  const globalConfigFile = `${process.cwd()}/dapp-store/config.yaml`;
  console.info(`Pulling app and publisher details from ${globalConfigFile}`);

  const { app, publisher } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(globalConfigFile, "utf-8")
  ) as { app: App; publisher: Publisher };

  app.android_details = getAndroidDetails();

  const configFile = `${process.cwd()}/dapp-store/releases/${version}/release.yaml`;
  console.info(`Pulling release details from ${configFile}`);

  const { release } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(configFile, "utf-8")
  ) as { release: Release };

  return { release, app, publisher };
};

const getAndroidDetails = async (): Promise<AndroidDetails> => {

  const details: AndroidDetails = {
    android_package: "",
    google_store_package: "",
    min_sdk: 1,
    version_code: 1,
    permissions: ["android.permission.INTERNET"],
    locales: ["en-us"],
  };

  return details;
};

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  appDetails,
  publisherDetails,
  connection,
  publisher,
  dryRun,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  appDetails: App;
  publisherDetails: Publisher;
  connection: Connection;
  publisher: Keypair;
  dryRun: boolean;
}) => {
  const releaseMintAddress = Keypair.generate();
  const { txBuilder, releaseJson } = await createRelease(
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

    return { releaseMintAddress };
  }
};

export const createReleaseCommand = async ({
  appMintAddress,
  version,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getReleaseDetails(version);

  await createReleaseNft({
    appMintAddress,
    connection,
    publisher: signer,
    releaseDetails: release,
    appDetails: app,
    publisherDetails: publisher,
    dryRun,
  });
};
