import {
  bundlrStorage,
  BundlrStorageDriver,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import type {
  App,
  Publisher,
  Release,
} from "@solana-mobile/dapp-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { CachedStorageDriver } from "../../upload/CachedStorageDriver.js";

import { getConfigFile, saveToConfig } from "../../utils.js";

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

  const metaplex = Metaplex.make(connection).use(keypairIdentity(publisher));
  metaplex.storage().setDriver(
    new CachedStorageDriver(
      new BundlrStorageDriver(metaplex, {
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
      }),
      {
        assetManifestPath: "./.asset-manifest.json",
      }
    )
  );

  const { txBuilder } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
    },
    { connection, metaplex, publisher }
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

  const { release, app, publisher } = await getConfigFile(buildToolsPath);

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
