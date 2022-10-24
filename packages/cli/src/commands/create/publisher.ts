import { Command } from "commander";
import { createPublisher } from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { parseKeypair } from "../../utils";

const program = new Command();

program
  .description("Creates a publisher")
  .requiredOption(
    "-k, --keypair <path-to-keypair-file>",
    "Path to keypair file"
  )
  .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net/")
  .action(async () => {
    const { keypair, url } = program.opts();

    // TODO(jon): Elevate this somehow
    const connection = new Connection(url);
    const signer = parseKeypair(keypair);

    const mintAddress = Keypair.generate();
    console.info(
      `Creating publisher at address: ${mintAddress.publicKey.toBase58()}`
    );
    const txBuilder = await createPublisher(
      { mintAddress },
      { connection, publisher: signer }
    );

    const blockhash = await connection.getLatestBlockhash();
    const tx = txBuilder.toTransaction(blockhash);
    tx.sign(mintAddress, signer);

    const txSig = await sendAndConfirmTransaction(connection, tx, [
      signer,
      mintAddress,
    ]);
    console.info({ txSig, mintAddress: mintAddress.publicKey.toBase58() });
  });

program.parse(process.argv);
