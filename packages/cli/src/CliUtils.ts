import fs from "fs";
import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import debugModule from "debug";
import {
  IrysStorageDriver,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import updateNotifier from "update-notifier";
import { readFile } from 'fs/promises';
const cliPackage = JSON.parse((await readFile(new URL("./package.json", import.meta.url))).toString());
import boxen from "boxen";
import ver from "semver";
import { CachedStorageDriver } from "./upload/CachedStorageDriver.js";
import { EnvVariables } from "./config/index.js";
import { S3Client } from "@aws-sdk/client-s3";
import { awsStorage } from "@metaplex-foundation/js-plugin-aws";
import { S3StorageManager } from "./config/index.js";

export class Constants {
  static CLI_VERSION = "0.10.0";
  static CONFIG_FILE_NAME = "config.yaml";
  static DEFAULT_RPC_DEVNET = "https://api.devnet.solana.com";
  static DEFAULT_PRIORITY_FEE = 500000;

  static getConfigFilePath = () => {
    return `${process.cwd()}/${Constants.CONFIG_FILE_NAME}`;
  };
}

export const debug = debugModule("CLI");

export const checkForSelfUpdate = async () => {
  const notifier = updateNotifier({ pkg: cliPackage });
  const updateInfo = await notifier.fetchInfo();

  const latestVer = new ver.SemVer(updateInfo.latest);
  const currentVer = new ver.SemVer(updateInfo.current);

  if (
    latestVer.major > currentVer.major ||
    latestVer.minor > currentVer.minor
  ) {
    throw new Error(
      `Please update to the latest version of the dApp Store CLI before proceeding.\nCurrent version is ${currentVer.raw}\nLatest version is ${latestVer.raw}`
    );
  }
};

export const checkMintedStatus = async (
  conn: Connection,
  pubAddr: string,
  appAddr: string,
  releaseAddr: string
) => {
  for (let i = 0; i < 5; i++) {
    const results = await conn.getMultipleAccountsInfo([
      new PublicKey(pubAddr),
      new PublicKey(appAddr),
      new PublicKey(releaseAddr),
    ]);

    const isPublisherMinted = results[0] != undefined && results[0]?.lamports > 0
    const isAppMinted = results[1] != undefined && results[1]?.lamports > 0
    const isReleaseMinted = results[2] != undefined && results[2]?.lamports > 0

    if (isPublisherMinted && isAppMinted && isReleaseMinted) {
      return
    } else {
      let errorMessage = ``
      if (!isPublisherMinted) {
        errorMessage = errorMessage + `Publisher NFT fetch at address ${pubAddr} failed.\n`
      }
      if (!isAppMinted) {
        errorMessage = errorMessage + `App NFT fetch at address ${appAddr} failed.\n`
      }
      if (!isReleaseMinted) {
        errorMessage = errorMessage + `Release NFT fetch at address ${releaseAddr} failed.\n`
      }
      if (i == 4) {
        throw new Error(
          `Expected Publisher :: ${pubAddr}, App :: ${appAddr} and Release :: ${releaseAddr} to be minted before submission.\n
          but ${errorMessage}\n
          Please ensure you have minted all of your NFTs before submitting to the Solana Mobile dApp publisher portal.`
        );
      } else {
        sleep(2000)
      }
    }
  }
};

export const sleep = (ms: number):Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch (e) {
    showMessage(
      "KeyPair Error",
      "Something went wrong when attempting to retrieve the keypair at " +
      pathToKeypairFile,
      "error"
    );
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
    throw new Error(
      "It looks like you are attempting to submit a request with a devnet or testnet RPC endpoint. Please ensure that your NFTs are minted on mainnet beta, and re-run with a mainnet beta RPC endpoint."
    );
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

export const dryRunSuccessMessage = () => {
  showMessage("Dry run", "Dry run was successful", "standard")
}

export const alphaAppSubmissionMessage = () => {
  showMessage(
    "Alpha release", 
    "Alpha releases are not reviewed on dApp store and are meant for internal testing only.\n" +
    "Run the `npx dapp-store publish submit ...` command again without the `--alpha` param to publish the app",
    "warning"
  )
}

export const showNetworkWarningIfApplicable = (rpcUrl: string) => {
  if (isDevnet(rpcUrl)) {
    showMessage("Devnet Mode", "Running on Devnet", "warning")
  } else if (isTestnet(rpcUrl)) {
    showMessage("Testnet Mode", "Running on Testnet", "warning")
  }
}

export const showMessage = (
  titleMessage = "",
  contentMessage = "",
  type: "standard" | "error" | "warning" = "standard"
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
    borderStyle: "single",
    borderColor: color,
    textAlignment: "left",
    titleAlignment: "center",
  });

  console.log(msg);
  return msg;
};

export const getMetaplexInstance = (
  connection: Connection,
  keypair: Keypair,
  storageParams: string = ""
) => {
  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));
  const isDevnet = connection.rpcEndpoint.includes("devnet");

  //TODO: Use DI for this
  const s3Mgr = new S3StorageManager(new EnvVariables());
  s3Mgr.parseCmdArg(storageParams);

  if (s3Mgr.hasS3Config) {
    const awsClient = new S3Client({
      region: s3Mgr.s3Config.regionName,
      credentials: {
        accessKeyId: s3Mgr.s3Config.accessKey,
        secretAccessKey: s3Mgr.s3Config.secretKey,
      },
    });

    const bucketPlugin = awsStorage(awsClient, s3Mgr.s3Config.bucketName);
    metaplex.use(bucketPlugin);
  } else {
    const irysStorageDriver = isDevnet
      ? new IrysStorageDriver(metaplex, {
        address: "https://turbo.ardrive.dev",
        providerUrl: Constants.DEFAULT_RPC_DEVNET,
      })
      : new IrysStorageDriver(metaplex, {
        address: "https://turbo.ardrive.io",
      });

    metaplex.storage().setDriver(irysStorageDriver);
  }

  metaplex.storage().setDriver(
    new CachedStorageDriver(metaplex.storage().driver(), {
      assetManifestPath: isDevnet
        ? "./.asset-manifest-devnet.json"
        : "./.asset-manifest.json",
    })
  );

  return metaplex;
};
