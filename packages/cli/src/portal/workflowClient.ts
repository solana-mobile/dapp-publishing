import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
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
  PublicationPreparedReleaseTransaction,
  PublicationPreparedVerifyCollectionTransaction,
  PublicationPrepareReleaseNftTransactionInput,
  PublicationPrepareVerifyCollectionTransactionInput,
  PublicationSaveReleaseNftDataInput,
  PublicationSaveReleaseNftDataResult,
  PublicationSubmitSignedTransactionResult,
  PublicationSubmitToStoreInput,
  PublicationSubmitToStoreResult,
  PublicationWorkflowClient,
} from '@solana-mobile/dapp-store-publishing-tools';

import {
  ensureApkFileName,
  fromBase64,
  inferFileNameFromUrl,
  toBase64,
} from './files.js';
import {
  callCreateIngestionSessionWithRetry,
  callPortalProcedure,
  uploadBytes,
} from './http.js';
import { asRecord, isRecord } from './records.js';
import {
  buildReleaseMetadataDocument,
  inferPublicationSourceKind,
  mapBackendBundleToPublicationBundle,
  translateBackendIngestionSession,
  translateBackendPublicationSession,
} from './translators.js';
import type { PortalClientConfig, PortalUploadTarget } from './types.js';

type PortalBackendResult = Record<string, unknown>;

type WorkflowClientState = {
  currentPublicationSessionId?: string;
  currentReleaseId?: string;
  metadataUriByReleaseId: Map<string, string>;
  publicationSessionIdByReleaseId: Map<string, string>;
};

function createWorkflowClientState(): WorkflowClientState {
  return {
    metadataUriByReleaseId: new Map<string, string>(),
    publicationSessionIdByReleaseId: new Map<string, string>(),
  };
}

function rememberLinkedPublicationSession(
  state: WorkflowClientState,
  releaseId?: string | null,
  publicationSessionId?: string | null,
) {
  if (releaseId && publicationSessionId) {
    state.publicationSessionIdByReleaseId.set(releaseId, publicationSessionId);
  }
}

function trackBackendIdentifiers(
  state: WorkflowClientState,
  backendResult: PortalBackendResult,
) {
  if (typeof backendResult.releaseId === 'string') {
    state.currentReleaseId = backendResult.releaseId;
  }
  if (typeof backendResult.publicationSessionId === 'string') {
    state.currentPublicationSessionId = backendResult.publicationSessionId;
  }

  rememberLinkedPublicationSession(
    state,
    state.currentReleaseId,
    state.currentPublicationSessionId,
  );
}

