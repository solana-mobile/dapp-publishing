import type { Connection, PublicKey } from "@solana/web3.js";
// import { createRelease } from "@solana-mobile/dapp-publishing-tools";
import { validateMetadata } from "../validate";

// We need the application NFT to add to collection
// Either the publisher needs to sign,
// or needs to delegate the collection authority of the app to the burner
// or we push it as unverified and follow-up with that afterwards

// We'll double-check the public key of the provided keypair
// If its the publisher, we can verify the collection and sign the metadata of the release NFT
// For now, probably okay to assume that the signer is the publisher

// Core should probably return the transaction so we can handle in userland
// Core should also handle schema validation of the metadata
// CLI is only responsible for coordinating files / metadata
// and submitting the transaction

type SemverString = string;

type CreateReleaseInput = {
  appNftMintAddress: PublicKey;
  version: SemverString;
  isPreview?: boolean;
};

// TODO(jon): Allow some flexibility on fee payers
// TODO(jon): Accept a `preview` flag to generate metadata and not persist anything
export const createRelease = async (
  { isPreview }: CreateReleaseInput,
  { connection }: { connection: Connection }
) => {
  // Validate the file structure and prepare arguments to be validated in `core`
  // Validate the input and finalized JSON, await for user input unless flagged
  // await validateMetadata();
  // const txBuilder = await createRelease();
  // // TODO(jon): Abstract all of this behind the utility
  // const { recentBlockHash, blockheight } = await connection.getRecentBlockHash;
  // const tx = txBuilder.toTransaction({ recentBlockHash, blockheight });
  // sendAndConfirmTransaction(tx);
};
