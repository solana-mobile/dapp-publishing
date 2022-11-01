import fs from "fs";
import { createApp, App } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { load } from "js-yaml";

export const getAppDetails = async (): Promise<App> => {
  const configFile = `${process.cwd()}/dapp-store/config.yaml`;
  console.info(`Pulling app details from ${configFile}`);

  const { app } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(configFile, "utf-8")
  ) as { app: App };

  return app;
};

const createAppNft = async ({
  appDetails,
  connection,
  publisherMintAddress,
  publisher,
}: {
  appDetails: App;
  connection: Connection;
  publisherMintAddress: string;
  publisher: Keypair;
}) => {
  const mintAddress = Keypair.generate();
  const txBuilder = await createApp(
    {
      publisherMintAddress: new PublicKey(publisherMintAddress),
      mintAddress,
      appDetails,
    },
    { connection, publisher }
  );

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(mintAddress, publisher);

  const txSig = await sendAndConfirmTransaction(connection, tx, [
    publisher,
    mintAddress,
  ]);
  console.info({ txSig, mintAddress: mintAddress.publicKey.toBase58() });
};

type CreateAppCommandInput = {
  publisherMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

export const createAppCommand = async ({
  signer,
  url,
  dryRun,
  publisherMintAddress,
}: CreateAppCommandInput) => {
  const connection = new Connection(url);

  const appDetails = await getAppDetails();

  if (!dryRun) {
    await createAppNft({
      connection,
      publisher: signer,
      publisherMintAddress,
      appDetails,
    });
  }
};
