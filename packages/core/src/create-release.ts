import { mintNft } from "./utils";
import type { App, Context, Publisher } from "./types";

const debug = require("debug")("RELEASE");

type CreateReleaseInput = {
  appNft: App;
  publisherNft: Publisher;
};

export const createRelease = async (
  { appNft, publisherNft }: CreateReleaseInput,
  { metaplex, publisher }: Context
) => {
  debug(
    `Minting release NFT for: ${{
      app: appNft.address.toBase58(),
      publisher: publisherNft.address.toBase58(),
    }}`
  );

  const { nft: releaseNft } = await mintNft(
    metaplex,
    // TODO(jon): Add more interesting stuff to this release
    { name: "My first great release!" },
    {
      collection: appNft.address,
      collectionAuthority: publisher,
      isMutable: false,
    }
  );

  debug(`Successfully minted release NFT: ${releaseNft.address.toBase58()}`);
};
