import { Keypair } from "@solana/web3.js";
import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";

import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";

export const debug = debugModule("CLI");

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch (e) {
    console.error(
      `Something went wrong when attempting to retrieve the keypair at ${pathToKeypairFile}`
    );
  }
};

interface CLIConfig {
  publisher: Publisher;
  app: App;
  release: Release;
}

export const getConfigFile = (aaptDir: string): CLIConfig => {
  const configFilePath = `${process.cwd()}/dapp-store/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");
  console.info(`Pulling details from ${configFilePath}`);

  const config = load(configFile) as CLIConfig;
  // TODO(jon): Verify the contents of the YAML file
  return config;
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address" | "version">;
};

export const saveToConfig = ({ publisher, app, release }: SaveToConfigArgs) => {
  const currentConfig = getConfigFile();

  const newConfig: CLIConfig = {
    publisher: {
      ...currentConfig.publisher,
      address: publisher?.address ?? currentConfig.publisher.address,
    },
    app: {
      ...currentConfig.app,
      address: app?.address ?? currentConfig.app.address,
    },
    release: {
      ...currentConfig.release,
      address: release?.address ?? currentConfig.release.address,
      version: release?.version ?? currentConfig.release.version,
    },
  };

  // TODO(jon): Verify the contents of the YAML file
  fs.writeFileSync(`${process.cwd()}/dapp-store/config.yaml`, dump(newConfig));
};

// import fs from "fs";
// import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
// import { AndroidDetails, createRelease } from "@solana-mobile/dapp-publishing-tools";
// import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
// import { load } from "js-yaml";
// import * as util from "util";
// import { exec } from "child_process";
//
// const runExec = util.promisify(exec);
//
// class AaptPrefixes {
//   quoteRegex = "'(.*?)'";
//   quoteNonLazyRegex = "'(.*)'";
//   packagePrefix = "package: name=";
//   verCodePrefix = "versionCode=";
//   verNamePrefix = "versionName=";
//   sdkPrefix = "sdkVersion:";
//   permissionPrefix = "uses-permission: name=";
//   localePrefix = "locales: ";
// }
//
// type CreateReleaseCommandInput = {
//   appMintAddress: string;
//   version: string;
//   aaptDir: string;
//   signer: Keypair;
//   url: string;
//   dryRun?: boolean;
// };
//
// export const getReleaseDetails = async (
//   version: string,
//   aaptDir: string
// ): Promise<{ release: Release; app: App; publisher: Publisher }> => {
//   const globalConfigFile = `${process.cwd()}/dapp-store/config.yaml`;
//   console.info(`Pulling app and publisher details from ${globalConfigFile}`);
//
//   const { app, publisher } = load(
//     // TODO(jon): Parameterize this
//     fs.readFileSync(globalConfigFile, "utf-8")
//   ) as { app: App; publisher: Publisher };
//
//   const configFile = `${process.cwd()}/dapp-store/releases/${version}/release.yaml`;
//   console.info(`Pulling release details from ${configFile}`);
//
//   const { release } = load(
//     // TODO(jon): Parameterize this
//     fs.readFileSync(configFile, "utf-8")
//   ) as { release: Release };
//
//   //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry
//   const apkPath = release.files[0].uri;
//   app.android_details = await getAndroidDetails(aaptDir, apkPath);
//
//   return { release, app, publisher };
// };
//
// const getAndroidDetails = async (
//   aaptDir: string,
//   apkPath: string
// ): Promise<AndroidDetails> => {
//   const prefixes = new AaptPrefixes();
//
//   const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging ${apkPath}`);
//
//   const appPackage = new RegExp(prefixes.packagePrefix + prefixes.quoteRegex).exec(stdout);
//   const versionCode = new RegExp(prefixes.verCodePrefix + prefixes.quoteRegex).exec(stdout);
//   //TODO: Return this and use automatically replacing command line arg
//   //const versionName = new RegExp(prefixes.verNamePrefix + prefixes.quoteRegex).exec(stdout);
//   const minSdk = new RegExp(prefixes.sdkPrefix + prefixes.quoteRegex).exec(stdout);
//   const permissions = new RegExp(prefixes.permissionPrefix + prefixes.quoteNonLazyRegex).exec(stdout);
//   const locales = new RegExp(prefixes.localePrefix + prefixes.quoteNonLazyRegex).exec(stdout);
//
//   let permissionArray = Array.from(permissions?.values() ?? []);
//   if (permissionArray.length >= 2) {
//     permissionArray = permissionArray.slice(1);
//   }
//
//   let localeArray = Array.from(locales?.values() ?? []);
//   if (localeArray.length == 2) {
//     const localesSrc = localeArray[1];
//     localeArray = localesSrc.split("' '").slice(1);
//   }
//
//   return {
//     android_package: appPackage?.[1] ?? "",
//     min_sdk: parseInt(minSdk?.[1] ?? "0"),
//     version_code: parseInt(versionCode?.[1] ?? "0"),
//     permissions: permissionArray,
//     locales: localeArray,
//   };
// };