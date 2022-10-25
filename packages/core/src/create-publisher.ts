import { mintNft } from "./utils";
import type { Context } from "./types";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  TransactionBuilder,
} from "@metaplex-foundation/js";
import debugModule from "debug";
import type { JsonMetadata } from "@metaplex-foundation/js";
import type { PublicKey, Signer } from "@solana/web3.js";

const debug = debugModule("PUBLISHER");

export type Publisher = {
  address: PublicKey;
  name: string;
  description: string;
  website: string;
  email: string;
};

export const createPublisherJson = (publisher: Publisher): JsonMetadata => {
  const publisherMetadata = {
    name: publisher.name,
    // TODO(jon): Handle locale resources
    description: publisher.description,
    // TODO(jon): Figure out where to get this image
    image: "",
    external_url: publisher.website,
    properties: {
      category: "dApp",
      creators: [
        {
          address: publisher.address.toBase58(),
          share: 100,
        },
      ],
    },
    extensions: {
      // TODO(jon): What is the name of this actually?
      solana_dapp_store: {
        publisher_details: {
          name: publisher.name,
          website: publisher.website,
          contact: publisher.email,
        },
      },
    },
  };

  return publisherMetadata;
};

type CreatePublisherInput = {
  mintAddress: Signer;
  // TODO(jon): Give this a better type
  publisherJson: any;
};

export const createPublisher = async (
  { mintAddress, publisherJson }: CreatePublisherInput,
  { connection, publisher }: Context
): Promise<TransactionBuilder> => {
  debug(`Minting publisher NFT`);

  // This is a little leaky
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(publisher))
    .use(
      connection.rpcEndpoint.includes("devnet")
        ? bundlrStorage({
            address: "https://devnet.bundlr.network",
          })
        : bundlrStorage()
    );

  const txBuilder = await mintNft(metaplex, publisherJson, {
    isCollection: true,
    isMutable: true,
    useNewMint: mintAddress,
  });

  return txBuilder;
};
