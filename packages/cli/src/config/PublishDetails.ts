import type {
  AndroidDetails,
  App,
  LastSubmittedVersionOnChain,
  LastUpdatedVersionOnStore,
  Publisher,
  Release,
  SolanaMobileDappPublisherPortal
} from "@solana-mobile/dapp-store-publishing-tools";
import { dump, load } from "js-yaml";
import Ajv from "ajv";
// eslint-disable-next-line require-extensions/require-extensions
import schemaJson from "../generated/config_schema.json" assert { type: "json" };
import fs from "fs";
import path from "path";
import { toMetaplexFile } from "@metaplex-foundation/js";
import { Constants, showMessage } from "../CliUtils.js";
import util from "util";
import { imageSize } from "image-size";
import { exec } from "child_process";
import getVideoDimensions from "get-video-dimensions";

const runImgSize = util.promisify(imageSize);
const runExec = util.promisify(exec);

export interface PublishDetails {
  publisher: Publisher;
  app: App;
  release: Release;
  solana_mobile_dapp_publisher_portal: SolanaMobileDappPublisherPortal;
  lastSubmittedVersionOnChain: LastSubmittedVersionOnChain
  lastUpdatedVersionOnStore: LastUpdatedVersionOnStore,
}

const AaptPrefixes = {
  quoteRegex: "'(.*?)'",
  quoteNonLazyRegex: "'(.*)'",
  packagePrefix: "package: name=",
  verCodePrefix: "versionCode=",
  verNamePrefix: "versionName=",
  sdkPrefix: "(?:minSdk|sdk)Version:",
  debuggableApkPrefix: "application-debuggable",
  localePrefix: "locales: ",
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address">;
  lastSubmittedVersionOnChain?: LastSubmittedVersionOnChain;
  lastUpdatedVersionOnStore?: LastUpdatedVersionOnStore;
};

const ajv = new Ajv({ strictTuples: false });
const validate = ajv.compile(schemaJson);

export const loadPublishDetails = async (configPath: string) => {
  const configFile = await fs.promises.readFile(configPath, "utf-8");

  const valid = validate(load(configFile) as object);

  if (!valid) {
    console.error(validate.errors);
    process.exit(1);
  }

  return load(configFile) as PublishDetails;
};

