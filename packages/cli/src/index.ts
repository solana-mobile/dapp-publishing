import { Command } from "commander";
import Conf from "conf";
import inquirer from "inquirer";
import { validateCommand } from "./commands/index.js";
import { createAppCommand, createPublisherCommand, createReleaseCommand } from "./commands/create/index.js";
import { parseKeypair } from "./utils.js";
import * as dotenv from "dotenv";
import * as util from "util";
import { exec } from "child_process";
import { Keypair } from "@solana/web3.js";

const program = new Command();
const conf = new Conf({ projectName: "dapp-store" });
const runExec = util.promisify(exec);

async function main() {
  program
    .name("dapp-store")
    .version("0.1.0")
    .description("CLI to assist with publishing to the Saga Dapp Store");

  program
    .command("test")
    .description("Andrew's development testing command")
    .requiredOption(
      "-t, --test <path-to-apk>",
      "Path to apk file"
    )
    .action(async ({ test }) => {
      const quoteRegex = "'(.*?)'";
      const quoteNonLazyRegex = "'(.*)'";
      const packagePrefix = "package: name=";
      const verCodePrefix = "versionCode=";
      const verNamePrefix = "versionName=";
      const sdkPrefx = "sdkVersion:";
      const permissionPrefix = "uses-permission: name=";
      const localePrefix = "locales: ";

      dotenv.config();
      const aaptDir = process.env.AAPT_DIR;
      const { stdout, stderr } = await runExec(`${aaptDir}/aapt2 dump badging ${test}`)

      const appPackage = new RegExp(packagePrefix + quoteRegex).exec(stdout);
      const versionCode = new RegExp(verCodePrefix + quoteRegex).exec(stdout);
      const versionName = new RegExp(verNamePrefix + quoteRegex).exec(stdout);
      const minSdk = new RegExp(sdkPrefx + quoteRegex).exec(stdout);
      const permissions = new RegExp(permissionPrefix + quoteNonLazyRegex).exec(stdout);
      const locales = new RegExp(localePrefix + quoteNonLazyRegex).exec(stdout);

      console.log(appPackage?.[1]);
      console.log(versionCode?.[1]);
      console.log(versionName?.[1]);
      console.log(minSdk?.[1]);
      console.log(permissions?.[1]);
      const result = locales?.values();

      if (result != undefined) {
        for (const blah of result) {
          console.log(blah); // 1, "string", false
        }
      }
    })

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
    // .requiredOption(
    //   "-k, --keypair <path-to-keypair-file>",
    //   "Path to keypair file"
    // )
    .option(
      "-a, --app-mint-address <app-mint-address>",
      "The mint address of the app NFT"
    )
    .option("-u, --url", "RPC URL", "https://devnet.genesysgo.net")
    .option("-d, --dry-run", "Flag for dry run. Doesn't mint an NFT")
    .action(async (version, { appMintAddress, keypair, url, dryRun }) => {
      //const signer = parseKeypair(keypair);
      const signer = new Keypair();

      // if (!appMintAddress) {
      //   const answers = await inquirer.prompt([
      //     {
      //       type: "input",
      //       name: "appAddress",
      //       message:
      //         "App address not provided. Use the previously created app address? NOTE: This is not the same as your keypair's public key! Make sure to run `dapp-store create app` first",
      //       default: conf.get("app"),
      //     },
      //   ]);
      //   conf.set("app", answers.appAddress);
      // }

      //if (signer) {
        await createReleaseCommand({
          appMintAddress: appMintAddress ?? conf.get("app"),
          version,
          signer,
          url,
          dryRun,
        });
      //}
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
