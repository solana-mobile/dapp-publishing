import type { TransactionBuilder } from "@metaplex-foundation/js";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import debugModule from "debug";
import type { Signer } from "@solana/web3.js";

import { validatePublisher } from "../validate/index.js";
import { mintNft } from "../utils.js";
import type { Context, Publisher, PublisherJsonMetadata } from "../types.js";

const debug = debugModule("PUBLISHER");

export const createPublisherJson = (
  publisher: Publisher
): PublisherJsonMetadata => {
  const publisherMetadata = {
    schema_version: "0.2.0",
    name: publisher.name,
    // TODO(jon): Handle locale resources
    description: publisher.description["en-US"],
    // TODO(jon): Figure out where to get this image
    image: "",
    external_url: publisher.website,
    properties: {
      category: "dApp",
      creators: [
        {
          address: publisher.address,
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
  publisherDetails: Publisher;
};

export const createPublisher = async (
  { mintAddress, publisherDetails }: CreatePublisherInput,
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

  const publisherJson = createPublisherJson(publisherDetails);
  validatePublisher(publisherJson);

  const txBuilder = await mintNft(metaplex, publisherJson, {
    isCollection: true,
    isMutable: true,
    useNewMint: mintAddress,
  });

  return txBuilder;
};
