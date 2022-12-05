import type { AndroidDetails, Release, ReleaseFile, ReleaseMedia } from "@solana-mobile/dapp-publishing-tools";
import { toMetaplexFile } from "@metaplex-foundation/js";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import mime from "mime";
import * as util from "util";
import { exec } from "child_process";
import { imageSize } from "image-size";

const runExec = util.promisify(exec);
const runImgSize = util.promisify(imageSize);

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

/**
 *
 * @param release
 * @param buildToolsPath
 */
export const parseAndValidateReleaseAssets = async (
  release: Release,
  buildToolsPath: string
) => {
  if (buildToolsPath && buildToolsPath.length > 0) {
    //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry
    const apkSrc = release.files[0].path;
    const apkPath = path.join(process.cwd(), "dapp-store", "files", apkSrc);

    release.android_details = await getAndroidDetails(buildToolsPath, apkPath);
  }

  let media = await Promise.all(release.media.map(async (item) => {
    return await getMediaMetadata(item);
  }));

  if (media.length > 12) {
    media = media.slice(0, 11); // Enforcing constraint for no more than 12 media items
  }

  const files = await Promise.all(release.files.map(async (item) => {
    return await getFileMetadata("files", item)
  }));

  release.files = files;
  release.media = media;
}

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

  return {
    android_package: appPackage?.[1] ?? "",
    min_sdk: parseInt(minSdk?.[1] ?? "0", 10),
    version_code: parseInt(versionCode?.[1] ?? "0", 10),
    permissions: permissionArray,
    locales: localeArray,
  };
};

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type File = ArrayElement<Release["files"]>;

const getFileMetadata = async (type: "media" | "files", item: ReleaseFile | File): Promise<ReleaseFile> => {
  const file = path.join(process.cwd(), "dapp-store", type, item.path);

  const mediaBuffer = await fs.promises.readFile(file);
  const size = (await fs.promises.stat(file)).size;
  const hash = createHash("sha256").update(mediaBuffer).digest("base64");

  const metadata: ReleaseFile = {
    purpose: item.purpose,
    uri: toMetaplexFile(mediaBuffer, item.path),
    mime: mime.getType(item.path) || "",
    size,
    sha256: hash,
    path: "",
  };

  return metadata;
};

const getMediaMetadata = async (item: ReleaseMedia): Promise<ReleaseMedia> => {
  const metadata = await getFileMetadata("media", item);

  const imgFile = path.join(process.cwd(), "dapp-store", "media", item.path);

  //TODO: Parse image dimensions here as it was previous relying on the yaml

  const dimensions = await runImgSize(imgFile);

  console.log(`\n\n Your dimensions: ${dimensions?.width}, ${dimensions?.height} \n\n`);
  throw new Error(":: Execution break ::");

  return {
    ...metadata,
    width: item.width,
    height: item.height,
  };
};