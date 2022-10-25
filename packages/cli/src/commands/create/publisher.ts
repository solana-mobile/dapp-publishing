import fs from "fs";
import { Command } from "commander";
import {
  createPublisher,
  createPublisherJson,
} from "@solana-mobile/dapp-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { load } from "js-yaml";
import { parseKeypair } from "../../utils";

const getPublisherJson = async ({
  publisherAddress,
}: {
  publisherAddress: PublicKey;
}): Promise<any> => {
  // @ts-ignore
  const { publisher } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(`${process.cwd()}/dapp-store/config.yaml`, "utf-8")
  );

  const publisherMetadata = createPublisherJson({
    ...publisher,
    address: publisherAddress,
    description: publisher.description["en-US"],
  });
  console.log(JSON.stringify(publisherMetadata, null, 2));

  return publisherMetadata;
};

const createPublisherNft = async ({
  connection,
  publisher,
  publisherJson,
}: {
  connection: Connection;
  publisher: Keypair;
  publisherJson: any;
}) => {
  const mintAddress = Keypair.generate();
  console.info(
    `Creating publisher at address: ${mintAddress.publicKey.toBase58()}`
  );
  const txBuilder = await createPublisher(
    { mintAddress, publisherJson },
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

const program = new Command();

program
  .description("Creates a publisher")
  .requiredOption(
    "-k, --keypair <path-to-keypair-file>",
    "Path to keypair file"
  )
  .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net/")
  .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
  .action(async () => {
    const { keypair, url, dryRun } = program.opts();

    // TODO(jon): Elevate this somehow
    const connection = new Connection(url);
    const signer = parseKeypair(keypair);

    const publisherJson = getPublisherJson({
      publisherAddress: signer.publicKey,
    });

    if (!dryRun) {
      // TODO(jon): Pass the JSON
      await createPublisherNft({
        connection,
        publisher: signer,
        publisherJson,
      });
    }
  });

program.parse(process.argv);
