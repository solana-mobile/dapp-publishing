import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

export const createReleaseCommand = async ({
  appMintAddress,
  signer,
  url,
  dryRun,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const releaseMintAddress = Keypair.generate();
  const txBuilder = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
    },
    { connection, publisher: signer }
  );

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(releaseMintAddress, signer);

  if (!dryRun) {
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      signer,
      releaseMintAddress,
    ]);
    console.info({
      txSig,
      releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
    });
  }
};
