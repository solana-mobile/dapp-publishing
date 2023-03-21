import type { App } from "@solana-mobile/dapp-store-publishing-tools";
import { createApp } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getConfigWithChecks,
  getMetaplexInstance,
  saveToConfig,
} from "../../utils.js";

const createAppNft = async (
  {
    appDetails,
    connection,
    publisherMintAddress,
    publisher,
  }: {
    appDetails: App;
    connection: Connection;
    publisherMintAddress: string;
    publisher: Keypair;
  },
  { dryRun }: { dryRun?: boolean }
) => {
  const mintAddress = Keypair.generate();
  const metaplex = getMetaplexInstance(connection, publisher);
  const txBuilder = await createApp(
    {
      publisherMintAddress: new PublicKey(publisherMintAddress),
      mintAddress,
      appDetails,
    },
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

  return { appAddress: mintAddress.publicKey.toBase58() };
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

  const { app: appDetails, publisher: publisherDetails } =
    await getConfigWithChecks();

  const { appAddress } = await createAppNft(
    {
      connection,
      publisher: signer,
      publisherMintAddress: publisherDetails.address ?? publisherMintAddress,
      appDetails,
    },
    { dryRun }
  );

  if (!dryRun) {
    saveToConfig({ app: { address: appAddress } });
  }

  return { appAddress };
};
