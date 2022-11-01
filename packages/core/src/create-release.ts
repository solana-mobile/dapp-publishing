import { mintNft } from "./utils";
import type { Context, Release, ReleaseJsonMetadata } from "./types";
import { Keypair, PublicKey } from "@solana/web3.js";
import debugModule from "debug";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import { validateRelease } from "./validate";

const debug = debugModule("RELEASE");

export const createReleaseJson = (
  release: Release,
  publisherAddress: PublicKey
): ReleaseJsonMetadata => {
  const releaseMetadata = {
    // TODO(jon): Auto-generate this release name
    name: "",
    // TODO(jon): Pull this from release notes
    description: "",
    // TODO(jon): Figure out where to get this image
    image: "",
    // TODO(jon): Retrieve this from the application information
    external_url: "",
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
      // TODO(jon): What is the name of this actually?
      solana_dapp_store: {
        publisher_details: {
          // TODO(jon): Retrieve this from the publisher
          name: "Solana Mobile",
          website: "https://solanamobile.com/",
          contact: "contact@solanamobile.com",
        },
        release_details: {
          name: "Cute Kittens: cute kittens on the go",
          version: "0.5.0",
          updated_on: "1660594142",
          license_url: "https://solanamobile.com/tos",
          copyright_url: "https://solanamobile.com/tos",
          privacy_policy_url: "https://solanamobile.com/privacy-policy",
          age_rating: "3+",
          localized_resources: {
            short_description: 1,
            long_description: 2,
            new_in_version: 3,
          },
        },
        media: [
          {
            mime: "image/png",
            purpose: "screenshot",
            uri: "app_screenshot.png",
            sha256:
              "135ebc451cd93e15e6f5c80a41099f8bb3c5f1762742676300badf8520b32a56",
          },
        ],
        files: [
          {
            mime: "application/octet-stream",
            purpose: "install",
            uri: "app-debug.apk",
            size: "5976883",
            sha256:
              "b4c6a3eca0fe9d7d593f487f534642778a9a521fe301113a6550ea3980b569b9",
          },
        ],
        android_details: {
          android_package: "com.solanamobile.cutekittens",
          minSdk: 24,
          permissions: ["android.permission.INTERNET"],
          languages: ["en-US"],
        },
      },
      i18n: {
        "en-US": {
          "1": "A cute kitten pic wherever you go!",
          "2": "Everyone knows the internet was made for cats, and now with CuteKittens you can have a cute kitten delivered right in front of your eyeballs whenever you want!",
          "3": "First release!",
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
};

export const createRelease = async (
  { appMintAddress, releaseMintAddress, releaseDetails }: CreateReleaseInput,
  // We're going to assume that the publisher is the signer
  { publisher, connection }: Context
) => {
  debug(
    `Minting release NFT for: ${{
      app: appMintAddress.toBase58(),
    }}`
  );

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(publisher))
    .use(
      connection.rpcEndpoint.includes("devnet")
        ? bundlrStorage({
            address: "https://devnet.bundlr.network",
          })
        : bundlrStorage()
    );

  const releaseJson = createReleaseJson(releaseDetails, publisher.publicKey);
  validateRelease(releaseJson);

  const txBuilder = await mintNft(
    metaplex,
    // TODO(jon): Add more interesting stuff to this release
    { name: "My first great release!" },
    {
      useNewMint: releaseMintAddress,
      collection: appMintAddress,
      collectionAuthority: publisher,
      creators: [{ address: publisher.publicKey, share: 100 }],
      isMutable: false,
    }
  );

  // TODO(jon): Enable a case where the signer is not the publisher
  // TODO(jon): Allow this to be unverified and to verify later
  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: releaseMintAddress.publicKey,
      creator: publisher,
    })
  );

  return txBuilder;
};
