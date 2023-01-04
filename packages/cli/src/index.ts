import { Command } from "commander";
import { validateCommand } from "./commands/index.js";
import { createAppCommand, createPublisherCommand, createReleaseCommand } from "./commands/create/index.js";
import {
  publishRemoveCommand,
  publishSubmitCommand,
  publishSupportCommand,
  publishUpdateCommand
} from "./commands/publish/index.js";
import { checkForSelfUpdate, getConfigFile, parseKeypair, showUserErrorMessage } from "./utils.js";
import terminalLink from "terminal-link";

import * as dotenv from "dotenv";

dotenv.config();

const hasAddressInConfig = ({ address }: { address: string }) => {
  return !!address;
};

const program = new Command();

function resolveBuildToolsPath(buildToolsPath: string | undefined) {
  // If a path was specified on the command line, use that
  if (buildToolsPath !== undefined) {
    return buildToolsPath;
  }

  // If a path is specified in a .env file, use that
  if (process.env.ANDROID_TOOLS_DIR !== undefined) {
    return process.env.ANDROID_TOOLS_DIR;
  }

  // No path was specified
  return;
}

async function tryWithErrorMessage(block: () => Promise<any>) {
  try {
    await block()
  } catch (e) {
    showUserErrorMessage((e as Error | null)?.message ?? "");
  }
}

