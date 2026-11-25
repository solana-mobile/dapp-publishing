import type {
  PublicationCleanupReleaseInput,
  PublicationCleanupReleaseResult,
  PublicationCreateIngestionSessionInput,
  PublicationCreateUploadTargetInput,
  PublicationCreateUploadTargetResult,
  PublicationFinalizeUploadInput,
  PublicationFinalizeUploadResult,
  PublicationGetIngestionSessionInput,
  PublicationGetSessionInput,
  PublicationIngestionSession,
  PublicationSession,
  PublicationSource,
  PublicationSubmitToStoreInput,
  PublicationSubmitToStoreResult,
  PublicationWorkflowLogger,
} from "../types.js";

/**
 * Portal operations the publication workflow calls, in order: upload the APK,
 * open an ingestion session, poll it until the release is processed, then
 * submit the release to the store.
 */
export type PublicationWorkflowClient = {
  // Used for presigned-URL uploads; defaults to global fetch.
  fetch?: typeof fetch;
  createUploadTarget?(
    input: PublicationCreateUploadTargetInput
  ): Promise<PublicationCreateUploadTargetResult>;
  finalizeUpload?(
    input: PublicationFinalizeUploadInput
  ): Promise<PublicationFinalizeUploadResult>;
  createIngestionSession(
    input: PublicationCreateIngestionSessionInput
  ): Promise<PublicationIngestionSession>;
  getIngestionSession(
    input: PublicationGetIngestionSessionInput
  ): Promise<PublicationIngestionSession>;
  getPublicationSession(
    input: PublicationGetSessionInput
  ): Promise<PublicationSession>;
  cleanupRelease?(
    input: PublicationCleanupReleaseInput
  ): Promise<PublicationCleanupReleaseResult>;
  submitToStore(
    input: PublicationSubmitToStoreInput
  ): Promise<PublicationSubmitToStoreResult>;
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
};

export type PublicationResumeInput = {
  publicationSessionId?: string;
  releaseId?: string;
};

export type PublicationWorkflowPollOptions = Required<
  Pick<PublicationWorkflowOptions, "pollIntervalMs" | "maxPollAttempts">
>;
