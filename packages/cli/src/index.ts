import { Command } from "commander";
import Conf from "conf";
import inquirer from "inquirer";
import { validateCommand } from "./commands/index.js";
import { createAppCommand, createPublisherCommand, createReleaseCommand } from "./commands/create/index.js";
import { parseKeypair } from "./utils.js";
import * as dotenv from "dotenv";

const program = new Command();
const conf = new Conf({ projectName: "dapp-store" });

async function main() {
  program
    .name("dapp-store")
    .version("0.1.0")
    .description("CLI to assist with publishing to the Saga Dapp Store");

  const createCommand = program
    .command("create")
    .description("Create a `publisher`, `app`, or `release`");

  createCommand
    .command("publisher")
    .description("Create a publisher")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .action(async ({ keypair, url, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (signer) {
        const result = await createPublisherCommand({ signer, url, dryRun });
        if (result?.publisherAddress) {
          conf.set("publisher", result.publisherAddress);
        }
      }
    });

  createCommand
    .command("app")
    .description("Create a app")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option(
      "-p, --publisher-mint-address <publisher-mint-address>",
      "The mint address of the publisher NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .action(async ({ publisherMintAddress, keypair, url, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (!publisherMintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "publisherAddress",
            message:
              "Publisher address not provided. Use the previously created publisher address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create publisher` first",
            default: conf.get("publisher"),
          },
        ]);
        conf.set("publisher", answers.publisherAddress);
      }

      if (signer) {
        const result = await createAppCommand({
          publisherMintAddress: publisherMintAddress ?? conf.get("publisher"),
          signer,
          url,
          dryRun,
        });
        if (result?.appAddress) {
          conf.set("app", result.appAddress);
        }
      }
    });

  createCommand
    .showHelpAfterError()
    .command("release <version>")
    .description("Create a release")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option(
      "-m, --mint-address <mint-address>",
      "The mint address of the app NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .option("-a, --aapt2-path <aapt2-path>", "Directory containing aapt2 in the Android dev tooling")
    .action(async (version, { mintAddress, keypair, url, dryRun, aapt2Path }) => {
      dotenv.config();
      const aaptEnv = process.env.AAPT2_DIR ?? "";

      let aaptDir = "";
      if (aaptEnv && aaptEnv.length > 0) {
        aaptDir = aaptEnv;
      } else if (aapt2Path) {
        aaptDir = aapt2Path;
      } else {
        console.log("\n\n::: Please specify an AAPT2 directory in a .env file or via the command line argument. :::\n\n");
        return;
      }

      const signer = parseKeypair(keypair);

      if (!mintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "appAddress",
            message:
              "App address not provided. Use the previously created app address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create app` first",
            default: conf.get("app"),
          },
        ]);
        conf.set("app", answers.appAddress);
      }

      if (signer) {
        await createReleaseCommand({
          appMintAddress: mintAddress ?? conf.get("app"),
          version,
          aaptDir,
          signer,
          url,
          dryRun,
        });
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
