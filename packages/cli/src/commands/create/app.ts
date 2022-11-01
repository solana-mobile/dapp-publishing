import { Command } from "commander";
import { createApp } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { parseKeypair } from "../../utils";

// const program = new Command();

// program
//   .description("Creates an app")
//   .requiredOption(
//     "-p, --publisher-mint-address <publisher-mint-address>",
//     "The mint address of the publisher NFT"
//   )
//   .requiredOption(
//     "-k, --keypair <path-to-keypair-file>",
//     "Path to keypair file"
//   )
//   .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net/")
//   .action(async () => {
//     const { keypair, url, publisherMintAddress } = program.opts();

//     // TODO(jon): Elevate this somehow
//     const connection = new Connection(url);
//     const signer = parseKeypair(keypair);

//     const mintAddress = Keypair.generate();
//     const txBuilder = await createApp(
//       {
//         publisherMintAddress: new PublicKey(publisherMintAddress),
//         mintAddress,
//       },
//       { connection, publisher: signer }
//     );

//     const blockhash = await connection.getLatestBlockhash();
//     const tx = txBuilder.toTransaction(blockhash);
//     tx.sign(mintAddress, signer);

//     const txSig = await sendAndConfirmTransaction(connection, tx, [
//       signer,
//       mintAddress,
//     ]);
//     console.info({ txSig, mintAddress: mintAddress.publicKey.toBase58() });
//   });

// program.parse(process.argv);
