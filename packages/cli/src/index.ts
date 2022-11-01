import { Command } from "commander";
import { validateCommand } from "./commands";
import {
  createAppCommand,
  createPublisherCommand,
  createReleaseCommand,
} from "./commands/create";
import { parseKeypair } from "./utils";

const program = new Command();

async function main() {
  program
    .name("dapp-store")
    .version("0.1.0")
    .description("CLI to assist with publishing to the Saga Dapp Store");

  const createCommand = program
    .command("create")
    .description("Create a `publisher`, `app`, or `release`")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT");

  createCommand
    .command("publisher")
    .description("Create a publisher")
    .action(async ({ keypair, url, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (signer) {
        await createPublisherCommand({ signer, url, dryRun });
      }
    });

  createCommand
    .command("app")
    .description("Create a app")
    .requiredOption(
      "-p, --publisher-mint-address <publisher-mint-address>",
      "The mint address of the publisher NFT"
    )
    .action(async ({ publisherMintAddress, keypair, url, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (signer) {
        await createAppCommand({ publisherMintAddress, signer, url, dryRun });
      }
    });

  createCommand
    .command("release")
    .description("Create a release")
    .requiredOption(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT"
    )
    .action(async ({ appMintAddress, keypair, url, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (signer) {
        await createReleaseCommand({ appMintAddress, signer, url, dryRun });
      }
    });

  program
    .command("validate")
    .description("Validates details prior to publishing")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .action(async ({ keypair }) => {
      const signer = parseKeypair(keypair);

      if (signer) {
        await validateCommand({ signer });
      }
    });

  await program.parseAsync(process.argv);
}
main();
