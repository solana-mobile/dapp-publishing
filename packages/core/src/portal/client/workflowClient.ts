import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

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
  PublicationSubmitToStoreInput,
  PublicationSubmitToStoreResult,
} from "../types.js";
import {
  finalizeUploadedFile,
  type PublicationWorkflowClient,
} from "../workflow.js";

import { ensureApkFileName, inferFileNameFromUrl } from "./files.js";
import {
  callCreateIngestionSessionWithRetry,
  callPortalProcedure,
  uploadBytes,
} from "./http.js";
import { asRecord } from "./records.js";
import {
  translateBackendIngestionSession,
  translateBackendPublicationSession,
} from "./translators.js";
import type { PortalClientConfig, PortalUploadTarget } from "./types.js";

type PortalBackendResult = Record<string, unknown>;

type WorkflowClientState = {
  currentPublicationSessionId?: string;
  currentReleaseId?: string;
  publicationSessionIdByReleaseId: Map<string, string>;
};

function createWorkflowClientState(): WorkflowClientState {
  return {
    publicationSessionIdByReleaseId: new Map<string, string>(),
  };
}

function rememberLinkedPublicationSession(
  state: WorkflowClientState,
  releaseId?: string | null,
  publicationSessionId?: string | null
) {
  if (releaseId && publicationSessionId) {
    state.publicationSessionIdByReleaseId.set(releaseId, publicationSessionId);
  }
}

function trackBackendIdentifiers(
  state: WorkflowClientState,
  backendResult: PortalBackendResult
) {
  if (typeof backendResult.releaseId === "string") {
    state.currentReleaseId = backendResult.releaseId;
  }
  if (typeof backendResult.publicationSessionId === "string") {
    state.currentPublicationSessionId = backendResult.publicationSessionId;
  }

  rememberLinkedPublicationSession(
    state,
    state.currentReleaseId,
    state.currentPublicationSessionId
  );
}

function trackTranslatedIngestionSession(
  state: WorkflowClientState,
  session: PublicationIngestionSession
) {
  rememberLinkedPublicationSession(
    state,
    session.releaseId,
    session.publicationSessionId
  );

  if (session.publicationSessionId) {
    state.currentPublicationSessionId = session.publicationSessionId;
  } else if (session.publicationSession) {
    state.currentPublicationSessionId = session.publicationSession.id;
  }

  if (session.releaseId) {
    state.currentReleaseId = session.releaseId;
  }
}

function readLocalSourceFileOrThrow(filePath: string): Buffer {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";

    if (code === "EPERM" || code === "EACCES") {
      throw new Error(
        `Cannot read local APK at ${filePath}. macOS denied access to this location (${code}). Move the APK out of Downloads into your workspace or another accessible folder, or grant this app Full Disk Access, then retry.`
      );
    }

    throw error;
  }
}

