import { mintNft } from "./utils";
import type { App, Context, Publisher } from "./types";
import { Keypair } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("RELEASE");

type CreateReleaseInput = {
  appNft: App;
  publisherNft: Publisher;
};

export const createRelease = async (
  { appNft, publisherNft }: CreateReleaseInput,
  // We're going to assume that the publisher is the signer
  { publisher, connection }: Context
) => {
  debug(
    `Minting release NFT for: ${{
      app: appNft.address.toBase58(),
      publisher: publisherNft.address.toBase58(),
    }}`
  );

  const metaplex = new Metaplex(connection);
  const releaseMintSigner = Keypair.generate();

  const txBuilder = await mintNft(
    metaplex,
    // TODO(jon): Add more interesting stuff to this release
    { name: "My first great release!" },
    {
      useNewMint: releaseMintSigner,
      collection: appNft.address,
      collectionAuthority: publisher,
      creators: [
        { address: publisher.publicKey, share: 0 },
        // ...otherCreators
      ],
      isMutable: false,
    }
  );

  // TODO(jon): Enable a case where the signer is not the publisher
  // TODO(jon): Allow this to be unverified and to verify later
  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: releaseMintSigner.publicKey,
      creator: publisher,
    })
  );

  return txBuilder;
};
