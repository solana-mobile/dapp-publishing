import { Keypair } from "@solana/web3.js";
import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";
import type { AndroidDetails, App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import * as util from "util";
import { exec } from "child_process";

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

class AaptPrefixes {
  quoteRegex = "'(.*?)'";
  quoteNonLazyRegex = "'(.*)'";
  packagePrefix = "package: name=";
  verCodePrefix = "versionCode=";
  verNamePrefix = "versionName=";
  sdkPrefix = "sdkVersion:";
  permissionPrefix = "uses-permission: name=";
  localePrefix = "locales: ";
}

interface CLIConfig {
  publisher: Publisher;
  app: App;
  release: Release;
}

export const getConfigFile = async (aaptDir: string): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/dapp-store/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");

  console.info(`Pulling details from ${configFilePath}`);

  const config = load(configFile) as CLIConfig;

  //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry
  const apkPath = config.release.files[0].uri;
  config.app.android_details = await getAndroidDetails(aaptDir, apkPath);

  // TODO(jon): Verify the contents of the YAML file
  return config;
};

const getAndroidDetails = async (
  aaptDir: string,
  apkPath: string
): Promise<AndroidDetails> => {
  const prefixes = new AaptPrefixes();

  const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging ${apkPath}`);

  const appPackage = new RegExp(prefixes.packagePrefix + prefixes.quoteRegex).exec(stdout);
  const versionCode = new RegExp(prefixes.verCodePrefix + prefixes.quoteRegex).exec(stdout);
  //TODO: Return this and use automatically replacing command line arg
  //const versionName = new RegExp(prefixes.verNamePrefix + prefixes.quoteRegex).exec(stdout);
  const minSdk = new RegExp(prefixes.sdkPrefix + prefixes.quoteRegex).exec(stdout);
  const permissions = new RegExp(prefixes.permissionPrefix + prefixes.quoteNonLazyRegex).exec(stdout);
  const locales = new RegExp(prefixes.localePrefix + prefixes.quoteNonLazyRegex).exec(stdout);

  let permissionArray = Array.from(permissions?.values() ?? []);
  if (permissionArray.length >= 2) {
    permissionArray = permissionArray.slice(1);
  }

  let localeArray = Array.from(locales?.values() ?? []);
  if (localeArray.length == 2) {
    const localesSrc = localeArray[1];
    localeArray = localesSrc.split("' '").slice(1);
  }

  return {
    android_package: appPackage?.[1] ?? "",
    min_sdk: parseInt(minSdk?.[1] ?? "0"),
    version_code: parseInt(versionCode?.[1] ?? "0"),
    permissions: permissionArray,
    locales: localeArray,
  };
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