export function createPortalWorkflowClient(
  config: PortalClientConfig
): PublicationWorkflowClient {
  const state = createWorkflowClientState();

  const createUploadTarget = async (
    input: PublicationCreateUploadTargetInput
  ): Promise<PortalUploadTarget> => {
    return await callPortalProcedure<PortalUploadTarget>(
      config,
      "publication.createUploadTarget",
      input,
      "mutation"
    );
  };

  const finalizeUpload = async (
    input: PublicationFinalizeUploadInput
  ): Promise<PublicationFinalizeUploadResult> => {
    return await callPortalProcedure<PublicationFinalizeUploadResult>(
      config,
      "publication.finalizeUpload",
      input,
      "mutation"
    );
  };

  const translateIngestionBackendResult = (
    backendResult: PortalBackendResult
  ) => {
    const translated = translateBackendIngestionSession(
      backendResult,
      asRecord(backendResult.bundle),
      asRecord(backendResult.publicationSession)
    );

    trackTranslatedIngestionSession(state, translated);
    return translated;
  };

  return {
    fetch: config.fetch,
    async createUploadTarget(
      input: PublicationCreateUploadTargetInput
    ): Promise<PublicationCreateUploadTargetResult> {
      return await createUploadTarget(input);
    },

    async finalizeUpload(
      input: PublicationFinalizeUploadInput
    ): Promise<PublicationFinalizeUploadResult> {
      return await finalizeUpload(input);
    },

    async createIngestionSession(
      input: PublicationCreateIngestionSessionInput
    ): Promise<PublicationIngestionSession> {
      const dappId = input.dappId || config.dappId;
      const idempotencyKey = input.idempotencyKey || `${Date.now()}`;

      if (input.source.kind === "apk-file") {
        const source = (() => {
          const filePath = path.resolve(input.source.filePath);
          const fileName = ensureApkFileName(
            input.source.fileName || path.basename(filePath)
          );
          const fileBytes = readLocalSourceFileOrThrow(filePath);
          const fileHash =
            input.source.sha256 ||
            createHash("sha256").update(fileBytes).digest("hex");

          return {
            filePath,
            fileName,
            fileBytes,
            fileHash,
            fileExtension: "apk",
            contentType:
              input.source.mimeType ||
              "application/vnd.android.package-archive",
            releaseFileSize: input.source.size ?? fileBytes.byteLength,
          };
        })();

        const uploadTarget = await createUploadTarget({
          fileHash: source.fileHash,
          fileExtension: source.fileExtension,
          contentType: source.contentType,
        });

        await uploadBytes(
          uploadTarget.uploadUrl,
          source.fileBytes,
          source.contentType,
          config.fetch
        );

        const releaseFileUrl = await finalizeUploadedFile(
          finalizeUpload,
          uploadTarget,
          {
            fileHash: source.fileHash,
            fileExtension: source.fileExtension,
            contentType: source.contentType,
          }
        );

        const backendResult = await callCreateIngestionSessionWithRetry(
          config,
          {
            source: {
              kind: "portalUpload",
              releaseFileUrl,
              releaseFileName: source.fileName,
              releaseFileSize: source.releaseFileSize,
            },
            whatsNew: input.whatsNew,
            idempotencyKey,
            ...(dappId ? { dappId } : {}),
          }
        );

        trackBackendIdentifiers(state, backendResult);
        return translateIngestionBackendResult(backendResult);
      }

      const backendSource =
        input.source.kind === "portalUpload"
          ? {
              kind: "portalUpload",
              releaseFileUrl: input.source.releaseFileUrl,
              releaseFileName: input.source.releaseFileName,
              releaseFileSize: input.source.releaseFileSize,
            }
          : input.source.kind === "existingRelease"
          ? {
              kind: "existingRelease",
              sourceReleaseId: input.source.sourceReleaseId,
            }
          : {
              kind: "externalUrl",
              apkUrl:
                input.source.kind === "externalUrl"
                  ? input.source.apkUrl
                  : input.source.url,
              releaseFileName:
                input.source.kind === "externalUrl"
                  ? input.source.releaseFileName ||
                    inferFileNameFromUrl(input.source.apkUrl)
                  : input.source.fileName ||
                    inferFileNameFromUrl(input.source.url),
            };

      const backendResult = await callCreateIngestionSessionWithRetry(config, {
        source: backendSource,
        whatsNew: input.whatsNew,
        idempotencyKey,
        ...(dappId ? { dappId } : {}),
      });

      trackBackendIdentifiers(state, backendResult);
      return translateIngestionBackendResult(backendResult);
    },

    async getIngestionSession(
      input: PublicationGetIngestionSessionInput
    ): Promise<PublicationIngestionSession> {
      const resolvedSessionId =
        input.sessionId ||
        ("ingestionSessionId" in input &&
        typeof input.ingestionSessionId === "string" &&
        input.ingestionSessionId.length > 0
          ? input.ingestionSessionId
          : undefined);

      if (!resolvedSessionId) {
        throw new Error(
          "publication.getIngestionSession requires a session id"
        );
      }

      const backendResult = await callPortalProcedure<PortalBackendResult>(
        config,
        "publication.getIngestionSession",
        {
          sessionId: resolvedSessionId,
        },
        "query"
      );

      trackBackendIdentifiers(state, backendResult);
      return translateIngestionBackendResult(backendResult);
    },

    async getPublicationSession(input: PublicationGetSessionInput) {
      const backendResult = await callPortalProcedure<PortalBackendResult>(
        config,
        "publication.getPublicationSession",
        {
          publicationSessionId:
            input.publicationSessionId ||
            (input.releaseId
              ? state.publicationSessionIdByReleaseId.get(input.releaseId)
              : undefined),
          releaseId: input.releaseId,
        },
        "query"
      );

      const translated = translateBackendPublicationSession(backendResult);
      state.currentPublicationSessionId = translated.id;
      state.currentReleaseId = translated.releaseId || state.currentReleaseId;
      rememberLinkedPublicationSession(
        state,
        translated.releaseId,
        translated.id
      );
      return translated;
    },

    async cleanupRelease(
      input: PublicationCleanupReleaseInput
    ): Promise<PublicationCleanupReleaseResult> {
      return await callPortalProcedure<PublicationCleanupReleaseResult>(
        config,
        "publication.cleanupRelease",
        input,
        "mutation"
      );
    },

    async submitToStore(
      input: PublicationSubmitToStoreInput
    ): Promise<PublicationSubmitToStoreResult> {
      return await callPortalProcedure<PublicationSubmitToStoreResult>(
        config,
        "publication.submitToStore",
        {
          releaseId: input.releaseId,
          whatsNew: input.whatsNew,
          criticalUpdate: input.criticalUpdate,
          testingInstructions: input.testingInstructions,
          isResubmission: input.isResubmission,
        },
        "mutation"
      );
    },
  };
}