export const loadPublishDetailsWithChecks = async (
  buildToolsDir: string | null = null
): Promise<PublishDetails> => {
  const config = await loadPublishDetails(Constants.getConfigFilePath());

  // We validate that the config is going to have at least one installable asset
  const apkEntry = config.release.files.find(
    (asset: PublishDetails["release"]["files"][0]) => asset.purpose === "install"
  )!;
  const apkPath = path.join(process.cwd(), apkEntry?.uri);
  if (!fs.existsSync(apkPath)) {
    throw new Error("Invalid path to APK file.");
  }

  if (buildToolsDir) {
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

  config.release.media.forEach((item: PublishDetails["release"]["media"][0]) => {
    const mediaPath = path.join(process.cwd(), item.uri);
    if (!fs.existsSync(mediaPath)) {
      throw new Error(`File doesnt exist: ${item.uri}.`)
    }

    if (item.purpose == "screenshot" && !checkImageExtension(mediaPath)) {
      throw new Error(`Please ensure the file ${item.uri} is a jpeg, png, or webp file.`)
    }

    if (item.purpose == "video" && !checkVideoExtension(mediaPath)) {
      throw new Error(`Please ensure the file ${item.uri} is a mp4.`)
    }
  }
  );

  const screenshots = config.release.media?.filter(
    (asset: any) => asset.purpose === "screenshot"
  )

  for (const item of screenshots) {
    const mediaPath = path.join(process.cwd(), item.uri);
    if (await checkScreenshotSize(mediaPath)) {
      throw new Error(`Screenshot ${mediaPath} must be at least 1080px in width and height.`);
    }
  }

  const videos = config.release.media?.filter(
    (asset: any) => asset.purpose === "video"
  )

  for (const video of videos) {
    const mediaPath = path.join(process.cwd(), video.uri);
    if (await checkVideoSize(mediaPath)) {
      throw new Error(`Video ${mediaPath} must be at least 720px in width and height.`);
    }
  }

  if (screenshots.length + videos.length < 4) {
    throw new Error(`At least 4 screenshots or videos are required for publishing a new release. Found only ${screenshots.length + videos.length}`)
  }

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
    throw new Error(`Please check the path to your ${typeString} icon and ensure the file is a jpeg, png, or webp file.`);
  }

  if (await checkIconDimensions(path)) {
    throw new Error("Icons must be 512px by 512px.");
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

const checkVideoExtension = (uri: string): boolean => {
  const fileExt = path.extname(uri).toLowerCase();
  return (
    fileExt == ".mp4"
  );
};

/**
 * We need to pre-check some things in the localized resources before we move forward
 */
const validateLocalizableResources = (config: PublishDetails) => {
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
    .filter((desc) => !desc?.length || desc.length > 30);

  if (descsWrongLength.length > 0) {
    throw new Error("Please ensure all translations of short_description are between 0 and 30 characters");
  }
};

const checkIconDimensions = async (iconPath: string): Promise<boolean> => {
  const size = await runImgSize(iconPath);

  return size?.width != size?.height || (size?.width ?? 0) != 512;
};

const checkScreenshotSize = async (imagePath: string): Promise<boolean> => {
  const size = await runImgSize(imagePath);

  return (size?.width ?? 0) < 1080 || (size?.height ?? 0) < 1080;
}

const checkVideoSize = async (imagePath: string): Promise<boolean> => {
  const size = await getVideoDimensions(imagePath);

  return (size?.width ?? 0) < 720 || (size?.height ?? 0) < 720;
}


const getAndroidDetails = async (
  aaptDir: string,
  apkPath: string
): Promise<AndroidDetails> => {
  try {
    const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging "${apkPath}"`);

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
    const permissions = [...stdout.matchAll(/uses-permission: name='(.*)'/g)].flatMap(permission => permission[1]);
    const locales = new RegExp(
      AaptPrefixes.localePrefix + AaptPrefixes.quoteNonLazyRegex
    ).exec(stdout);
    const isDebuggable = new RegExp(
      AaptPrefixes.debuggableApkPrefix
    ).exec(stdout);

    if (isDebuggable != null) {
      throw new TypeError("Debug apks are not supported on Solana dApp store.\nSubmit a signed release apk")
    }

    let localeArray = Array.from(locales?.values() ?? []);
    if (localeArray.length == 2) {
      const localesSrc = localeArray[1];
      localeArray = ["en-US"].concat(localesSrc.split("' '").slice(1));
    }

    if (permissions.includes("android.permission.INSTALL_PACKAGES") || permissions.includes("android.permission.DELETE_PACKAGES")) {
      showMessage(
        "App requests system app install/delete permission",
        "Your app requests system install/delete permission which is managed by Solana dApp Store.\nThis app will be not approved for listing on Solana dApp Store.",
        "error"
      );
    }

    if (permissions.includes("android.permission.REQUEST_INSTALL_PACKAGES") || permissions.includes("android.permission.REQUEST_DELETE_PACKAGES")) {
      showMessage(
        "App requests install or delete permission",
        "App will be subject to additional security reviews for listing on Solana dApp Store and processing time may be beyond regular review time",
        "warning"
      );
    }

    if (permissions.includes("com.solanamobile.seedvault.ACCESS_SEED_VAULT")) {
      showMessage(
        "App requests Seed Vault permission",
        "If this is not a wallet application, your app maybe rejected from listing on Solana dApp Store.",
        "warning"
      );
    }

    if (localeArray.length >= 60) {
      showMessage(
        "The bundle apk claims supports for following locales",
        "Claim for supported locales::\n" +
        localeArray +
        "\nIf this release does not support all these locales the release may be rejected" +
        "\nSee details at https://developer.android.com/guide/topics/resources/multilingual-support#design for configuring the supported locales",
        "warning"
      );
    }

    checkAbis(apkPath);

    return {
      android_package: appPackage?.[1] ?? "",
      min_sdk: parseInt(minSdk?.[1] ?? "0", 10),
      version_code: parseInt(versionCode?.[1] ?? "0", 10),
      version: versionName?.[1] ?? "0",
      cert_fingerprint: await extractCertFingerprint(aaptDir, apkPath),
      permissions: permissions,
      locales: localeArray
    };
  } catch (e) {
    if (e instanceof TypeError) {
      throw e
    } else {
      throw new Error(`There was an error parsing your APK. Please ensure you have installed Java and provided a valid Android tools directory containing AAPT2.\n` + e);
    }
  }
};

const checkAbis = async (apkPath: string) => {
  try {
    const { stdout } = await runExec(`zipinfo -s ${apkPath} | grep \.so$`);
    const amV7libs = [...stdout.matchAll(/lib\/armeabi-v7a\/(.*)/g)].flatMap(permission => permission[1]);
    const x86libs = [...stdout.matchAll(/lib\/x86\/(.*)/g)].flatMap(permission => permission[1]);
    const x8664libs = [...stdout.matchAll(/lib\/x86_64\/(.*)/g)].flatMap(permission => permission[1]);
    if (amV7libs.length > 0 || x86libs.length > 0 || x8664libs.length > 0) {

      const messages = [
        `Solana dApp Store only supports arm64-v8a abi.`,
        `Your apk file contains following unsupported abis`,
        ... amV7libs.length > 0 ? [`\narmeabi-v7a:\n` + amV7libs] : [],
        ... x86libs.length > 0 ? [`\nx86:\n` + x86libs] : [],
        ... x8664libs.length > 0 ? [`\nx86_64:\n` + x8664libs] : [],
        `\n\nAlthough your app works fine on Saga, these library files are unused and increase the size of apk file making the download and update time longer for your app.`,
        `\n\nSee https://developer.android.com/games/optimize/64-bit#build-with-64-bit for how to optimize your app.`,
      ].join('\n')
    
      showMessage(
        `Unsupported files found in apk`,
        messages,
        `warning`
      )
    }
  } catch (e) {
    // Ignore this error.
  }
}

