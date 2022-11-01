import {
  CreateNftInput,
  CreateNftOutput,
  Metaplex,
  TransactionBuilder,
  UploadMetadataInput,
} from "@metaplex-foundation/js";
import { Keypair, Transaction } from "@solana/web3.js";

export const mintNft = async (
  metaplex: Metaplex,
  // json: Required<UploadMetadataInput>,
  json: { name: string },
  createNftInput: Omit<CreateNftInput, "uri" | "name" | "sellerFeeBasisPoints">
): Promise<TransactionBuilder> => {
  const { uri } = await metaplex.nfts().uploadMetadata(json);

  const txBuilder = await metaplex
    .nfts()
    .builders()
    .create({
      ...createNftInput,
      uri,
      name: json.name,
      sellerFeeBasisPoints: 0,
    });

  return txBuilder;
};
