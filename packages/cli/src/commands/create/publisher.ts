import { Command } from "commander";
import { createPublisher } from "@solana-mobile/dapp-publishing-tools";
import { Connection, VersionedTransaction } from "@solana/web3.js";
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

    const txBuilder = await createPublisher(
      {},
      { connection, publisher: signer }
    );

    const blockhash = await connection.getLatestBlockhash();
    const tx = txBuilder.toTransaction(blockhash);
    tx.partialSign(signer);
    // TODO(jon): Use a VersionedTransaction
    const txSig = await connection.sendRawTransaction(tx.serialize());
    console.info({ txSig });
    await connection.confirmTransaction(
      { signature: txSig, ...blockhash },
      "confirmed"
    );
  });

program.parse(process.argv);
