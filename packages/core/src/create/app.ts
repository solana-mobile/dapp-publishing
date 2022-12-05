import { mintNft } from "../utils.js";
import type { App, AppJsonMetadata, Context } from "../types.js";
import type { PublicKey, Signer } from "@solana/web3.js";
import { bundlrStorage, keypairIdentity, Metaplex } from "@metaplex-foundation/js";
import debugModule from "debug";
import { validateApp } from "../validate/index.js";

const debug = debugModule("APP");

export const createAppJson = (
  app: App,
  publisherAddress: PublicKey
): AppJsonMetadata => {
  const appMetadata = {
    schema_version: "0.2.0",
    name: app.name,
    // TODO(Andrew): Determine where description comes from
    description: "",
    // TODO(jon): Figure out where to get this image
    image: "",
    external_url: app.urls.website,
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
        android_package: app.androidPackage,
      },
    },
  };

  return appMetadata;
};

type CreateAppInput = {
  publisherMintAddress: PublicKey;
  mintAddress: Signer;
  appDetails: App;
};

export const createApp = async (
  { publisherMintAddress, mintAddress, appDetails }: CreateAppInput,
  { connection, publisher }: Context
) => {
  debug(`Minting app NFT for publisher: ${publisherMintAddress.toBase58()}`);

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(publisher))
    .use(
      connection.rpcEndpoint.includes("devnet")
        ? bundlrStorage({
            address: "https://devnet.bundlr.network",
          })
        : bundlrStorage()
    );

  const appJson = createAppJson(appDetails, publisher.publicKey);
  validateApp(appJson);

  const txBuilder = await mintNft(metaplex, appJson, {
    useNewMint: mintAddress,
    collection: publisherMintAddress,
    collectionAuthority: publisher,
    isCollection: true,
    isMutable: true,
    creators: [{ address: publisher.publicKey, share: 100 }],
  });

  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: mintAddress.publicKey,
      creator: publisher,
    })
  );

  debug({ appNft: mintAddress.publicKey.toBase58() });

  return txBuilder;
};