function trackTranslatedIngestionSession(
  state: WorkflowClientState,
  session: PublicationIngestionSession,
) {
  rememberLinkedPublicationSession(
    state,
    session.releaseId,
    session.publicationSessionId,
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

export function createPortalWorkflowClient(
  config: PortalClientConfig,
): PublicationWorkflowClient {
  const state = createWorkflowClientState();

  const createUploadTarget = async (
    input: PublicationCreateUploadTargetInput,
  ): Promise<PortalUploadTarget> => {
    return await callPortalProcedure<PortalUploadTarget>(
      config,
      'publication.createUploadTarget',
      input,
      'mutation',
    );
  };

  const translateIngestionBackendResult = (
    backendResult: PortalBackendResult,
  ) => {
    const translated = translateBackendIngestionSession(
      backendResult,
      asRecord(backendResult.bundle),
      asRecord(backendResult.publicationSession),
    );

    trackTranslatedIngestionSession(state, translated);
    return translated;
  };

  const uploadReleaseMetadata = async (bundle: PublicationBundle) => {
    const releaseId = bundle.releaseId;
    const cached = state.metadataUriByReleaseId.get(releaseId);
    if (cached) {
      return cached;
    }

    if (
      typeof bundle.release.releaseMetadataUri === 'string' &&
      bundle.release.releaseMetadataUri.length > 0
    ) {
      state.metadataUriByReleaseId.set(
        releaseId,
        bundle.release.releaseMetadataUri,
      );
      return bundle.release.releaseMetadataUri;
    }

    const metadataDocument = buildReleaseMetadataDocument(
      bundle,
      inferPublicationSourceKind(
        bundle.metadata.installFile.origin === 'external'
          ? 'externalUrl'
          : 'portalUpload',
      ),
    );
    delete (metadataDocument as Record<string, unknown>).__origin;

    const metadataBytes = Buffer.from(JSON.stringify(metadataDocument), 'utf8');
    const fileHash = createHash('sha256').update(metadataBytes).digest('hex');
    const uploadTarget = await createUploadTarget({
      fileHash,
      fileExtension: 'json',
      contentType: 'application/json',
    });

    await uploadBytes(uploadTarget.uploadUrl, metadataBytes, 'application/json');

    state.metadataUriByReleaseId.set(releaseId, uploadTarget.publicUrl);
    return uploadTarget.publicUrl;
  };

  return {
    async createUploadTarget(
      input: PublicationCreateUploadTargetInput,
    ): Promise<PublicationCreateUploadTargetResult> {
      return await createUploadTarget(input);
    },

    async createIngestionSession(
      input: PublicationCreateIngestionSessionInput,
    ): Promise<PublicationIngestionSession> {
      const dappId = input.dappId || config.dappId;
      const idempotencyKey = input.idempotencyKey || `${Date.now()}`;

      if (input.source.kind === 'apk-file') {
        const source = (() => {
          const filePath = path.resolve(input.source.filePath);
          const fileName = ensureApkFileName(
            input.source.fileName || path.basename(filePath),
          );
          const fileBytes = fs.readFileSync(filePath);
          const fileHash =
            input.source.sha256 ||
            createHash('sha256').update(fileBytes).digest('hex');

          return {
            filePath,
            fileName,
            fileBytes,
            fileHash,
            fileExtension: 'apk',
            contentType:
              input.source.mimeType ||
              'application/vnd.android.package-archive',
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
          fromBase64(toBase64(source.fileBytes)),
          source.contentType,
        );

        const backendResult = await callCreateIngestionSessionWithRetry(config, {
          source: {
            kind: 'portalUpload',
            releaseFileUrl: uploadTarget.publicUrl,
            releaseFileName: source.fileName,
            releaseFileSize: source.releaseFileSize,
          },
          whatsNew: input.whatsNew,
          idempotencyKey,
          ...(dappId ? { dappId } : {}),
        });

        trackBackendIdentifiers(state, backendResult);
        return translateIngestionBackendResult(backendResult);
      }

      const backendSource =
        input.source.kind === 'portalUpload'
          ? {
              kind: 'portalUpload',
              releaseFileUrl: input.source.releaseFileUrl,
              releaseFileName: input.source.releaseFileName,
              releaseFileSize: input.source.releaseFileSize,
            }
          : input.source.kind === 'existingRelease'
            ? {
                kind: 'existingRelease',
                sourceReleaseId: input.source.sourceReleaseId,
              }
            : {
                kind: 'externalUrl',
                apkUrl:
                  input.source.kind === 'externalUrl'
                    ? input.source.apkUrl
                    : input.source.url,
                releaseFileName:
                  input.source.kind === 'externalUrl'
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
      input: PublicationGetIngestionSessionInput,
    ): Promise<PublicationIngestionSession> {
      const resolvedSessionId =
        input.sessionId ||
        (('ingestionSessionId' in input &&
          typeof input.ingestionSessionId === 'string' &&
          input.ingestionSessionId.length > 0)
          ? input.ingestionSessionId
          : undefined);

      if (!resolvedSessionId) {
        throw new Error('publication.getIngestionSession requires a session id');
      }

      const backendResult = await callPortalProcedure<PortalBackendResult>(
        config,
        'publication.getIngestionSession',
        {
          sessionId: resolvedSessionId,
        },
        'query',
      );

      trackBackendIdentifiers(state, backendResult);
      return translateIngestionBackendResult(backendResult);
    },

    async getPublicationBundle(
      input: PublicationGetBundleInput,
    ): Promise<PublicationBundle> {
      const backendBundle = await callPortalProcedure<PortalBackendResult>(
        config,
        'publication.getPublicationBundle',
        { releaseId: input.releaseId },
        'query',
      );

      const linkedPublicationSessionId =
        state.publicationSessionIdByReleaseId.get(input.releaseId) ||
        state.currentPublicationSessionId;
      const linkedPublicationSession = linkedPublicationSessionId
        ? translateBackendPublicationSession(
            await callPortalProcedure<PortalBackendResult>(
              config,
              'publication.getPublicationSession',
              {
                publicationSessionId: linkedPublicationSessionId,
                releaseId: input.releaseId,
              },
              'query',
            ),
          )
        : undefined;

      const releaseMetadataUri =
        state.metadataUriByReleaseId.get(input.releaseId) ||
        (isRecord(backendBundle.release) &&
        typeof backendBundle.release.nftMetadataUri === 'string' &&
        backendBundle.release.nftMetadataUri.length > 0
          ? backendBundle.release.nftMetadataUri
          : await uploadReleaseMetadata(
              mapBackendBundleToPublicationBundle(backendBundle, '', 'portal'),
            ));

      state.metadataUriByReleaseId.set(input.releaseId, releaseMetadataUri);

      const translated = mapBackendBundleToPublicationBundle(
        backendBundle,
        releaseMetadataUri,
        inferPublicationSourceKind(
          state.currentReleaseId &&
            state.publicationSessionIdByReleaseId.has(state.currentReleaseId)
            ? 'portalUpload'
            : 'externalUrl',
        ),
      );

      translated.releaseId = translated.releaseId || input.releaseId;
      translated.publicationSessionId =
        translated.publicationSessionId ||
        linkedPublicationSession?.id ||
        state.publicationSessionIdByReleaseId.get(input.releaseId) ||
        state.currentPublicationSessionId ||
        '';
      translated.ingestionSessionId =
        translated.ingestionSessionId ||
        linkedPublicationSession?.ingestionSessionId ||
        '';

      state.currentReleaseId = translated.releaseId || state.currentReleaseId;
      state.currentPublicationSessionId =
        translated.publicationSessionId || state.currentPublicationSessionId;

      rememberLinkedPublicationSession(
        state,
        translated.releaseId,
        translated.publicationSessionId,
      );

      return translated;
    },

    async getPublicationSession(
      input: PublicationGetSessionInput,
    ) {
      const backendResult = await callPortalProcedure<PortalBackendResult>(
        config,
        'publication.getPublicationSession',
        {
          publicationSessionId:
            input.publicationSessionId ||
            (input.releaseId
              ? state.publicationSessionIdByReleaseId.get(input.releaseId)
              : undefined),
          releaseId: input.releaseId,
        },
        'query',
      );

      const translated = translateBackendPublicationSession(backendResult);
      state.currentPublicationSessionId = translated.id;
      state.currentReleaseId = translated.releaseId || state.currentReleaseId;
      rememberLinkedPublicationSession(
        state,
        translated.releaseId,
        translated.id,
      );
      return translated;
    },

    async cleanupRelease(
      input: PublicationCleanupReleaseInput,
    ): Promise<PublicationCleanupReleaseResult> {
      return await callPortalProcedure<PublicationCleanupReleaseResult>(
        config,
        'publication.cleanupRelease',
        input,
        'mutation',
      );
    },

    async prepareReleaseNftTransaction(
      input: PublicationPrepareReleaseNftTransactionInput,
    ): Promise<PublicationPreparedReleaseTransaction> {
      return await callPortalProcedure<PublicationPreparedReleaseTransaction>(
        config,
        'publication.prepareReleaseNftTransaction',
        input,
        'mutation',
      );
    },

    async submitSignedTransaction(input: {
      signedTransaction: string;
      publicationSessionId?: string;
    }): Promise<PublicationSubmitSignedTransactionResult> {
      return await callPortalProcedure<PublicationSubmitSignedTransactionResult>(
        config,
        'publication.submitSignedTransaction',
        {
          signedTransaction: input.signedTransaction,
          publicationSessionId:
            input.publicationSessionId || state.currentPublicationSessionId,
        },
        'mutation',
      );
    },

    async saveReleaseNftData(
      input: PublicationSaveReleaseNftDataInput,
    ): Promise<PublicationSaveReleaseNftDataResult> {
      return await callPortalProcedure<PublicationSaveReleaseNftDataResult>(
        config,
        'publication.saveReleaseNftData',
        input,
        'mutation',
      );
    },

    async prepareVerifyCollectionTransaction(
      input: PublicationPrepareVerifyCollectionTransactionInput,
    ): Promise<PublicationPreparedVerifyCollectionTransaction> {
      return await callPortalProcedure<PublicationPreparedVerifyCollectionTransaction>(
        config,
        'publication.prepareVerifyCollectionTransaction',
        input,
        'mutation',
      );
    },

    async markReleaseCollectionAsVerified(input: {
      releaseId: string;
    }): Promise<{ success: boolean; releaseId: string }> {
      return await callPortalProcedure<{ success: boolean; releaseId: string }>(
        config,
        'publication.markReleaseCollectionAsVerified',
        input,
        'mutation',
      );
    },

    async submitToStore(
      input: PublicationSubmitToStoreInput,
    ): Promise<PublicationSubmitToStoreResult> {
      const attestation = isRecord(input.attestation)
        ? input.attestation
        : undefined;

      const payload =
        typeof attestation?.payload === 'string' && attestation.payload.length > 0
          ? attestation.payload
          : typeof attestation?.attestationPayload === 'string' &&
              attestation.attestationPayload.length > 0
            ? attestation.attestationPayload
            : typeof (input as Record<string, unknown>).attestationPayload ===
                'string'
              ? String((input as Record<string, unknown>).attestationPayload)
              : '';
      const requestUniqueId =
        typeof attestation?.requestUniqueId === 'string'
          ? attestation.requestUniqueId
          : typeof (input as Record<string, unknown>).requestUniqueId ===
              'string'
            ? String((input as Record<string, unknown>).requestUniqueId)
            : '';

      return await callPortalProcedure<PublicationSubmitToStoreResult>(
        config,
        'publication.submitToStore',
        {
          releaseId: input.releaseId,
          whatsNew: input.whatsNew,
          criticalUpdate: input.criticalUpdate,
          testingInstructions: input.testingInstructions,
          isResubmission: input.isResubmission,
          attestation: {
            payload,
            requestUniqueId,
          },
        },
        'mutation',
      );
    },
  };
}
