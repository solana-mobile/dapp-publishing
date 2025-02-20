import { Command } from "commander";
import { validateCommand } from "./commands/index.js";
import { createAppCommand, createPublisherCommand, createReleaseCommand } from "./commands/create/index.js";
import {
  publishRemoveCommand,
  publishSubmitCommand,
  publishSupportCommand,
  publishUpdateCommand
} from "./commands/publish/index.js";
import {
  checkForSelfUpdate,
  checkSubmissionNetwork,
  Constants,
  alphaAppSubmissionMessage,
  dryRunSuccessMessage,
  generateNetworkSuffix,
  parseKeypair,
  showMessage,
  showNetworkWarningIfApplicable
} from "./CliUtils.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js"
import * as dotenv from "dotenv";
import { initScaffold } from "./commands/scaffolding/index.js";
import { loadPublishDetails, loadPublishDetailsWithChecks } from "./config/PublishDetails.js";

dotenv.config();

const hasAddressInConfig = ({ address }: { address: string }) => {
  return !!address;
};

export const mainCli = new Command();

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

/**
 * This method should be updated with each new release of the CLI, and just do nothing when there isn't anything to report
 */
function latestReleaseMessage() {
  const messages = [
    `- App details page now supports a Banner Graphic image of size 1200x600px and a Feature Graphic image of size 1200x1200px (optional)`,
    `- App details page now supports video files. (mp4 file format only and minimum resolution 720p)`,
    `- priority fee has been updated to ${Constants.DEFAULT_PRIORITY_FEE} lamports = ${Constants.DEFAULT_PRIORITY_FEE / LAMPORTS_PER_SOL} SOL. To adjust this value use param "-p" or "--priority-fee-lamports"`,
    `- At least 4 screenshots are now required to update or release a new app`,
    `- App icons should be exactly 512x512.`
  ].join('\n\n')
  showMessage(
    `Publishing Tools Version ${ Constants.CLI_VERSION }`,
    messages,
    "warning"
  );
}

async function tryWithErrorMessage(block: () => Promise<any>) {
  try {
    await block()
  } catch (e) {
    const errorMsg = (e as Error | null)?.message ?? "";

    showMessage("Error", errorMsg, "error");
    process.exit(-1)
  }
}

mainCli
  .name("dapp-store")
  .version(Constants.CLI_VERSION)
  .description("CLI to assist with publishing to the Saga Dapp Store")

export const initCliCmd = mainCli
  .command("init")
  .description("First-time initialization of tooling configuration")
  .action(async () => {
    await tryWithErrorMessage(async () => {
      const msg = initScaffold();

      showMessage("Initialized", msg);
    })
  });

export const createCliCmd = mainCli
  .command("create")
  .description("Create a `publisher`, `app`, or `release`")

export const createPublisherCliCmd = createCliCmd
  .command("publisher")
  .description("Create a publisher")
  .requiredOption(
    "-k, --keypair <path-to-keypair-file>",
    "Path to keypair file"
  )
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
  .option("-s, --storage-config <storage-config>", "Provide alternative storage configuration details")
  .option("-p, --priority-fee-lamports <priority-fee-lamports>", "Priority Fee lamports")
  .action(async ({ keypair, url, dryRun, storageConfig, priorityFeeLamports }) => {
    await tryWithErrorMessage(async () => {
      showNetworkWarningIfApplicable(url)
      latestReleaseMessage();
      await checkForSelfUpdate();

      const signer = parseKeypair(keypair);
      if (signer) {
        const result: { publisherAddress: string, transactionSignature: string } = await createPublisherCommand({ signer, url, dryRun, storageParams: storageConfig, priorityFeeLamports });

        if (dryRun) {
          dryRunSuccessMessage()
        } else {
          const displayUrl = `https://explorer.solana.com/address/${result.publisherAddress}${generateNetworkSuffix(url)}`;
          const transactionUrl = `https://explorer.solana.com/tx/${result.transactionSignature}${generateNetworkSuffix(url)}`;
          const resultText = `Publisher NFT successfully minted successfully:\n${displayUrl}\n${transactionUrl}`;

          showMessage("Success", resultText);
        }
      }
    });
  });

