import { mintNft } from "./utils";
import type { Context } from "./types";
import { Keypair, PublicKey } from "@solana/web3.js";
import debugModule from "debug";
import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";

const debug = debugModule("RELEASE");

type CreateReleaseInput = {
  releaseMintAddress: Keypair;
  appMintAddress: PublicKey;
};

export const createRelease = async (
  { appMintAddress, releaseMintAddress }: CreateReleaseInput,
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
