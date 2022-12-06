import type { Publisher } from "@solana-mobile/dapp-publishing-tools";
import { createPublisher } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getConfigFile,
  getMetaplexInstance,
  saveToConfig,
} from "../../utils.js";

const createPublisherNft = async (
  {
    connection,
    publisher,
    publisherDetails,
  }: {
    connection: Connection;
    publisher: Keypair;
    publisherDetails: Publisher;
  },
  { dryRun }: { dryRun: boolean }
) => {
  const mintAddress = Keypair.generate();
  const metaplex = getMetaplexInstance(connection, publisher);
  console.info(
    `Creating publisher at address: ${mintAddress.publicKey.toBase58()}`
  );
  const txBuilder = await createPublisher(
    { mintAddress, publisherDetails },
    { metaplex, publisher }
  );

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(mintAddress, publisher);

  if (!dryRun) {
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      publisher,
      mintAddress,
    ]);
    console.info({ txSig, mintAddress: mintAddress.publicKey.toBase58() });
  }

  return { publisherAddress: mintAddress.publicKey.toBase58() };
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
  const connection = new Connection(url);

  const { publisher: publisherDetails } = await getConfigFile();

  const { publisherAddress } = await createPublisherNft(
    {
      connection,
      publisher: signer,
      publisherDetails,
    },
    { dryRun }
  );

  // TODO(sdlaver): dry-run should not modify config
  saveToConfig({ publisher: { address: publisherAddress } });

  return { publisherAddress };
};
