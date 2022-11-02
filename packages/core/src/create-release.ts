import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import mime from "mime";
import type { Keypair, PublicKey } from "@solana/web3.js";
import debugModule from "debug";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { mintNft, truncateAddress } from "./utils.js";
import { validateRelease } from "./validate/index.js";

import type {
  App,
  Context,
  Publisher,
  Release,
  ReleaseJsonMetadata,
} from "./types.js";

const debug = debugModule("RELEASE");

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type DappFile = ArrayElement<Release["media"]>;

const getFileMetadata = async (item: DappFile, version: string) => {
  const file = path.join(
    process.cwd(),
    "dapp-store",
    "releases",
    version,
    item.uri
  );
  debug({ file });
  const mediaBuffer = await fs.promises.readFile(file);
  const size = (await fs.promises.stat(file)).size;
  const hash = createHash("sha256").update(mediaBuffer).digest("base64");
  return {
    purpose: item.purpose,
    uri: toMetaplexFile(mediaBuffer, item.uri),
    mime: mime.getType(item.uri) || "",
    size,
    sha256: hash,
  };
};

export const createReleaseJson = async (
  {
    releaseDetails,
    appDetails,
    publisherDetails,
  }: { releaseDetails: Release; appDetails: App; publisherDetails: Publisher },
  publisherAddress: PublicKey
): Promise<ReleaseJsonMetadata> => {
  const truncatedAppMintAddress = truncateAddress(appDetails.address);

  const releaseName = `${truncatedAppMintAddress} ${releaseDetails.version}`;

  const media = [];
  for await (const item of releaseDetails.media) {
    media.push(await getFileMetadata(item, releaseDetails.version));
  }

  const files = [];
  debug({ files: releaseDetails.files });
  for await (const item of releaseDetails.files) {
    files.push(await getFileMetadata(item, releaseDetails.version));
  }

  const releaseMetadata = {
    name: releaseName,
    description: releaseDetails.localized_resources["en-US"].new_in_version,
    // TODO(jon): Figure out where to get this image
    image: "",
    external_url: appDetails.urls.website,
    properties: {
      category: "dApp",
      creators: [
        {
          address: publisherAddress.toBase58(),
          share: 100,
        },
      ],
    },
    extensions: {
      solana_dapp_store: {
        publisher_details: {
          name: publisherDetails.name,
          website: publisherDetails.website,
          contact: publisherDetails.email,
        },
        release_details: {
          name: releaseName,
          version: releaseDetails.version,
          updated_on: Math.floor(Date.now() / 1000),
          license_url: appDetails.urls.license_url,
          copyright_url: appDetails.urls.copyright_url,
          privacy_policy_url: appDetails.urls.privacy_policy_url,
          age_rating: appDetails.age_rating,
          localized_resources: {
            short_description: 1,
            long_description: 2,
            new_in_version: 3,
          },
        },
        media,
        files,
        android_details: appDetails.android_details,
      },
      i18n: {
        "en-US": {
          "1": releaseDetails.localized_resources["en-US"].short_description,
          "2": releaseDetails.localized_resources["en-US"].long_description,
          "3": releaseDetails.localized_resources["en-US"].new_in_version,
        },
      },
    },
  };

  return releaseMetadata;
};

type CreateReleaseInput = {
  releaseMintAddress: Keypair;
  appMintAddress: PublicKey;
  releaseDetails: Release;
  publisherDetails: Publisher;
  appDetails: App;
};

export const createRelease = async (
  {
    appMintAddress,
    releaseMintAddress,
    releaseDetails,
    appDetails,
    publisherDetails,
  }: CreateReleaseInput,
  // We're going to assume that the publisher is the signer
  { publisher, connection }: Context
) => {
  debug(`Minting release NFT for: ${appMintAddress.toBase58()}`);

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(publisher))
    .use(
      connection.rpcEndpoint.includes("devnet")
        ? bundlrStorage({
            address: "https://devnet.bundlr.network",
          })
        : bundlrStorage()
    );

  const releaseJson = await createReleaseJson(
    { releaseDetails, appDetails, publisherDetails },
    publisher.publicKey
  );
  validateRelease(releaseJson);

  // TODO(jon): This should respect the --dry-run flag
  const txBuilder = await mintNft(metaplex, releaseJson, {
    useNewMint: releaseMintAddress,
    collection: appMintAddress,
    collectionAuthority: publisher,
    creators: [{ address: publisher.publicKey, share: 100 }],
    isMutable: false,
  });

  // TODO(jon): Enable a case where the signer is not the publisher
  // TODO(jon): Allow this to be unverified and to verify later
  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: releaseMintAddress.publicKey,
      creator: publisher,
    })
  );

  return { releaseJson, txBuilder };
};
