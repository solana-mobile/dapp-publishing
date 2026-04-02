import type {
  PublicationAttestationClient,
  PublicationBundle,
  PublicationCleanupReleaseInput,
  PublicationCleanupReleaseResult,
  PublicationCreateIngestionSessionInput,
  PublicationCreateUploadTargetInput,
  PublicationCreateUploadTargetResult,
  PublicationGetBundleInput,
  PublicationGetIngestionSessionInput,
  PublicationGetSessionInput,
  PublicationIngestionSession,
  PublicationMarkReleaseCollectionAsVerifiedResult,
  PublicationPreparedReleaseTransaction,
  PublicationPreparedVerifyCollectionTransaction,
  PublicationSaveReleaseNftDataInput,
  PublicationSaveReleaseNftDataResult,
  PublicationSession,
  PublicationSigner,
  PublicationSource,
  PublicationSubmitSignedTransactionResult,
  PublicationSubmitToStoreInput,
  PublicationSubmitToStoreResult,
  PublicationWorkflowLogger,
} from "../types.js";

export type PublicationWorkflowClient = {
  createUploadTarget?(
    input: PublicationCreateUploadTargetInput
  ): Promise<PublicationCreateUploadTargetResult>;
  createIngestionSession(
    input: PublicationCreateIngestionSessionInput
  ): Promise<PublicationIngestionSession>;
  getIngestionSession(
    input: PublicationGetIngestionSessionInput
  ): Promise<PublicationIngestionSession>;
  getPublicationBundle(
    input: PublicationGetBundleInput
  ): Promise<PublicationBundle>;
  getPublicationSession(
    input: PublicationGetSessionInput
  ): Promise<PublicationSession>;
  prepareReleaseNftTransaction(
    input: PublicationWorkflowPrepareReleaseTransactionInput
  ): Promise<PublicationPreparedReleaseTransaction>;
  submitSignedTransaction(input: {
    signedTransaction: string;
    publicationSessionId?: string;
  }): Promise<PublicationSubmitSignedTransactionResult>;
  saveReleaseNftData(
    input: PublicationSaveReleaseNftDataInput
  ): Promise<PublicationSaveReleaseNftDataResult>;
  prepareVerifyCollectionTransaction(
    input: PublicationWorkflowPrepareVerifyTransactionInput
  ): Promise<PublicationPreparedVerifyCollectionTransaction>;
  markReleaseCollectionAsVerified(input: {
    releaseId: string;
  }): Promise<PublicationMarkReleaseCollectionAsVerifiedResult>;
  cleanupRelease?(
    input: PublicationCleanupReleaseInput
  ): Promise<PublicationCleanupReleaseResult>;
  submitToStore(
    input: PublicationSubmitToStoreInput
  ): Promise<PublicationSubmitToStoreResult>;
};

export type PublicationWorkflowPrepareReleaseTransactionInput = {
  releaseId: string;
  releaseName: string;
  releaseMetadataUri: string;
  appMintAddress: string;
  publisherAddress: string;
  payerAddress: string;
};

export type PublicationWorkflowPrepareVerifyTransactionInput = {
  dappId: string;
  nftMintAddress: string;
  collectionMintAddress: string;
  collectionAuthority: string;
  payerAddress: string;
};

export type PublicationWorkflowOptions = {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  logger?: PublicationWorkflowLogger;
};

export type PublicationWorkflowInput = {
  dappId?: string;
  source: PublicationSource;
  whatsNew: string;
  idempotencyKey?: string;
  signer: PublicationSigner;
  attestationClient: PublicationAttestationClient;
};

export type PublicationResumeInput = {
  publicationSessionId?: string;
  releaseId?: string;
  signer: PublicationSigner;
  attestationClient: PublicationAttestationClient;
};

export type PublicationWorkflowPollOptions = Required<
  Pick<PublicationWorkflowOptions, "pollIntervalMs" | "maxPollAttempts">
>;