export const extractCertFingerprint = async (aaptDir: string, apkPath: string): Promise<string> => {
  const { stdout } = await runExec(`${aaptDir}/apksigner verify --print-certs -v "${apkPath}"`);

  const regex = /Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]+)/;
  const match = stdout.match(regex);

  if (match && match[1]) {
    return match[1];
  } else {
    throw new Error("Could not obtain cert fingerprint")
  }
}

export const writeToPublishDetails = async ({ publisher, app, release, lastSubmittedVersionOnChain, lastUpdatedVersionOnStore }: SaveToConfigArgs) => {
  const currentConfig = await loadPublishDetailsWithChecks();

  delete currentConfig.publisher.icon;
  delete currentConfig.app.icon;

  const newConfig: PublishDetails = {
    publisher: {
      ...currentConfig.publisher,
      address: publisher?.address ?? currentConfig.publisher.address
    },
    app: {
      ...currentConfig.app,
      address: app?.address ?? currentConfig.app.address
    },
    release: {
      ...currentConfig.release,
      address: release?.address ?? currentConfig.release.address
    },
    solana_mobile_dapp_publisher_portal: currentConfig.solana_mobile_dapp_publisher_portal,
    lastSubmittedVersionOnChain: lastSubmittedVersionOnChain ?? currentConfig.lastSubmittedVersionOnChain,
    lastUpdatedVersionOnStore: lastUpdatedVersionOnStore ?? currentConfig.lastUpdatedVersionOnStore
  };

  fs.writeFileSync(Constants.getConfigFilePath(), dump(newConfig, {
    lineWidth: -1
  }));
};
