import fs from "fs";
import {
  createPublisher,
  Publisher,
} from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { load } from "js-yaml";

export const getPublisherDetails = async ({
  publisherAddress,
}: {
  publisherAddress: PublicKey;
}): Promise<Publisher> => {
  const configFile = `${process.cwd()}/dapp-store/config.yaml`;
  console.info(`Pulling publisher details from ${configFile}`);

  const { publisher } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(configFile, "utf-8")
  ) as { publisher: Publisher };

  return publisher;
};

const createPublisherNft = async ({
  connection,
  publisher,
  publisherDetails,
}: {
  connection: Connection;
  publisher: Keypair;
  publisherDetails: Publisher;
}) => {
  const mintAddress = Keypair.generate();
  console.info(
    `Creating publisher at address: ${mintAddress.publicKey.toBase58()}`
  );
  const txBuilder = await createPublisher(
    { mintAddress, publisherDetails },
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

export const createPublisherCommand = async ({
  signer,
  url,
  dryRun,
}: {
  signer: Keypair;
  url: string;
  dryRun: boolean;
}) => {
  // TODO(jon): Elevate this somehow
  const connection = new Connection(url);

  const publisherDetails = await getPublisherDetails({
    publisherAddress: signer.publicKey,
  });

  if (!dryRun) {
    // TODO(jon): Pass the JSON
    await createPublisherNft({
      connection,
      publisher: signer,
      publisherDetails,
    });
  }
};
