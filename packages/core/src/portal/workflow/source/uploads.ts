import type {
  PublicationCreateUploadTargetInput,
  PublicationCreateUploadTargetResult,
  PublicationFinalizeUploadInput,
  PublicationFinalizeUploadResult,
} from "../../types.js";

export type FinalizeUploadFn = (
  input: PublicationFinalizeUploadInput
) => Promise<PublicationFinalizeUploadResult>;

/**
 * Promote a staged upload to its public key and return the URL to reference.
 *
 * `createUploadTarget` hands back a presigned URL that writes to `stagingKey`,
 * not to the public key the same call reports as `publicUrl`. Nothing copies
 * the object across on its own, so until the upload is finalized `publicUrl`
 * is a 404 — and anything that captured it (an ingestion source, an NFT
 * metadata URI, a media URI inside that metadata) points at nothing.
 *
 * A portal that presigns the public key directly returns no `stagingKey`, and
 * those uploads are already final; leaving them alone keeps this working
 * against portals on either side of the change.
 */
export async function finalizeUploadedFile(
  finalizeUpload: FinalizeUploadFn | undefined,
  uploadTarget: PublicationCreateUploadTargetResult,
  input: PublicationCreateUploadTargetInput
): Promise<string> {
  if (!uploadTarget.stagingKey) {
    return uploadTarget.publicUrl;
  }

  if (!finalizeUpload) {
    throw new Error(
      "The portal staged this upload, but this client cannot finalize it. " +
        "Update @solana-mobile/dapp-store-cli to a version that supports staged uploads."
    );
  }

  const result = await finalizeUpload({
    ...input,
    stagingKey: uploadTarget.stagingKey,
  });

  return result.publicUrl || uploadTarget.publicUrl;
}
