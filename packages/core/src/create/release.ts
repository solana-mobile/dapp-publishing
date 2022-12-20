import path from "path";
import fs from "fs";
import { createHash } from "crypto";
import mime from "mime";
import debugModule from "debug";
import type { MetaplexFile } from "@metaplex-foundation/js";
import { toMetaplexFile } from "@metaplex-foundation/js";
import { mintNft, truncateAddress } from "../utils.js";
import * as util from "util";
import { validateRelease } from "../validate/index.js";
import { imageSize } from "image-size";

import type { Keypair, PublicKey } from "@solana/web3.js";
import type {
  App,
  Context, MetaplexFileReleaseJsonMetadata,
  Publisher,
  Release,
  ReleaseJsonMetadata
} from "../types.js";

const runImgSize = util.promisify(imageSize);
const debug = debugModule("RELEASE");

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type File = ArrayElement<Release["files"]>;
type Media = ArrayElement<Release["media"]>;

const getFileMetadata = async (item: Media | File) => {
  const file = path.join(process.cwd(), item.uri);
  debug({ file });
  // TODO(jon): This stuff should be probably be in `packages/cli`
  const mediaBuffer = await fs.promises.readFile(file);
  const size = (await fs.promises.stat(file)).size;
  const hash = createHash("sha256").update(mediaBuffer).digest("hex");
  const metadata = {
    purpose: item.purpose,
    uri: toMetaplexFile(mediaBuffer, item.uri),
    mime: mime.getType(item.uri) || "",
    size,
    sha256: hash,
  };

  return metadata;
};

const getMediaMetadata = async (item: Media) => {
  const size = await runImgSize(item.uri);
  const metadata = await getFileMetadata(item);

  return {
    ...metadata,
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  };
};

export const createReleaseJson = async (
  {
    releaseDetails,
    appDetails,
    publisherDetails,
  }: { releaseDetails: Release; appDetails: App; publisherDetails: Publisher },
  publisherAddress: PublicKey
): Promise<MetaplexFileReleaseJsonMetadata> => {

  const media = [];
  debug({ media: releaseDetails.media });
  for await (const item of releaseDetails.media || []) {
    media.push(await getMediaMetadata(item));
  }

  const files = [];
  debug({ files: releaseDetails.files });
  for await (const item of releaseDetails.files) {
    files.push(await getFileMetadata(item));
  }

  const releaseMetadata: MetaplexFileReleaseJsonMetadata = {
    schema_version: "0.2.4",
    name: "Release: " + appDetails.name,
    description: `Release NFT for ${appDetails.name} version ${releaseDetails.android_details.version}`,
    image: appDetails.icon!,
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
        // @ts-expect-error
        publisher_details: {
          name: publisherDetails.name,
          website: publisherDetails.website,
          contact: publisherDetails.email,
        },
        release_details: {
          updated_on: new Date().toISOString(),
          license_url: appDetails.urls.license_url,
          copyright_url: appDetails.urls.copyright_url,
          privacy_policy_url: appDetails.urls.privacy_policy_url,
          localized_resources: {
            long_description: "1",
            new_in_version: "2",
            saga_features: "3",
            name: "4",
          },
        },
        media,
        files,
        android_details: releaseDetails.android_details,
      },
      i18n: {},
    },
  };

  for (const [locale, strings] of Object.entries(releaseDetails.catalog)) {
    // @ts-expect-error
    releaseMetadata.extensions.i18n[locale] = {
      "1": strings.long_description,
      "2": strings.new_in_version,
      "3": strings.saga_features,
      "4": strings.name,
    };
  }

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
  { publisher, metaplex }: Context
) => {
  debug(`Minting release NFT for: ${appMintAddress.toBase58()}`);

  const releaseJson = await createReleaseJson(
    { releaseDetails, appDetails, publisherDetails },
    publisher.publicKey
  );
  validateRelease(releaseJson);

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
