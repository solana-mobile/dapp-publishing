import type { Publisher } from "@solana-mobile/dapp-store-publishing-tools";
import { createPublisher } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getMetaplexInstance,
} from "../../CliUtils.js";
import { loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

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

  const blockhash = await connection.getLatestBlockhashAndContext();
  const tx = txBuilder.toTransaction(blockhash.value);
  tx.sign(mintAddress, publisher);

  if (!dryRun) {
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      publisher,
      mintAddress,
    ], {
      minContextSlot: blockhash.context.slot
    });
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

  const { publisher: publisherDetails } = await loadPublishDetailsWithChecks();

  const { publisherAddress } = await createPublisherNft(
    {
      connection,
      publisher: signer,
      publisherDetails,
    },
    { dryRun }
  );

  // TODO(sdlaver): dry-run should not modify config
  writeToPublishDetails({ publisher: { address: publisherAddress } });

  return { publisherAddress };
};
