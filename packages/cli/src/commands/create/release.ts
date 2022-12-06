import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { getConfigFile, saveToConfig } from "../../utils.js";
import { parseAndValidateReleaseAssets } from "../assets.js";

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
  }
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
  version,
  buildToolsPath,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getConfigFile();

  await parseAndValidateReleaseAssets(release, buildToolsPath);

  if (!dryRun) {
    const { releaseAddress } = await createReleaseNft(
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
      }
    );

    saveToConfig({
      release: { address: releaseAddress, version },
    });

    return { releaseAddress };
  }
};