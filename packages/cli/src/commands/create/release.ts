import fs from "fs";
import type { App, Publisher, Release } from "@solana-mobile/dapp-publishing-tools";
import { AndroidDetails, createRelease } from "@solana-mobile/dapp-publishing-tools";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { load } from "js-yaml";
import * as util from "util";
import { exec } from "child_process";

const runExec = util.promisify(exec);

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

type CreateReleaseCommandInput = {
  appMintAddress: string;
  version: string;
  aaptDir: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

export const getReleaseDetails = async (
  version: string,
  aaptDir: string
): Promise<{ release: Release; app: App; publisher: Publisher }> => {
  const globalConfigFile = `${process.cwd()}/dapp-store/config.yaml`;
  console.info(`Pulling app and publisher details from ${globalConfigFile}`);

  const { app, publisher } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(globalConfigFile, "utf-8")
  ) as { app: App; publisher: Publisher };

  const configFile = `${process.cwd()}/dapp-store/releases/${version}/release.yaml`;
  console.info(`Pulling release details from ${configFile}`);

  const { release } = load(
    // TODO(jon): Parameterize this
    fs.readFileSync(configFile, "utf-8")
  ) as { release: Release };

  const apkPath = release.files[0].uri;
  app.android_details = await getAndroidDetails(aaptDir, apkPath);

  console.log("::::: " + app.android_details.android_package);
  console.log("::::: " + app.android_details.min_sdk);
  console.log("::::: " + app.android_details.version_code);
  console.log("::::: " + app.android_details.permissions);
  console.log("::::: " + app.android_details.locales);

  return { release, app, publisher };
};

const getAndroidDetails = async (
  aaptDir: string,
  apkPath: string
): Promise<AndroidDetails> => {
  const prefixes = new AaptPrefixes();

  const { stdout } = await runExec(`${aaptDir}/aapt2 dump badging ${apkPath}`);

  const appPackage = new RegExp(prefixes.packagePrefix + prefixes.quoteRegex).exec(stdout);
  const versionCode = new RegExp(prefixes.verCodePrefix + prefixes.quoteRegex).exec(stdout);
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

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  appDetails,
  publisherDetails,
  connection,
  publisher,
  dryRun,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  appDetails: App;
  publisherDetails: Publisher;
  connection: Connection;
  publisher: Keypair;
  dryRun: boolean;
}) => {
  const releaseMintAddress = Keypair.generate();
  const { txBuilder, releaseJson } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
    },
    { connection, publisher }
  );

  const blockhash = await connection.getLatestBlockhash();
  const tx = txBuilder.toTransaction(blockhash);
  tx.sign(releaseMintAddress, publisher);

  if (!dryRun) {
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      publisher,
      releaseMintAddress,
    ]);
    console.info({
      txSig,
      releaseMintAddress: releaseMintAddress.publicKey.toBase58(),
    });

    return { releaseMintAddress };
  }
};

export const createReleaseCommand = async ({
  appMintAddress,
  version,
  aaptDir,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getReleaseDetails(version, aaptDir);

  await createReleaseNft({
    appMintAddress,
    connection,
    publisher: signer,
    releaseDetails: release,
    appDetails: app,
    publisherDetails: publisher,
    dryRun,
  });
};