export const createAppCliCmd = createCliCmd
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
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
  .option("-s, --storage-config <storage-config>", "Provide alternative storage configuration details")
  .option("-p, --priority-fee-lamports <priority-fee-lamports>", "Priority Fee lamports")
  .action(async ({ publisherMintAddress, keypair, url, dryRun, storageConfig, priorityFeeLamports }) => {
    await tryWithErrorMessage(async () => {
      showNetworkWarningIfApplicable(url)
      latestReleaseMessage();
      await checkForSelfUpdate();

      const config = await loadPublishDetailsWithChecks();

      if (!hasAddressInConfig(config.publisher) && !publisherMintAddress) {
        throw new Error("Either specify a publisher mint address in the config file or specify as a CLI argument to this command.");
      }

      const signer = parseKeypair(keypair);
      if (signer) {
        const result = await createAppCommand({
          publisherMintAddress: publisherMintAddress,
          signer,
          url,
          dryRun,
          storageParams: storageConfig,
          priorityFeeLamports: priorityFeeLamports,
        });

        if (dryRun) {
          dryRunSuccessMessage()
        } else {
          const displayUrl = `https://explorer.solana.com/address/${result.appAddress}${generateNetworkSuffix(url)}`;
          const transactionUrl = `https://explorer.solana.com/tx/${result.transactionSignature}${generateNetworkSuffix(url)}`;
          const resultText = `App NFT successfully minted:\n${displayUrl}\n${transactionUrl}`;  
          showMessage("Success", resultText);
        }
      }
    });
  });

export const createReleaseCliCmd = createCliCmd
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
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
  .option(
    "-b, --build-tools-path <build-tools-path>",
    "Path to Android build tools which contains AAPT2"
  )
  .option("-s, --storage-config <storage-config>", "Provide alternative storage configuration details")
  .option("-p, --priority-fee-lamports <priority-fee-lamports>", "Priority Fee lamports")
  .action(async ({ appMintAddress, keypair, url, dryRun, buildToolsPath, storageConfig, priorityFeeLamports }) => {
    await tryWithErrorMessage(async () => {
        showNetworkWarningIfApplicable(url)
        latestReleaseMessage();
        await checkForSelfUpdate();

        const resolvedBuildToolsPath = resolveBuildToolsPath(buildToolsPath);
        if (resolvedBuildToolsPath === undefined) {
          throw new Error("Please specify an Android build tools directory in the .env file or via the command line argument.")
        }

        const config = await loadPublishDetailsWithChecks();
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
            storageParams: storageConfig,
            priorityFeeLamports: priorityFeeLamports
          });

          if (dryRun) {
            dryRunSuccessMessage()
          } else {
            const displayUrl = `https://explorer.solana.com/address/${result?.releaseAddress}${generateNetworkSuffix(url)}`;
            const transactionUrl = `https://explorer.solana.com/tx/${result.transactionSignature}${generateNetworkSuffix(url)}`;
            const resultText = `Release NFT successfully minted:\n${displayUrl}\n${transactionUrl}`;

            showMessage("Success", resultText);
          }
        }
      });
    }
  );

