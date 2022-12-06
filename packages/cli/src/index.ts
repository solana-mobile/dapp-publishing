import { Command } from "commander";
import Conf from "conf";
import inquirer from "inquirer";
import { validateCommand } from "./commands/index.js";
import { createAppCommand, createPublisherCommand, createReleaseCommand } from "./commands/create/index.js";
import { publishRemoveCommand, publishSubmitCommand, publishSupportCommand, publishUpdateCommand } from "./commands/publish/index.js";
import { parseKeypair } from "./utils.js";
import * as dotenv from "dotenv";

const program = new Command();
const conf = new Conf({ projectName: "dapp-store" });

function resolveBuildToolsPath(buildToolsPath: string | undefined) {
  // If a path was specified on the command line, use that
  if (buildToolsPath !== undefined) {
    return buildToolsPath;
  }

  // If a path is specified in a .env file, use that
  dotenv.config();
  if (process.env.ANDROID_TOOLS_DIR !== undefined) {
    return process.env.ANDROID_TOOLS_DIR;
  }

  // No path was specified
  return;
}

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
    .command("release <version>")
    .description("Create a release")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .option("-b, --build-tools-path <build-tools-path>", "Path to Android build tools which contains AAPT2")
    .action(async (version, { appMintAddress, keypair, url, dryRun, buildToolsPath }) => {
      const resolvedBuildToolsPath = resolveBuildToolsPath(buildToolsPath);
      if (resolvedBuildToolsPath === undefined) {
        console.error("\n\n::: Please specify an Android build tools directory in the .env file or via the command line argument. :::\n\n");
        createCommand.showHelpAfterError()
        return;
      }

      const signer = parseKeypair(keypair);

      if (!appMintAddress) {
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
        const result = await createReleaseCommand({
          appMintAddress: appMintAddress ?? conf.get("app"),
          version,
          buildToolsPath: resolvedBuildToolsPath,
          signer,
          url,
          dryRun,
        });
        if (result?.releaseAddress) {
          conf.set("release", result.releaseAddress);
        }
      }
    });

  program
    .command("validate")
    .description("Validates details prior to publishing")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option("-b, --build-tools-path <build-tools-path>", "Path to Android build tools which contains AAPT2")
    .action(async ({ keypair, buildToolsPath }) => {
      const resolvedBuildToolsPath = resolveBuildToolsPath(buildToolsPath);
      if (resolvedBuildToolsPath === undefined) {
        console.error("\n\n::: Please specify an Android build tools directory in the .env file or via the command line argument. :::\n\n");
        createCommand.showHelpAfterError()
        return;
      }

      const signer = parseKeypair(keypair);

      if (signer) {
        await validateCommand({
          signer,
          buildToolsPath: resolvedBuildToolsPath
        });
      }
    });

  const publishCommand = program
    .command("publish")
    .description("Submit a publishing request (`submit`, `update`, `remove`, or `support`) to the Solana Mobile dApp publisher portal");

  publishCommand
    .command("submit")
    .description("Submit a new app to the Solana Mobile dApp publisher portal")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--complies-with-solana-dapp-store-policies",
      "An attestation that the app complies with the Solana dApp Store policies"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't submit the request to the publisher portal.")
    .action(async ({ releaseMintAddress, keypair, url, compliesWithSolanaDappStorePolicies, requestorIsAuthorized, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (!releaseMintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "releaseAddress",
            message:
              "Release address not provided. Use the previously created release address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create release` first",
            default: conf.get("release"),
          },
        ]);
        conf.set("release", answers.releaseAddress);
        releaseMintAddress = answers.releaseAddress;
      }

      if (signer) {
        await publishSubmitCommand({
          releaseMintAddress,
          signer,
          url,
          dryRun,
          compliesWithSolanaDappStorePolicies,
          requestorIsAuthorized
        });
      }
    });

  publishCommand
    .command("update")
    .description("Update an existing app on the Solana Mobile dApp publisher portal")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--complies-with-solana-dapp-store-policies",
      "An attestation that the app complies with the Solana dApp Store policies"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT"
    )
    .option("-c, --critical", "Flag for a critical app update request")
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't submit the request to the publisher portal.")
    .action(async ({ releaseMintAddress, keypair, url, compliesWithSolanaDappStorePolicies, requestorIsAuthorized, critical, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (!releaseMintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "releaseAddress",
            message:
              "Release address not provided. Use the previously created release address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create release` first",
            default: conf.get("release"),
          },
        ]);
        conf.set("release", answers.releaseAddress);
        releaseMintAddress = answers.releaseAddress;
      }

      if (signer) {
        await publishUpdateCommand({
          releaseMintAddress,
          signer,
          url,
          dryRun,
          compliesWithSolanaDappStorePolicies,
          requestorIsAuthorized,
          critical
        });
      }
    });

  publishCommand
    .command("remove")
    .description("Remove an existing app from the Solana Mobile dApp publisher portal")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT"
    )
    .option("-c, --critical", "Flag for a critical app removal request")
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't submit the request to the publisher portal.")
    .action(async ({ releaseMintAddress, keypair, url, requestorIsAuthorized, critical, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (!releaseMintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "releaseAddress",
            message:
              "Release address not provided. Use the previously created release address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create release` first",
            default: conf.get("release"),
          },
        ]);
        conf.set("release", answers.releaseAddress);
        releaseMintAddress = answers.releaseAddress;
      }

      if (signer) {
        await publishRemoveCommand({
          releaseMintAddress,
          signer,
          url,
          dryRun,
          requestorIsAuthorized,
          critical
        });
      }
    });

  publishCommand
    .command("support <request_details>")
    .description("Submit a support request for an existing app on the Solana Mobile dApp publisher portal")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't submit the request to the publisher portal.")
    .action(async (requestDetails, { releaseMintAddress, keypair, url, requestorIsAuthorized, dryRun }) => {
      const signer = parseKeypair(keypair);

      if (!releaseMintAddress) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "releaseAddress",
            message:
              "Release address not provided. Use the previously created release address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create release` first",
            default: conf.get("release"),
          },
        ]);
        conf.set("release", answers.releaseAddress);
        releaseMintAddress = answers.releaseAddress;
      }

      if (signer) {
        await publishSupportCommand({
          releaseMintAddress,
          signer,
          url,
          dryRun,
          requestorIsAuthorized,
          requestDetails
        });
      }
    });

  await program.parseAsync(process.argv);
}
main();
