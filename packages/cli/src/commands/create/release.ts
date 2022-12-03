import type { App, Publisher, Release, ReleaseFile, ReleaseMedia } from "@solana-mobile/dapp-publishing-tools";
import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { toMetaplexFile } from "@metaplex-foundation/js";
import { getAndroidDetails, getConfigFile, saveToConfig } from "../../utils.js";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import mime from "mime";

type CreateReleaseCommandInput = {
  appMintAddress: string;
  version: string;
  buildToolsPath: string;
  signer: Keypair;
  url: string;
  dryRun?: boolean;
};

const createReleaseNft = async (
  {
    appMintAddress,
    releaseDetails,
    appDetails,
    publisherDetails,
    connection,
    publisher,
  }: {
    appMintAddress: string;
    releaseDetails: Release;
    appDetails: App;
    publisherDetails: Publisher;
    connection: Connection;
    publisher: Keypair;
  },
  { dryRun }: { dryRun: boolean }
) => {
  const releaseMintAddress = Keypair.generate();
  const { txBuilder } = await createRelease(
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
  }

  return { releaseMintAddress: releaseMintAddress.publicKey };
};

export const createReleaseCommand = async ({
  appMintAddress,
  version,
  buildToolsPath,
  signer,
  url,
  dryRun = false,
}: CreateReleaseCommandInput) => {
  const connection = new Connection(url);

  const { release, app, publisher } = await getConfigFile();

  if (buildToolsPath && buildToolsPath.length > 0) {
    //TODO: Currently assuming the first file is the APK; should actually filter for the "install" entry
    const apkSrc = release.files[0].path;
    const apkPath = path.join(process.cwd(), "dapp-store", "files", apkSrc);

    release.android_details = await getAndroidDetails(buildToolsPath, apkPath);
  }

  const media = [];
  for await (const item of release.media) {
    media.push(await getMediaMetadata(item));
  }

  const files = [];
  for await (const item of release.files) {
    files.push(await getFileMetadata("files", item));
  }

  release.files = files;
  release.media = media;

  console.log("------");
  console.log("Your media: " + release.media[0].sha256);
  console.log("------");

  const { releaseMintAddress } = await createReleaseNft(
    {
      appMintAddress,
      connection,
      publisher: signer,
      releaseDetails: {
        ...release,
        version,
      },
      appDetails: app,
      publisherDetails: publisher,
    },
    { dryRun }
  );

  saveToConfig({
    release: { address: releaseMintAddress.toBase58(), version },
  });
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

  //TODO: Parse image dimensions here as it was previous relying on the yaml

  return {
    ...metadata,
    width: item.width,
    height: item.height,
  };
};