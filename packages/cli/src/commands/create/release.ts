import { Command } from "commander";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
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
//     "-a, --app-mint-address <app-mint-address>",
//     "The mint address of the app NFT"
//   )
//   .requiredOption(
//     "-k, --keypair <path-to-keypair-file>",
//     "Path to keypair file"
//   )
//   .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net/")
//   .action(async () => {
//     const { keypair, url, appMintAddress } = program.opts();

//     // TODO(jon): Elevate this somehow
//     const connection = new Connection(url);
//     const signer = parseKeypair(keypair);

//     const releaseMintAddress = Keypair.generate();
//     const txBuilder = await createRelease(
//       {
//         appMintAddress: new PublicKey(appMintAddress),
//         releaseMintAddress,
//       },
//       { connection, publisher: signer }
//     );

//     const blockhash = await connection.getLatestBlockhash();
//     const tx = txBuilder.toTransaction(blockhash);
//     tx.sign(releaseMintAddress, signer);

//     const txSig = await sendAndConfirmTransaction(connection, tx, [
//       signer,
//       releaseMintAddress,
//     ]);
//     console.info({
//       txSig,
//       releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
//     });
//   });

// program.parse(process.argv);
