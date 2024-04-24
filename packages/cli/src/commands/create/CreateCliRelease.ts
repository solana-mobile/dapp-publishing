import type {
  App,
  Publisher,
  Release,
} from "@solana-mobile/dapp-store-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-store-publishing-tools";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import { createHash } from "crypto";
import {
  Constants,
  getMetaplexInstance,
  showMessage
} from "../../CliUtils.js";
import { PublishDetails, loadPublishDetailsWithChecks, writeToPublishDetails } from "../../config/PublishDetails.js";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  buildToolsPath: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
  storageParams: string;
  priorityFeeLamports: number;
};

const createReleaseNft = async ({
  appMintAddress,
  releaseDetails,
  appDetails,
  publisherDetails,
  connection,
  publisher,
  storageParams,
  priorityFeeLamports,
}: {
  appMintAddress: string;
  releaseDetails: Release;
  appDetails: App;
  publisherDetails: Publisher;
  connection: Connection;
  publisher: Keypair;
  storageParams: string;
  priorityFeeLamports: number;
}) => {
  console.info(`Creating Release NFT`);

  const releaseMintAddress = Keypair.generate();

  const metaplex = getMetaplexInstance(connection, publisher, storageParams);

  const { txBuilder } = await createRelease(
    {
      appMintAddress: new PublicKey(appMintAddress),
      releaseMintAddress,
      releaseDetails,
      appDetails,
      publisherDetails,
      priorityFeeLamports
    },
    { metaplex, publisher }
  );

  console.info(`Release NFT data upload complete\nSigning transaction now`);
  const maxTries = 8;
  for (let i = 1; i <= maxTries; i++) {
    try {
      const blockhash = await connection.getLatestBlockhashAndContext();
      const tx = txBuilder.toTransaction(blockhash.value);
      tx.sign(releaseMintAddress, publisher);
      const txSig = await sendAndConfirmTransaction(connection, tx, [
        publisher,
        releaseMintAddress,
      ], {
        minContextSlot: blockhash.context.slot,
      });
      return { releaseAddress: releaseMintAddress.publicKey.toBase58(), transactionSignature: txSig };
    } catch (e) {
      const errorMsg = (e as Error | null)?.message ?? "";
      if (i == maxTries) {
        showMessage("Transaction Failure", errorMsg, "error");
        process.exit(-1)
      } else {
        const retryMsg = errorMsg + "\nWill Retry minting release NFT"
        showMessage("Transaction Failure", retryMsg, "standard");
      }
    }
  }
  throw new Error("Unable to mint release NFT");
};

export const createReleaseCommand = async ({
  appMintAddress,
  buildToolsPath,
  signer,
  url,
  dryRun = false,
  storageParams,
  priorityFeeLamports = Constants.DEFAULT_PRIORITY_FEE,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const config = await loadPublishDetailsWithChecks(buildToolsPath);

  const apkEntry = config.release.files.find(
    (asset: PublishDetails["release"]["files"][0]) => asset.purpose === "install"
  )!;
  const mediaBuffer = await fs.promises.readFile(apkEntry.uri);
  const hash = createHash("sha256").update(mediaBuffer).digest("base64");

  if (config.lastSubmittedVersionOnChain != null && hash === config.lastSubmittedVersionOnChain.apk_hash) {
    throw new Error(`The last created release used the same apk file.`);
  }

  if (config.lastSubmittedVersionOnChain != null && config.release.android_details.version_code <= config.lastSubmittedVersionOnChain.version_code) {
    throw new Error(`Each release NFT should have higher version code than previous minted release NFT.\nLast released version code is ${config.lastSubmittedVersionOnChain.version_code}.\nCurrent version code from apk file is ${config.release.android_details.version_code}`);
  }

  if (config.app.android_package != config.release.android_details.android_package) {
    throw new Error("App package name and release package name do not match.\nApp release specifies " + config.app.android_package + " while release specifies " + config.release.android_details.android_package)
  }

  if (!dryRun) {
    const { releaseAddress, transactionSignature } = await createReleaseNft({
      appMintAddress: config.app.address ?? appMintAddress,
      connection,
      publisher: signer,
      releaseDetails: {
        ...config.release,
      },
      appDetails: config.app,
      publisherDetails: config.publisher,
      storageParams: storageParams,
      priorityFeeLamports: priorityFeeLamports,
    });

    await writeToPublishDetails(
      {
        release: { address: releaseAddress },
        lastSubmittedVersionOnChain: {
          address: releaseAddress,
          version_code: config.release.android_details.version_code,
          apk_hash: hash,
        }
      });

    return { releaseAddress, transactionSignature };
  }
};
