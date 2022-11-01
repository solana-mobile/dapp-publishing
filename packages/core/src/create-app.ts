import { mintNft } from "./utils";
import type { Publisher, Context } from "./types";
import { Keypair, PublicKey, Signer } from "@solana/web3.js";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("APP");

type CreateAppInput = {
  publisherMintAddress: PublicKey;
  mintAddress: Signer;
};

// It is slightly confusing that we have the publisher as both the signer _and_ as a reference for the collection
// export const prepareAppTx = async (
export const createApp = async (
  { publisherMintAddress, mintAddress }: CreateAppInput,
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

  const txBuilder = await mintNft(
    metaplex,
    // Add more interesting stuff here
    { name: "My first great app!" },
    {
      useNewMint: mintAddress,
      collection: publisherMintAddress,
      collectionAuthority: publisher,
      isCollection: true,
      isMutable: true,
      creators: [{ address: publisher.publicKey, share: 100 }],
    }
  );

  txBuilder.append(
    metaplex.nfts().builders().verifyCreator({
      mintAddress: mintAddress.publicKey,
      creator: publisher,
    })
  );

  debug({ appNft: mintAddress.publicKey.toBase58() });

  return txBuilder;
};
