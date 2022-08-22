import fs from "fs";
import { keypairIdentity, Metaplex } from "@metaplex-foundation/js";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import { nftStorage } from "@metaplex-foundation/js-plugin-nft-storage";
import env from './env'
import type { CreateNftInput, CreateNftOutput } from "@metaplex-foundation/js";

import publisherJSON from "../example/sample_release_files/nft_publisher.json";
import appJSON from "../example/sample_release_files/nft_app.json";
import releaseJSON from "../example/sample_release_files/nft_release.json";

const connection = new Connection(clusterApiUrl("devnet"), "finalized");
const metaplex = new Metaplex(connection);
const wallet = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(fs.readFileSync(env.PUBLISHER_KEYPAIR, "utf-8"))
  )
);

metaplex
  .use(keypairIdentity(wallet))
  .use(nftStorage({ token: env.NFT_STORAGE_API_KEY }));

const mintNft = async (
  json,
  createNftInput: Omit<
    CreateNftInput,
    "uri" | "name" | "sellerFeeBasisPoints"
  > = {}
): Promise<CreateNftOutput> => {
  const { uri } = await metaplex.nfts().uploadMetadata(json).run();
  // Deal with uploading APKs and all that in a hot second
  return await metaplex
    .nfts()
    .create({
      ...createNftInput,
      uri,
      name: json.name,
      sellerFeeBasisPoints: 0,
    })
    .run();
};

// Eventually, should be parameterized by the owning wallet.
// This can live on the browser so it can be signed by wallets, or we can work with multisigs too.
// We need to retain updateAuthority to associate releases to apps.
async function main() {
  // One-time, can be passed in
  const publisherNFT = await mintNft(publisherJSON, {
    isCollection: true,
    isMutable: true,
  });
  console.info(`Publisher mint: ${publisherNFT.mintAddress.toBase58()}`);

  // One-time, can be passed in
  const appNFT = await mintNft(appJSON, {
    isCollection: true,
    isMutable: true,
    collection: publisherNFT.mintAddress,
  });
  console.info(`App mint: ${appNFT.mintAddress.toBase58()}`);

  const releaseNFT = await mintNft(releaseJSON, {
    collection: appNFT.mintAddress,
    isMutable: false,
  });
  console.info(`Release mint: ${releaseNFT.mintAddress.toBase58()}`);

  // Need to verify collections
}
main();
