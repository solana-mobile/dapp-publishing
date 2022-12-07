import type {
  AndroidDetails,
  App,
  Publisher,
  Release,
  SolanaMobileDappPublisherPortal,
} from "@solana-mobile/dapp-publishing-tools";
import { Keypair } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";

import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";
import * as util from "util";
import { exec } from "child_process";
import * as path from "path";
import {
  BundlrStorageDriver,
  keypairIdentity,
  Metaplex,
  toMetaplexFile,
} from "@metaplex-foundation/js";

import { CachedStorageDriver } from "./upload/CachedStorageDriver.js";

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
  solana_mobile_dapp_publisher_portal: SolanaMobileDappPublisherPortal;
}

export const getConfigFile = async (
  buildToolsDir: string | null = null
): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");

  console.info(`Pulling details from ${configFilePath}`);

  const config = load(configFile) as CLIConfig;

  if (buildToolsDir && buildToolsDir.length > 0) {
    //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry

    const apkSrc = config.release.files[0].uri;
    const apkPath = path.join(process.cwd(), apkSrc);

    config.release.android_details = await getAndroidDetails(
      buildToolsDir,
      apkPath
    );
  }

  const publisherIcon = config.publisher.media?.find(
    (asset: any) => asset.purpose === "icon"
  )?.uri;
  if (publisherIcon) {
    const iconPath = path.join(process.cwd(), publisherIcon);
    const iconBuffer = await fs.promises.readFile(iconPath);
    config.publisher.icon = toMetaplexFile(iconBuffer, publisherIcon);
  }

  const appIcon = config.app.media?.find(
    (asset: any) => asset.purpose === "icon"
  )?.uri;
  if (appIcon) {
    const iconPath = path.join(process.cwd(), appIcon);
    const iconBuffer = await fs.promises.readFile(iconPath);
    config.app.icon = toMetaplexFile(iconBuffer, appIcon);
  }

  // TODO(jon): Verify the contents of the YAML file
  return config;
};

const getAndroidDetails = async (
  aaptDir: string,
  apkPath: string
): Promise<AndroidDetails> => {
  const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging ${apkPath}`);

  const appPackage = new RegExp(
    AaptPrefixes.packagePrefix + AaptPrefixes.quoteRegex
  ).exec(stdout);
  const versionCode = new RegExp(
    AaptPrefixes.verCodePrefix + AaptPrefixes.quoteRegex
  ).exec(stdout);
  //TODO: Return this and use automatically replacing command line arg
  //const versionName = new RegExp(prefixes.verNamePrefix + prefixes.quoteRegex).exec(stdout);
  const minSdk = new RegExp(
    AaptPrefixes.sdkPrefix + AaptPrefixes.quoteRegex
  ).exec(stdout);
  const permissions = new RegExp(
    AaptPrefixes.permissionPrefix + AaptPrefixes.quoteNonLazyRegex
  ).exec(stdout);
  const locales = new RegExp(
    AaptPrefixes.localePrefix + AaptPrefixes.quoteNonLazyRegex
  ).exec(stdout);

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

export const saveToConfig = async ({
  publisher,
  app,
  release,
}: SaveToConfigArgs) => {
  const currentConfig = await getConfigFile();

  delete currentConfig.publisher.icon;
  delete currentConfig.app.icon;

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
    solana_mobile_dapp_publisher_portal:
      currentConfig.solana_mobile_dapp_publisher_portal,
  };

  // TODO(jon): Verify the contents of the YAML file
  fs.writeFileSync(`${process.cwd()}/config.yaml`, dump(newConfig));
};

export const getMetaplexInstance = (
  connection: Connection,
  keypair: Keypair
) => {
  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

  const bundlrStorageDriver = connection.rpcEndpoint.includes("devnet")
    ? new BundlrStorageDriver(metaplex, {
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
      })
    : new BundlrStorageDriver(metaplex);

  metaplex.storage().setDriver(
    new CachedStorageDriver(bundlrStorageDriver, {
      assetManifestPath: "./.asset-manifest.json",
    })
  );
  return metaplex;
};
