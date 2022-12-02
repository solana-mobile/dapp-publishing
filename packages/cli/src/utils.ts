import { Keypair } from "@solana/web3.js";
import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";
import type { AndroidDetails, App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import * as util from "util";
import { exec } from "child_process";
import * as path from "path";

const runExec = util.promisify(exec);

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

const AaptPrefixes = {
  quoteRegex: "'(.*?)'",
  quoteNonLazyRegex: "'(.*)'",
  packagePrefix: "package: name=",
  verCodePrefix: "versionCode=",
  verNamePrefix: "versionName=",
  sdkPrefix: "sdkVersion:",
  permissionPrefix: "uses-permission: name=",
  localePrefix: "locales: ",
};

// TODO: Add version number return here
interface CLIConfig {
  publisher: Publisher;
  app: App;
  release: Release;
}

export const getConfigFile = async (
  buildToolsDir: string | null = null
): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/dapp-store/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");

  console.info(`Pulling details from ${configFilePath}`);

  const config = load(configFile) as CLIConfig;

  if (buildToolsDir && buildToolsDir.length > 0) {
    //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry

    const apkSrc = config.release.files[0].uri;
    const apkPath = path.join(process.cwd(), "dapp-store", "files", apkSrc);

    config.release.android_details = await getAndroidDetails(buildToolsDir, apkPath);
  }

  // TODO(jon): Verify the contents of the YAML file
  return config;
};

const getAndroidDetails = async (
  aaptDir: string,
  apkPath: string
): Promise<AndroidDetails> => {
  const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging ${apkPath}`);

  const appPackage = new RegExp(AaptPrefixes.packagePrefix + AaptPrefixes.quoteRegex).exec(stdout);
  const versionCode = new RegExp(AaptPrefixes.verCodePrefix + AaptPrefixes.quoteRegex).exec(stdout);
  //TODO: Return this and use automatically replacing command line arg
  //const versionName = new RegExp(prefixes.verNamePrefix + prefixes.quoteRegex).exec(stdout);
  const minSdk = new RegExp(AaptPrefixes.sdkPrefix + AaptPrefixes.quoteRegex).exec(stdout);
  const permissions = new RegExp(AaptPrefixes.permissionPrefix + AaptPrefixes.quoteNonLazyRegex).exec(stdout);
  const locales = new RegExp(AaptPrefixes.localePrefix + AaptPrefixes.quoteNonLazyRegex).exec(stdout);

  let permissionArray = Array.from(permissions?.values() ?? []);
  if (permissionArray.length >= 2) {
    permissionArray = permissionArray.slice(1);
  }

  let localeArray = Array.from(locales?.values() ?? []);
  if (localeArray.length == 2) {
    const localesSrc = localeArray[1];
    localeArray = localesSrc.split("' '").slice(1);
  }

  throw new Error("TODO REMOVE ME");

  return {
    android_package: appPackage?.[1] ?? "",
    min_sdk: parseInt(minSdk?.[1] ?? "0", 10),
    version_code: parseInt(versionCode?.[1] ?? "0", 10),
    permissions: permissionArray,
    locales: localeArray,
  };
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address" | "version">;
};

export const saveToConfig = async ({ publisher, app, release }: SaveToConfigArgs) => {
  const currentConfig = await getConfigFile();

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