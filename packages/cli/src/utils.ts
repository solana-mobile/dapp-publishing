import fs from "fs";
import type { AndroidDetails, App, Publisher, Release, ReleaseJsonMetadata } from "@solana-mobile/dapp-store-publishing-tools";
import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
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
import ver from "semver";

import { CachedStorageDriver } from "./upload/CachedStorageDriver.js";

const runImgSize = util.promisify(imageSize);
const runExec = util.promisify(exec);

export class Constants {
  static CLI_VERSION = "0.4.0";
  static CONFIG_FILE_NAME = "config.yaml";
}

export const debug = debugModule("CLI");

export const checkForSelfUpdate = async () => {
  const notifier = updateNotifier({ pkg: cliPackage });
  const updateInfo = await notifier.fetchInfo();

  const latestVer = new ver.SemVer(updateInfo.latest);
  const currentVer = new ver.SemVer(updateInfo.current);

  if (latestVer.major > currentVer.major || latestVer.minor > currentVer.minor) {
    throw new Error("Please update to the latest version of the dApp Store CLI before proceeding.");
  }
};

export const checkMintedStatus = async (conn: Connection, pubAddr: string, appAddr: string, releaseAddr: string) => {
  const results = await conn.getMultipleAccountsInfo([
    new PublicKey(pubAddr),
    new PublicKey(appAddr),
    new PublicKey(releaseAddr),
  ]);

  const rentAccounts = results.filter((item) => !(item == undefined) && item?.lamports > 0);
  if (rentAccounts?.length != 3) {
    throw new Error("Please ensure you have minted all of your NFTs before submitting to the Solana Mobile dApp publisher portal.");
  }
};

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch (e) {
    showMessage
    (
      "KeyPair Error",
      "Something went wrong when attempting to retrieve the keypair at " + pathToKeypairFile,
      "error"
    )
  }
};

const AaptPrefixes = {
  quoteRegex: "'(.*?)'",
  quoteNonLazyRegex: "'(.*)'",
  packagePrefix: "package: name=",
  verCodePrefix: "versionCode=",
  verNamePrefix: "versionName=",
  sdkPrefix: "sdkVersion:",
  localePrefix: "locales: ",
};