async function main() {
  program
    .name("dapp-store")
    .version("0.1.7")
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
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .action(async ({ keypair, url, dryRun }) => {
      tryWithErrorMessage(async () => {
        await checkForSelfUpdate();

        const signer = parseKeypair(keypair);
        if (signer) {
          const result = await createPublisherCommand({ signer, url, dryRun });

          console.log(terminalLink('\nPublisher NFT successfully minted:', `https://solscan.io/token/${result.publisherAddress}?cluster=devnet`));
        }
      });
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
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .action(async ({ publisherMintAddress, keypair, url, dryRun }) => {
      tryWithErrorMessage(async () => {
        await checkForSelfUpdate();

        const config = await getConfigFile();

        if (!hasAddressInConfig(config.publisher) && !publisherMintAddress) {
          throw new Error("Either specify a publisher mint address in the config file or specify as a CLI argument to this command.")
        }

        const signer = parseKeypair(keypair);
        if (signer) {
          await createAppCommand({
            publisherMintAddress: publisherMintAddress,
            signer,
            url,
            dryRun,
          });
        }
      });
    });

  createCommand
    .command("release")
    .description("Create a release")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT"
    )
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .option(
      "-b, --build-tools-path <build-tools-path>",
      "Path to Android build tools which contains AAPT2"
    )
    .action(async ({ appMintAddress, keypair, url, dryRun, buildToolsPath }) => {
        tryWithErrorMessage(async () => {
          await checkForSelfUpdate();

          const resolvedBuildToolsPath = resolveBuildToolsPath(buildToolsPath);
          if (resolvedBuildToolsPath === undefined) {
            throw new Error("Please specify an Android build tools directory in the .env file or via the command line argument.")
          }

          const config = await getConfigFile();
          if (!hasAddressInConfig(config.app) && !appMintAddress) {
            throw new Error("Either specify an app mint address in the config file or specify as a CLI argument to this command")
          }

          const signer = parseKeypair(keypair);
          if (signer) {
            const result = await createReleaseCommand({
              appMintAddress: appMintAddress,
              buildToolsPath: resolvedBuildToolsPath,
              signer,
              url,
              dryRun,
            });
          }
        });
      }
    );

  program
    .command("validate")
    .description("Validates details prior to publishing")
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .option(
      "-b, --build-tools-path <build-tools-path>",
      "Path to Android build tools which contains AAPT2"
    )
    .action(async ({ keypair, buildToolsPath }) => {
      tryWithErrorMessage(async () => {
        await checkForSelfUpdate();

        const resolvedBuildToolsPath = resolveBuildToolsPath(buildToolsPath);
        if (resolvedBuildToolsPath === undefined) {
          throw new Error("Please specify an Android build tools directory in the .env file or via the command line argument.")
        }

        const signer = parseKeypair(keypair);
        if (signer) {
          await validateCommand({
            signer,
            buildToolsPath: resolvedBuildToolsPath,
          });
        }
      });
    });

  const publishCommand = program
    .command("publish")
    .description(
      "Submit a publishing request (`submit`, `update`, `remove`, or `support`) to the Solana Mobile dApp publisher portal"
    );

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
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT. If not specified, the value from config.yaml will be used."
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT. If not specified, the value from config.yaml will be used."
    )
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option(
      "-d, --dry-run",
      "Flag for dry run. Doesn't submit the request to the publisher portal."
    )
    .action(
      async ({
        appMintAddress,
        releaseMintAddress,
        keypair,
        url,
        compliesWithSolanaDappStorePolicies,
        requestorIsAuthorized,
        dryRun,
      }) => {
        tryWithErrorMessage(async () => {
          await checkForSelfUpdate();

          const config = await getConfigFile();

          if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
            throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
          }

          const signer = parseKeypair(keypair);
          if (signer) {
            await publishSubmitCommand({
              appMintAddress,
              releaseMintAddress,
              signer,
              url,
              dryRun,
              compliesWithSolanaDappStorePolicies,
              requestorIsAuthorized,
            });
          }
        });
      }
    );

  publishCommand
    .command("update")
    .description(
      "Update an existing app on the Solana Mobile dApp publisher portal"
    )
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
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT. If not specified, the value from config.yaml will be used."
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT. If not specified, the value from config.yaml will be used."
    )
    .option("-c, --critical", "Flag for a critical app update request")
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option(
      "-d, --dry-run",
      "Flag for dry run. Doesn't submit the request to the publisher portal."
    )
    .action(
      async ({
        appMintAddress,
        releaseMintAddress,
        keypair,
        url,
        compliesWithSolanaDappStorePolicies,
        requestorIsAuthorized,
        critical,
        dryRun,
      }) => {
        tryWithErrorMessage(async () => {
          await checkForSelfUpdate();

          const config = await getConfigFile();

          if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
            throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
          }

          const signer = parseKeypair(keypair);
          if (signer) {
            await publishUpdateCommand({
              appMintAddress,
              releaseMintAddress,
              signer,
              url,
              dryRun,
              compliesWithSolanaDappStorePolicies,
              requestorIsAuthorized,
              critical,
            });
          }
        });
      }
    );

  publishCommand
    .command("remove")
    .description(
      "Remove an existing app from the Solana Mobile dApp publisher portal"
    )
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT. If not specified, the value from config.yaml will be used."
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT. If not specified, the value from config.yaml will be used."
    )
    .option("-c, --critical", "Flag for a critical app removal request")
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option(
      "-d, --dry-run",
      "Flag for dry run. Doesn't submit the request to the publisher portal."
    )
    .action(
      async ({
        appMintAddress,
        releaseMintAddress,
        keypair,
        url,
        requestorIsAuthorized,
        critical,
        dryRun,
      }) => {
        tryWithErrorMessage(async () => {
          await checkForSelfUpdate();

          const config = await getConfigFile();

          if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
            throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
          }

          const signer = parseKeypair(keypair);
          if (signer) {
            await publishRemoveCommand({
              appMintAddress,
              releaseMintAddress,
              signer,
              url,
              dryRun,
              requestorIsAuthorized,
              critical,
            });
          }
        })
      }
    );

  publishCommand
    .command("support <request_details>")
    .description(
      "Submit a support request for an existing app on the Solana Mobile dApp publisher portal"
    )
    .requiredOption(
      "-k, --keypair <path-to-keypair-file>",
      "Path to keypair file"
    )
    .requiredOption(
      "--requestor-is-authorized",
      "An attestation that the party making this Solana dApp publisher portal request is authorized to do so"
    )
    .option(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT. If not specified, the value from config.yaml will be used."
    )
    .option(
      "-r, --release-mint-address <release-mint-address>",
      "The mint address of the release NFT. If not specified, the value from config.yaml will be used."
    )
    .option("-u, --url <url>", "RPC URL", "https://devnet.genesysgo.net")
    .option(
      "-d, --dry-run",
      "Flag for dry run. Doesn't submit the request to the publisher portal."
    )
    .action(
      async (
        requestDetails,
        { appMintAddress, releaseMintAddress, keypair, url, requestorIsAuthorized, dryRun }
      ) => {
        tryWithErrorMessage(async () => {
          await checkForSelfUpdate();

          const config = await getConfigFile();

          if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
            throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
          }

          const signer = parseKeypair(keypair);
          if (signer) {
            await publishSupportCommand({
              appMintAddress,
              releaseMintAddress,
              signer,
              url,
              dryRun,
              requestorIsAuthorized,
              requestDetails,
            });
          }
        });
      }
    );

  await program.parseAsync(process.argv);
}
main();
