import { mintNft } from "./utils";
import type { Context } from "./types";

const debug = require("debug")("PUBLISHER");

type CreatePublisherInput = {};

export const createPublisher = async (
  {}: CreatePublisherInput,
  { metaplex, publisher }: Context
) => {
  debug(`Minting publisher NFT`);

  const { nft: publisherNft } = await mintNft(
    metaplex,
    // TODO(jon): Add more interesting stuff here
    { name: "My first great publisher!" },
    {
      isCollection: true,
      isMutable: true,
    }
  );

  debug(
    `Successfully minted publisher NFT: ${publisherNft.address.toBase58()}`
  );
};