export const  getConfigWithChecks = async (
  buildToolsDir: string | null = null
): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/${Constants.CONFIG_FILE_NAME}`;

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
    await checkIconCompatibility(iconPath, "Publisher");

    const iconBuffer = await fs.promises.readFile(iconPath);
    config.publisher.icon = toMetaplexFile(iconBuffer, publisherIcon);
  }

  const appIcon = config.app.media?.find(
    (asset: any) => asset.purpose === "icon"
  )?.uri;

  if (appIcon) {
    const iconPath = path.join(process.cwd(), appIcon);
    await checkIconCompatibility(iconPath, "App");

    const iconBuffer = await fs.promises.readFile(iconPath);
    config.app.icon = toMetaplexFile(iconBuffer, appIcon);
  }

  const releaseIcon = config.release.media?.find(
    (asset: any) => asset.purpose === "icon"
  )?.uri;

  if (releaseIcon) {
    const iconPath = path.join(process.cwd(), releaseIcon);
    await checkIconCompatibility(iconPath, "Release");
  }

  if (!appIcon && !releaseIcon) {
    throw new Error("Please specify at least one media entry of type icon in your configuration file");
  }

  config.release.media.forEach((item: CLIConfig["release"]["media"][0]) => {
    const imagePath = path.join(process.cwd(), item.uri);
    if (!fs.existsSync(imagePath) || !checkImageExtension(imagePath)) {
      throw new Error(`Invalid media path or file type: ${item.uri}. Please ensure the file is a jpeg, png, or webp file.`)
    }
  });

  validateLocalizableResources(config);

  const googlePkg = config.solana_mobile_dapp_publisher_portal.google_store_package;
  if (googlePkg?.length) {
    const pkgCompare = new RegExp("[a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)+").exec(googlePkg);

    if (!pkgCompare?.length) {
      throw new Error("Please provide a valid Google store package name in the Publisher Portal section of your configuration file.");
    }
  }

  return config;
};

const checkIconCompatibility = async (path: string, typeString: string) => {
  if (!fs.existsSync(path) || !checkImageExtension(path)) {
    throw new Error(`Please check the path to your ${typeString} icon and ensure the file is a jpeg, png, or webp file.`)
  }

  if (await checkIconDimensions(path)) {
    throw new Error("Icons must have square dimensions and be no greater than 512px by 512px.")
  }
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

/**
 * We need to pre-check some things in the localized resources before we move forward
 */
const validateLocalizableResources = (config: CLIConfig) => {
  if (!config.release.catalog["en-US"]) {
    throw new Error("Please ensure you have the en-US locale strings in your configuration file.");
  }

  const baselineSize = Object.keys(config.release.catalog["en-US"]).length;
  Object.keys(config.release.catalog).forEach((locale) => {
    const size = Object.keys(config.release.catalog[locale]).length;

    if (size != baselineSize) {
      throw new Error("Please ensure you have included all localized strings for all locales in your configuration file.");
    }
  });

  const descsWrongLength = Object.values(config.release.catalog)
    .map((x) => x.short_description)
    .filter((desc) => !desc?.length || desc.length > 50);

  if (descsWrongLength.length > 0) {
    throw new Error("Please ensure all translations of short_description are between 0 and 50 characters");
  }
};


export const isDevnet = (rpcUrl: string): boolean => {
  return rpcUrl.indexOf("devnet") != -1;
};

export const isTestnet = (rpcUrl: string): boolean => {
  return rpcUrl.indexOf("testnet") != -1;
};

export const checkSubmissionNetwork = (rpcUrl: string) => {
  if (isDevnet(rpcUrl) || isTestnet(rpcUrl)) {
    throw new Error("It looks like you are attempting to submit a request with a devnet or testnet RPC endpoint. Please ensure that your NFTs are minted on mainnet beta, and re-run with a mainnet beta RPC endpoint.");
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
  type: "standard" | "error" | "warning" = "standard",
): string => {
  let color = "cyan";
  if (type == "error") {
    color = "redBright";
  } else if (type == "warning") {
    color = "yellow";
  }

  const msg = boxen(contentMessage, {
    title: titleMessage,
    padding: 1,
    margin: 1,
    borderStyle: 'single',
    borderColor: color,
    textAlignment: "left",
    titleAlignment: "center",
  });

  console.log(msg);
  return msg;
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
  const permissions = [...stdout.matchAll(/uses-permission: name='(.*)'/g)];
  const locales = new RegExp(
    AaptPrefixes.localePrefix + AaptPrefixes.quoteNonLazyRegex
  ).exec(stdout);

  let localeArray = Array.from(locales?.values() ?? []);
  if (localeArray.length == 2) {
    const localesSrc = localeArray[1];
    localeArray = ["en-US"].concat(localesSrc.split("' '").slice(1));
  }

  if (localeArray.length >= 60) {
    showMessage(
      "The bundle apk claims supports for following locales",
      "Claim for supported locales::\n" + 
      localeArray + 
      "\nIf this release does not support all these locales the release may be rejected" +
      "\nSee details at https://developer.android.com/guide/topics/resources/multilingual-support#design for configuring the supported locales",
      "warning"
    )
  }

  return {
    android_package: appPackage?.[1] ?? "",
    min_sdk: parseInt(minSdk?.[1] ?? "0", 10),
    version_code: parseInt(versionCode?.[1] ?? "0", 10),
    version: versionName?.[1] ?? "0",
    permissions: permissions.flatMap(permission => permission[1]),
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
  const currentConfig = await getConfigWithChecks();

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
  fs.writeFileSync(`${process.cwd()}/${Constants.CONFIG_FILE_NAME}`, dump(newConfig));
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
