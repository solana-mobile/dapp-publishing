import type {
  CreateNftInput,
  CreateNftOutput,
  Metaplex,
  UploadMetadataInput,
} from "@metaplex-foundation/js";

export const mintNft = async (
  metaplex: Metaplex,
  // json: Required<UploadMetadataInput>,
  json: { name: string },
  createNftInput: Omit<CreateNftInput, "uri" | "name" | "sellerFeeBasisPoints">
): Promise<CreateNftOutput> => {
  const { uri } = await metaplex.nfts().uploadMetadata(json);

  return await metaplex.nfts().create({
    ...createNftInput,
    uri,
    name: json.name,
    sellerFeeBasisPoints: 0,
  });
};
