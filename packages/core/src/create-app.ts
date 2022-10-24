import { mintNft } from "./utils";
import type { Publisher, Context } from "./types";
import { Keypair } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("APP");

type CreateAppInput = {
  publisherNft: Publisher;
};

// It is slightly confusing that we have the publisher as both the signer _and_ as a reference for the collection
// export const prepareAppTx = async (
export const createApp = async (
  { publisherNft }: CreateAppInput,
  { connection, publisher }: Context
) => {
  debug(`Minting app NFT for publisher: ${publisherNft.address.toBase58()}`);

  const metaplex = new Metaplex(connection);
  const appMintSigner = Keypair.generate();

  const txBuilder = await mintNft(
    metaplex,
    // Add more interesting stuff here
    { name: "My first great app!" },
    {
      useNewMint: appMintSigner,
      collection: publisherNft.address,
      collectionAuthority: publisher,
      isCollection: true,
      isMutable: true,
    }
  );

  // TODO(jon): Enable a case where the signer is not the publisher
  // TODO(jon): Allow this to be unverified and to verify later
  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: appMintSigner.publicKey,
      creator: publisher,
    })
  );

  debug({ appNft: appMintSigner.publicKey.toBase58() });

  return txBuilder;
};
