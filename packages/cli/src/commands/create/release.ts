import fs from "fs";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import type { Release } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { load } from "js-yaml";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

export const getReleaseDetails = async (): Promise<Release> => {
  const configFile = `${process.cwd()}/dapp-store/config.yaml`;
  console.info(`Pulling app details from ${configFile}`);

  const { release } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(configFile, "utf-8")
  ) as { release: Release };

  return release;
};

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  connection,
  publisher,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  connection: Connection;
  publisher: Keypair;
}) => {
  const releaseMintAddress = Keypair.generate();
  const txBuilder = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
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
};

export const createReleaseCommand = async ({
  appMintAddress,
  signer,
  url,
  dryRun,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const releaseDetails = await getReleaseDetails();

  if (!dryRun) {
    await createReleaseNft({
      appMintAddress,
      connection,
      publisher: signer,
      releaseDetails,
    });
  }
};
