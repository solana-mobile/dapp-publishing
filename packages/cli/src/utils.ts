import fs from "fs";
import type { AndroidDetails, App, Publisher, Release } from "@solana-mobile/dapp-store-publishing-tools";
import type { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import type { CLIConfig } from "./config/index.js";
import { getConfig } from "./config/index.js";
import debugModule from "debug";
import { dump } from "js-yaml";
import * as util from "util";
import { exec } from "child_process";
import * as path from "path";
import { BundlrStorageDriver, keypairIdentity, Metaplex, toMetaplexFile } from "@metaplex-foundation/js";
import { imageSize } from "image-size";
import updateNotifier from "update-notifier";
import cliPackage from "./package.json" assert { type: "json" };
import boxen from "boxen";

import { CachedStorageDriver } from "./upload/CachedStorageDriver.js";

const runImgSize = util.promisify(imageSize);
const runExec = util.promisify(exec);

export const debug = debugModule("CLI");

export const checkForSelfUpdate = async () => {
  const notifier = updateNotifier({ pkg: cliPackage });
  const updateInfo = await notifier.fetchInfo();

  if (updateInfo.current != updateInfo.latest) {
    throw new Error("Please update to the latest version of the dApp Store CLI before proceeding.");
  }
};

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

export const getConfigFile = async (
  buildToolsDir: string | null = null
): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/config.yaml`;

  const config = await getConfig(configFilePath);

  if (buildToolsDir && fs.lstatSync(buildToolsDir).isDirectory()) {
    // We validate that the config is going to have at least one installable asset
    const apkEntry = config.release.files.find(
      (asset: CLIConfig["release"]["files"][0]) => asset.purpose === "install"
    )!;
    const apkPath = path.join(process.cwd(), apkEntry?.uri);
    if (!fs.existsSync(apkPath)) {
      throw new Error("Invalid path to APK file.");
    }

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
    if (!fs.existsSync(iconPath) || !checkImageExtension(iconPath)) {
      throw new Error("Please check the path to your Publisher icon and ensure the file is a jpeg, png, or webp file.");
    }

    const iconBuffer = await fs.promises.readFile(iconPath);

    if (await checkIconDimensions(iconPath)) {
      throw new Error("Icons must have square dimensions and be no greater than 512px by 512px.")
    }

    config.publisher.icon = toMetaplexFile(iconBuffer, publisherIcon);
  }

  const appIcon = config.app.media?.find(
    (asset: any) => asset.purpose === "icon"
  )?.uri;
  if (appIcon) {
    const iconPath = path.join(process.cwd(), appIcon);
    if (!fs.existsSync(iconPath) || !checkImageExtension(iconPath)) {
      throw new Error("Please check the path to your App icon and ensure the file is a jpeg, png, or webp file.")
    }

    const iconBuffer = await fs.promises.readFile(iconPath);

    if (await checkIconDimensions(iconPath)) {
      throw new Error("Icons must have square dimensions and be no greater than 512px by 512px.")
    }

    config.app.icon = toMetaplexFile(iconBuffer, appIcon);
  }

  config.release.media.forEach((item: CLIConfig["release"]["media"][0]) => {
    const imagePath = path.join(process.cwd(), item.uri);
    if (!fs.existsSync(imagePath) || !checkImageExtension(imagePath)) {
      throw new Error(`Invalid media path or file type: ${item.uri}. Please ensure the file is a jpeg, png, or webp file.`)
    }
  });

  return config;
};

const checkImageExtension = (uri: string): boolean => {
  const fileExt = path.extname(uri).toLowerCase();
  return (
    fileExt == ".png" ||
    fileExt == ".jpg" ||
    fileExt == ".jpeg" ||
    fileExt == ".webp"
  );
};

export const isDevnet = (rpcUrl: string): boolean => {
  return rpcUrl.indexOf("devnet") != -1;
};

export const isTestnet = (rpcUrl: string): boolean => {
  return rpcUrl.indexOf("testnet") != -1;
};

export const checkSubmissionNetwork = (rpcUrl: string) => {
  if (isDevnet(rpcUrl) || isTestnet(rpcUrl)) {
    throw new Error("Thank you, but the Solana Mobile dApp publisher portal only supports mainnet submissions.");
  }
};

export const generateNetworkSuffix = (rpcUrl: string): string => {
  let suffix = "";

  if (isDevnet(rpcUrl)) {
    suffix = "?cluster=devnet";
  } else if (isTestnet(rpcUrl)) {
    suffix = "?cluster=testnet";
  } else {
    suffix = "?cluster=mainnet";
  }

  return suffix;
};

export const showMessage = (
  titleMessage = "",
  contentMessage = "",
  isError = false
) => {
  console.log(boxen(contentMessage, {
    title: titleMessage,
    padding: 1,
    margin: 1,
    borderStyle: 'single',
    borderColor: isError ? "redBright" : "cyan",
    textAlignment: "left",
    titleAlignment: "center"
  }));
};

const checkIconDimensions = async (iconPath: string): Promise<boolean> => {
  const size = await runImgSize(iconPath);

  return size?.width != size?.height || (size?.width ?? 0) > 512;
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
  const versionName = new RegExp(
    AaptPrefixes.verNamePrefix + AaptPrefixes.quoteRegex
  ).exec(stdout);
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
    localeArray = ["en-US"].concat(localesSrc.split("' '").slice(1));
  }

  return {
    android_package: appPackage?.[1] ?? "",
    min_sdk: parseInt(minSdk?.[1] ?? "0", 10),
    version_code: parseInt(versionCode?.[1] ?? "0", 10),
    version: versionName?.[1] ?? "0",
    permissions: permissionArray,
    locales: localeArray,
  };
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address">;
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
  const isDevnet = connection.rpcEndpoint.includes("devnet");

  const bundlrStorageDriver = isDevnet
    ? new BundlrStorageDriver(metaplex, {
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
      })
    : new BundlrStorageDriver(metaplex);

  metaplex.storage().setDriver(
    new CachedStorageDriver(bundlrStorageDriver, {
      assetManifestPath: isDevnet
        ? "./.asset-manifest-devnet.json"
        : "./.asset-manifest.json",
    })
  );
  return metaplex;
};
