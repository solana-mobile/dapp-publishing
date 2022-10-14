import { mintNft } from "./utils";
import type { Publisher, Context } from "./types";

const debug = require("debug")("APP");

type CreateAppInput = {
  publisherNft: Publisher;
};

// It is slightly confusing that we have the publisher as both the signer _and_ as a reference for the collection
export const createApp = async (
  { publisherNft }: CreateAppInput,
  { metaplex, publisher }: Context
) => {
  debug(`Minting app NFT for publisher: ${publisherNft.address.toBase58()}`);

  const { nft } = await mintNft(
    metaplex,
    // Add more interesting stuff here
    { name: "My first great app!" },
    {
      isCollection: true,
      isMutable: true,
      collection: publisherNft.address,
      collectionAuthority: publisher,
    }
  );

  debug(`Successfully minted app NFT: ${nft.address.toBase58()}`);
};