mainCli
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
    await tryWithErrorMessage(async () => {
      latestReleaseMessage();
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

const publishCommand = mainCli
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
    "The mint address of the app NFT. If not specified, the value from your config file will be used."
  )
  .option(
    "-r, --release-mint-address <release-mint-address>",
    "The mint address of the release NFT. If not specified, the value from your config file will be used."
  )
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option(
    "-d, --dry-run",
    "Flag for dry run. Doesn't submit the request to the publisher portal."
  )
  .option("-l, --alpha", "Flag to mark the submission as alpha test.")
  .action(
    async ({
             appMintAddress,
             releaseMintAddress,
             keypair,
             url,
             compliesWithSolanaDappStorePolicies,
             requestorIsAuthorized,
             dryRun,
             alpha,
           }) => {
      await tryWithErrorMessage(async () => {
        await checkForSelfUpdate();
        checkSubmissionNetwork(url);

        const config = await loadPublishDetails(Constants.getConfigFilePath());

        if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
          throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
        }

        if (alpha) {
          alphaAppSubmissionMessage()
        }

        const signer = parseKeypair(keypair);
        if (signer) {
          if (config.lastUpdatedVersionOnStore != null && config.lastSubmittedVersionOnChain.address != null) {
              await publishUpdateCommand({
                appMintAddress: appMintAddress,
                releaseMintAddress: releaseMintAddress,
                signer: signer,
                url: url,
                dryRun: dryRun,
                compliesWithSolanaDappStorePolicies: compliesWithSolanaDappStorePolicies,
                requestorIsAuthorized: requestorIsAuthorized,
                critical: false,
                alphaTest: alpha,
              });
          } else {
            await publishSubmitCommand({
              appMintAddress: appMintAddress,
              releaseMintAddress: releaseMintAddress,
              signer: signer,
              url: url,
              dryRun: dryRun,
              compliesWithSolanaDappStorePolicies: compliesWithSolanaDappStorePolicies,
              requestorIsAuthorized: requestorIsAuthorized,
              alphaTest: alpha,
            });
          }

          if (dryRun) {
            dryRunSuccessMessage()
          } else {
            showMessage("Success", "Successfully submitted to the Solana Mobile dApp publisher portal");
          }
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
    "The mint address of the app NFT. If not specified, the value from your config file will be used."
  )
  .option(
    "-r, --release-mint-address <release-mint-address>",
    "The mint address of the release NFT. If not specified, the value from your config file will be used."
  )
  .option("-c, --critical", "Flag for a critical app update request")
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option(
    "-d, --dry-run",
    "Flag for dry run. Doesn't submit the request to the publisher portal."
  )
  .option("-l, --alpha", "Flag to mark the submission as alpha test.")
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
             alpha,
           }) => {
      await tryWithErrorMessage(async () => {
        await checkForSelfUpdate();
        checkSubmissionNetwork(url);

        const config = await loadPublishDetails(Constants.getConfigFilePath())

        if (!hasAddressInConfig(config.release) && !releaseMintAddress) {
          throw new Error("Either specify a release mint address in the config file or specify as a CLI argument to this command.")
        }

        if (alpha) {
          alphaAppSubmissionMessage()
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
            alphaTest: alpha,
          });

          if (dryRun) {
            dryRunSuccessMessage()
          } else {
            showMessage("Success", "dApp successfully updated on the publisher portal");
          }
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
    "The mint address of the app NFT. If not specified, the value from your config file will be used."
  )
  .option(
    "-r, --release-mint-address <release-mint-address>",
    "The mint address of the release NFT. If not specified, the value from your config file will be used."
  )
  .option("-c, --critical", "Flag for a critical app removal request")
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
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
      await tryWithErrorMessage(async () => {
        await checkForSelfUpdate();
        checkSubmissionNetwork(url);

        const config = await loadPublishDetails(Constants.getConfigFilePath())

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

          if (dryRun) {
            dryRunSuccessMessage()
          } else {
            showMessage("Success", "dApp successfully removed from the publisher portal");
          }
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
    "The mint address of the app NFT. If not specified, the value from your config file will be used."
  )
  .option(
    "-r, --release-mint-address <release-mint-address>",
    "The mint address of the release NFT. If not specified, the value from your config file will be used."
  )
  .option("-u, --url <url>", "RPC URL", Constants.DEFAULT_RPC_DEVNET)
  .option(
    "-d, --dry-run",
    "Flag for dry run. Doesn't submit the request to the publisher portal."
  )
  .action(
    async (
      requestDetails,
      { appMintAddress, releaseMintAddress, keypair, url, requestorIsAuthorized, dryRun }
    ) => {
      await tryWithErrorMessage(async () => {
        await checkForSelfUpdate();
        checkSubmissionNetwork(url);

        const config = await loadPublishDetails(Constants.getConfigFilePath())

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

          if (dryRun) {
            dryRunSuccessMessage()
          } else {
            showMessage("Success", "Support request sent successfully");
          }
        }
      });
    }
  );