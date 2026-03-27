import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Transform } from 'node:stream';

import {
  createAttestationPayloadFromClient,
  type PublicationAttestationResult,
} from './attestation.js';
import { signSerializedTransaction } from './signer.js';
import type {
  PublicationAttestationClient,
  PublicationBundle,
  PublicationCleanupReleaseInput,
  PublicationCleanupReleaseResult,
  PublicationCheckpoint,
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
  PublicationWorkflowResult,
} from './types.js';

export type PublicationWorkflowClient = {
  createUploadTarget?(
    input: PublicationCreateUploadTargetInput,
  ): Promise<PublicationCreateUploadTargetResult>;
  createIngestionSession(
    input: PublicationCreateIngestionSessionInput,
  ): Promise<PublicationIngestionSession>;
  getIngestionSession(
    input: PublicationGetIngestionSessionInput,
  ): Promise<PublicationIngestionSession>;
  getPublicationBundle(
    input: PublicationGetBundleInput,
  ): Promise<PublicationBundle>;
  getPublicationSession(input: PublicationGetSessionInput): Promise<PublicationSession>;
  prepareReleaseNftTransaction(
    input: PublicationWorkflowPrepareReleaseTransactionInput,
  ): Promise<PublicationPreparedReleaseTransaction>;
  submitSignedTransaction(input: {
    signedTransaction: string;
    publicationSessionId?: string;
  }): Promise<PublicationSubmitSignedTransactionResult>;
  saveReleaseNftData(
    input: PublicationSaveReleaseNftDataInput,
  ): Promise<PublicationSaveReleaseNftDataResult>;
  prepareVerifyCollectionTransaction(
    input: PublicationWorkflowPrepareVerifyTransactionInput,
  ): Promise<PublicationPreparedVerifyCollectionTransaction>;
  markReleaseCollectionAsVerified(input: {
    releaseId: string;
  }): Promise<PublicationMarkReleaseCollectionAsVerifiedResult>;
  cleanupRelease?(
    input: PublicationCleanupReleaseInput,
  ): Promise<PublicationCleanupReleaseResult>;
  submitToStore(
    input: PublicationSubmitToStoreInput,
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

function logWorkflowInfo(
  logger: PublicationWorkflowLogger | undefined,
  message: string,
  metadata?: Record<string, unknown>,
) {
  logger?.info?.(message, metadata);
}

function logWorkflowDebug(
  logger: PublicationWorkflowLogger | undefined,
  message: string,
  metadata?: Record<string, unknown>,
) {
  logger?.debug?.(message, metadata);
}

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

const publicationCheckpointOrder: PublicationCheckpoint[] = [
  'created',
  'bundle-ready',
  'mint-submitted',
  'mint-saved',
  'verification-submitted',
  'verified',
  'attested',
  'submitted',
  'completed',
];

function checkpointAtLeast(
  checkpoint: PublicationCheckpoint,
  expected: PublicationCheckpoint,
): boolean {
  return (
    publicationCheckpointOrder.indexOf(checkpoint) >=
    publicationCheckpointOrder.indexOf(expected)
  );
}

function publicationStageToCheckpoint(
  stage: PublicationSession['stage'],
): PublicationCheckpoint {
  if (!stage) {
    return 'created';
  }

  switch (stage) {
    case 'PreparedForMint':
      return 'bundle-ready';
    case 'MintSubmitted':
      return 'mint-submitted';
    case 'MintSaved':
      return 'mint-saved';
    case 'VerificationSubmitted':
      return 'verification-submitted';
    case 'Verified':
      return 'verified';
    case 'Attested':
      return 'attested';
    case 'Submitted':
      return 'submitted';
    case 'Failed':
    default:
      return 'created';
  }
}

function publicationStageToStatus(
  stage: PublicationSession['stage'],
): PublicationSession['status'] {
  if (!stage) {
    return 'pending';
  }

  switch (stage) {
    case 'Submitted':
      return 'completed';
    case 'Failed':
      return 'failed';
    case 'PreparedForMint':
      return 'pending';
    default:
      return 'running';
  }
}

function isReadyIngestionSession(
  session: PublicationIngestionSession,
): boolean {
  return (
    session.status === 'Ready' ||
    session.status === 'ready' ||
    Boolean(session.releaseId) ||
    Boolean(session.publicationSessionId) ||
    Boolean(session.bundle)
  );
}

function sanitizeFileExtension(fileName: string): string {
  const extension = extname(fileName).replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '');
  return extension.length > 0 ? extension.toLowerCase() : 'apk';
}

function inferFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const fileName = basename(pathname);
    return fileName.length > 0 ? fileName : 'release.apk';
  } catch {
    return 'release.apk';
  }
}

async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

function buildIngestionStatusProgress(
  status: PublicationIngestionSession['status'],
): number {
  switch (status) {
    case 'created':
      return 0.15;
    case 'queued':
      return 0.3;
    case 'processing':
      return 0.7;
    case 'Ready':
    case 'ready':
      return 1;
    case 'Failed':
    case 'failed':
      return 1;
    default:
      return 0.15;
  }
}

function buildIngestionStatusMessage(
  status: PublicationIngestionSession['status'],
): string | null {
  switch (status) {
    case 'created':
      return 'Portal ingestion request created';
    case 'queued':
      return 'Portal ingestion queued';
    case 'processing':
      return 'Portal ingestion is processing the APK';
    case 'Ready':
    case 'ready':
      return 'Portal ingestion is ready';
    default:
      return null;
  }
}

function normalizePublicationMetadata(
  bundle: PublicationBundle,
): PublicationBundle['metadata'] {
  if (bundle.metadata) {
    return bundle.metadata;
  }

  return {
    localizedName:
      bundle.release.localizedName ??
      bundle.release.releaseName ??
      bundle.dapp.dappName,
    shortDescription: bundle.dapp.subtitle ?? '',
    longDescription: bundle.dapp.description ?? '',
    newInVersion: bundle.release.newInVersion,
    publisherWebsite: bundle.publisher.website,
    supportEmail: bundle.publisher.supportEmail ?? bundle.dapp.supportEmail ?? null,
    website: bundle.dapp.website ?? bundle.dapp.appWebsite ?? null,
    locales: bundle.dapp.languages ?? [],
    legal: {
      licenseUrl: bundle.dapp.licenseUrl ?? null,
      copyrightUrl: bundle.dapp.copyrightUrl ?? null,
      privacyPolicyUrl: bundle.dapp.privacyPolicyUrl ?? null,
    },
    media: [],
    installFile: {
      uri: bundle.installFile.uri,
      mimeType: bundle.installFile.mimeType,
      size: bundle.installFile.size,
      sha256: bundle.installFile.sha256 ?? null,
      fileName: bundle.installFile.fileName ?? inferFileNameFromUrl(bundle.installFile.uri),
      canonicalUrl: bundle.installFile.canonicalUrl ?? bundle.installFile.uri,
      url: bundle.installFile.uri,
      origin: 'portal',
    },
    localizedStrings: [],
    releaseMetadataUri:
      bundle.release.releaseMetadataUri ??
      bundle.release.nftMetadataUri ??
      null,
  };
}

function normalizePublicationBundle(bundle: PublicationBundle): PublicationBundle {
  return {
    ...bundle,
    releaseId: bundle.releaseId || bundle.release.id || '',
    metadata: normalizePublicationMetadata(bundle),
  };
}

function withPublicationBundleIdentifiers(
  bundle: PublicationBundle,
  identifiers: {
    releaseId?: string | null;
    publicationSessionId?: string | null;
    ingestionSessionId?: string | null;
  },
): PublicationBundle {
  return {
    ...bundle,
    releaseId:
      bundle.releaseId || bundle.release.id || identifiers.releaseId || '',
    publicationSessionId:
      bundle.publicationSessionId || identifiers.publicationSessionId || '',
    ingestionSessionId:
      bundle.ingestionSessionId || identifiers.ingestionSessionId || '',
  };
}

function normalizePublicationSession(
  session: PublicationSession,
): PublicationSession {
  const stage = resolvePublicationSessionStage(session);
  const checkpoint = session.checkpoint ?? publicationStageToCheckpoint(stage);

  return {
    ...session,
    stage,
    checkpoint,
    status: session.status ?? publicationStageToStatus(stage),
    releaseMintAddress:
      session.releaseMintAddress ?? session.expectedMintAddress ?? null,
    verifyTransactionSignature:
      session.verifyTransactionSignature ??
      session.verificationTransactionSignature ??
      null,
  };
}

function resolvePublicationSessionStage(
  session: PublicationSession,
): PublicationSessionStage {
  if (session.stage) {
    return session.stage;
  }

  if (session.status === 'failed') {
    return 'Failed';
  }

  if (session.status === 'completed') {
    return 'Submitted';
  }

  if (session.checkpoint === 'submitted' || session.checkpoint === 'completed') {
    return 'Submitted';
  }

  if (session.checkpoint === 'verified') {
    return 'Verified';
  }

  if (session.checkpoint === 'attested') {
    return 'Attested';
  }

  if (session.checkpoint === 'verification-submitted') {
    return 'VerificationSubmitted';
  }

  if (session.checkpoint === 'mint-saved') {
    return 'MintSaved';
  }

  if (session.checkpoint === 'mint-submitted') {
    return 'MintSubmitted';
  }

  return 'PreparedForMint';
}

function resolveReleaseMetadataUri(
  bundle: PublicationBundle,
  session?: PublicationSession,
): string {
  const releaseMetadataUri =
    session?.metadataUri ??
    bundle.release.releaseMetadataUri ??
    bundle.release.nftMetadataUri ??
    bundle.metadata?.releaseMetadataUri ??
    null;

  if (!releaseMetadataUri) {
    throw new Error(
      'Publication bundle did not include a release metadata URI',
    );
  }

  return releaseMetadataUri;
}

function resolvePublicationSignerAddress(
  bundle: PublicationBundle,
): string {
  return (
    bundle.signerAuthority.dappWalletAddress ??
    bundle.signerAuthority.requiredSigner ??
    bundle.signerAuthority.collectionAuthority
  );
}

function resolveReleaseDisplayName(bundle: PublicationBundle): string {
  return (
    bundle.release.localizedName ??
    bundle.release.releaseName ??
    bundle.dapp.dappName
  );
}

function resolvePublicationFeePayer(
  bundle: PublicationBundle,
  signer: PublicationSigner,
): string {
  return bundle.signerAuthority.feePayer ?? signer.publicKey;
}

async function uploadLocalApkToPortal(
  client: PublicationWorkflowClient,
  source: Extract<PublicationSource, { kind: 'apk-file' }>,
  logger?: PublicationWorkflowLogger,
): Promise<PublicationCreateIngestionSessionInput['source']> {
  const createUploadTarget = client.createUploadTarget;
  if (!createUploadTarget) {
    throw new Error(
      'Local apk-file sources require a createUploadTarget client method',
    );
  }

  const fileStat = await stat(source.filePath);
  const contentType =
    source.mimeType ?? 'application/vnd.android.package-archive';
  const fileHash = await hashFileSha256(source.filePath);
  const fileName = source.fileName || basename(source.filePath);
  const fileExtension = sanitizeFileExtension(fileName);

  logWorkflowInfo(logger, 'Uploading APK to portal storage', {
    step: 'source.upload',
    status: 'running',
    fileName,
    filePath: source.filePath,
    fileSize: fileStat.size,
  });

  const uploadTarget = await createUploadTarget({
    fileHash,
    fileExtension,
    contentType,
  });

  const totalBytes = fileStat.size;
  let uploadedBytes = 0;
  let lastLoggedBytes = 0;
  let lastLoggedAt = 0;

  const emitUploadProgress = (force = false) => {
    const now = Date.now();
    const progress = totalBytes > 0 ? uploadedBytes / totalBytes : 1;
    const byteDelta = uploadedBytes - lastLoggedBytes;
    const minByteDelta = Math.max(256 * 1024, Math.floor(totalBytes * 0.01));
    const shouldLog =
      force ||
      uploadedBytes >= totalBytes ||
      now - lastLoggedAt >= 250 ||
      byteDelta >= minByteDelta;

    if (!shouldLog) {
      return;
    }

    lastLoggedAt = now;
    lastLoggedBytes = uploadedBytes;

    logWorkflowDebug(logger, 'Uploading APK to portal storage', {
      step: 'source.upload',
      status: 'running',
      fileName,
      filePath: source.filePath,
      fileSize: totalBytes,
      bytesUploaded: uploadedBytes,
      bytesTotal: totalBytes,
      stepProgress: progress,
    });
  };

  const uploadBody = createReadStream(source.filePath).pipe(
    new Transform({
      transform(chunk, _encoding, callback) {
        uploadedBytes += chunk.length;
        emitUploadProgress();
        callback(null, chunk);
      },
    }),
  );

  const uploadResponse = await fetch(uploadTarget.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'content-length': String(totalBytes),
    },
    body: uploadBody,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload APK to portal storage: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  uploadedBytes = totalBytes;
  emitUploadProgress(true);

  logWorkflowInfo(logger, 'APK uploaded to portal storage', {
    step: 'source.upload',
    status: 'complete',
    fileName,
    publicUrl: uploadTarget.publicUrl,
  });

  return {
    kind: 'portalUpload',
    releaseFileUrl: uploadTarget.publicUrl,
    releaseFileName: fileName,
    releaseFileSize: fileStat.size,
    releaseFileHash: fileHash,
    contentType,
  };
}

async function preparePublicationSource(
  client: PublicationWorkflowClient,
  source: PublicationSource,
  logger?: PublicationWorkflowLogger,
): Promise<PublicationCreateIngestionSessionInput['source']> {
  switch (source.kind) {
    case 'portalUpload':
      logWorkflowInfo(logger, 'Using portal-hosted APK source', {
        step: 'source.ready',
        status: 'complete',
        fileName: source.releaseFileName,
      });
      return source;
    case 'externalUrl':
      logWorkflowInfo(logger, 'Using external APK URL', {
        step: 'source.ready',
        status: 'complete',
        fileName: source.releaseFileName ?? inferFileNameFromUrl(source.apkUrl),
        apkUrl: source.apkUrl,
      });
      return source;
    case 'existingRelease':
      logWorkflowInfo(logger, 'Using an existing release as the source', {
        step: 'source.ready',
        status: 'complete',
        sourceReleaseId: source.sourceReleaseId,
      });
      return source;
    case 'apk-url':
      logWorkflowInfo(logger, 'Preparing external APK URL', {
        step: 'source.ready',
        status: 'running',
        fileName:
          source.fileName ??
          inferFileNameFromUrl(source.canonicalUrl ?? source.url),
        apkUrl: source.canonicalUrl ?? source.url,
      });
      return {
        kind: 'externalUrl',
        apkUrl: source.canonicalUrl ?? source.url,
        releaseFileName:
          source.fileName ?? inferFileNameFromUrl(source.canonicalUrl ?? source.url),
      };
    case 'apk-file':
      return uploadLocalApkToPortal(client, source, logger);
    default: {
      const _exhaustiveCheck: never = source;
      return _exhaustiveCheck;
    }
  }
}

async function signPreparedTransaction(
  signer: PublicationSigner,
  serializedTransaction: string,
): Promise<string> {
  return signSerializedTransaction(signer, serializedTransaction);
}

async function waitForIngestionSessionReady(
  client: PublicationWorkflowClient,
  ingestionSessionId: string,
  options: Required<
    Pick<PublicationWorkflowOptions, 'pollIntervalMs' | 'maxPollAttempts'>
  >,
  logger?: PublicationWorkflowLogger,
): Promise<PublicationIngestionSession> {
  logWorkflowInfo(logger, 'Waiting for portal ingestion to finish', {
    step: 'ingestion.wait',
    status: 'running',
    ingestionSessionId,
    stepProgress: 0.15,
  });

  let previousStatus: PublicationIngestionSession['status'] | undefined;

  for (let attempt = 1; attempt <= options.maxPollAttempts; attempt += 1) {
    const session = await client.getIngestionSession({
      sessionId: ingestionSessionId,
      ingestionSessionId,
    });
    if (session.status === 'Failed' || session.status === 'failed') {
      throw new Error(
        session.error ||
          session.processingError ||
          'Publication ingestion failed before the bundle was ready',
      );
    }

    if (session.status !== previousStatus) {
      previousStatus = session.status;
      const statusMessage = buildIngestionStatusMessage(session.status);
      if (statusMessage) {
        logWorkflowInfo(logger, statusMessage, {
          step: 'ingestion.wait',
          status: 'running',
          ingestionSessionId,
          releaseId: session.releaseId ?? undefined,
          publicationSessionId: session.publicationSessionId ?? undefined,
          androidPackage: session.androidPackage ?? undefined,
          versionName: session.versionName ?? undefined,
          ingestionStatus: session.status,
          stepProgress: buildIngestionStatusProgress(session.status),
        });
      }
    }

    if (isReadyIngestionSession(session)) {
      logWorkflowInfo(logger, 'Portal ingestion is ready', {
        step: 'ingestion.wait',
        status: 'complete',
        ingestionSessionId,
        releaseId: session.releaseId ?? undefined,
        publicationSessionId: session.publicationSessionId ?? undefined,
        androidPackage: session.androidPackage ?? undefined,
        versionName: session.versionName ?? undefined,
      });
      return session;
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for ingestion session ${ingestionSessionId} to become ready`,
  );
}

function buildPublicationBundleValidation(bundle: PublicationBundle): void {
  const normalizedBundle = normalizePublicationBundle(bundle);
  const requiredFields: Array<[string, unknown]> = [
    ['releaseId', normalizedBundle.releaseId],
    ['publicationSessionId', normalizedBundle.publicationSessionId],
    ['ingestionSessionId', normalizedBundle.ingestionSessionId],
    ['androidPackage', normalizedBundle.release.androidPackage],
    [
      'release.localizedName',
      normalizedBundle.release.localizedName ??
        normalizedBundle.release.releaseName,
    ],
    ['versionName', normalizedBundle.release.versionName],
    ['appMintAddress', normalizedBundle.signerAuthority.appMintAddress],
    ['dappWalletAddress', normalizedBundle.signerAuthority.dappWalletAddress],
    ['collectionAuthority', normalizedBundle.signerAuthority.collectionAuthority],
    ['acceptedSignerRoles', normalizedBundle.signerAuthority.acceptedSignerRoles],
    ['metadata.localizedName', normalizedBundle.metadata?.localizedName],
    ['shortDescription', normalizedBundle.metadata?.shortDescription],
    ['longDescription', normalizedBundle.metadata?.longDescription],
    ['newInVersion', normalizedBundle.metadata?.newInVersion],
    ['installFile.uri', normalizedBundle.installFile.uri],
    ['installFile.mimeType', normalizedBundle.installFile.mimeType],
  ];

  const missing = requiredFields.filter(([, value]) => {
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return value === undefined || value === null;
  });

  if (missing.length > 0) {
    throw new Error(
      `Publication bundle is missing required fields: ${missing
        .map(([field]) => field)
        .join(', ')}`,
    );
  }
}

function resolveReleaseMintAddress(
  bundle: PublicationBundle,
  publicationSession: PublicationSession,
): string | undefined {
  return (
    publicationSession.releaseMintAddress ??
    publicationSession.expectedMintAddress ??
    bundle.release.nftMintAddress ??
    bundle.release.releaseMintAddress ??
    undefined
  );
}

function normalizeWorkflowError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function runPublicationWorkflow(
  client: PublicationWorkflowClient,
  bundle: PublicationBundle,
  signer: PublicationSigner,
  attestationClient: PublicationAttestationClient,
  session: PublicationSession,
  logger: PublicationWorkflowLogger | undefined,
): Promise<PublicationWorkflowResult> {
  const normalizedBundle = normalizePublicationBundle(bundle);
  const normalizedSession = normalizePublicationSession(session);
  buildPublicationBundleValidation(normalizedBundle);

  if (normalizedSession.stage === 'Failed') {
    throw new Error(
      normalizedSession.lastError || normalizedSession.error || 'Publication session failed',
    );
  }

  const publicationSession = normalizedSession;
  const publicationCheckpoint =
    publicationSession.checkpoint ?? publicationStageToCheckpoint(publicationSession.stage);
  let releaseTransactionSignature =
    publicationSession.mintTransactionSignature ?? undefined;
  let collectionTransactionSignature =
    publicationSession.verifyTransactionSignature ??
    publicationSession.verificationTransactionSignature ??
    undefined;
  let attestationResult: PublicationAttestationResult | undefined;
  let hubspotTicketId = publicationSession.hubspotTicketId ?? undefined;
  let releaseMintAddress = resolveReleaseMintAddress(
    normalizedBundle,
    publicationSession,
  );
  const releaseMetadataUri = resolveReleaseMetadataUri(
    normalizedBundle,
    publicationSession,
  );
  const publisherAddress = resolvePublicationSignerAddress(normalizedBundle);
  const payerAddress = resolvePublicationFeePayer(normalizedBundle, signer);

  if (!checkpointAtLeast(publicationCheckpoint, 'mint-submitted')) {
    logWorkflowInfo(logger, 'Preparing release NFT transaction', {
      step: 'mint.prepare',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
    });

    const preparedReleaseTransaction =
      await client.prepareReleaseNftTransaction({
        releaseId: normalizedBundle.releaseId,
        releaseName: resolveReleaseDisplayName(normalizedBundle),
        releaseMetadataUri,
        appMintAddress: normalizedBundle.signerAuthority.appMintAddress,
        publisherAddress,
        payerAddress,
      });

    releaseMintAddress = preparedReleaseTransaction.mintAddress;

    releaseTransactionSignature = await signPreparedTransaction(
      signer,
      preparedReleaseTransaction.transaction,
    );

    const signedTransactionResult = await client.submitSignedTransaction({
      signedTransaction: releaseTransactionSignature,
      publicationSessionId: publicationSession.id,
    });

    releaseTransactionSignature = signedTransactionResult.transactionSignature;
    logWorkflowInfo(logger, 'Release NFT transaction submitted', {
      step: 'mint.submit',
      status: 'complete',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      transactionSignature: releaseTransactionSignature,
    });
  }

  if (!checkpointAtLeast(publicationCheckpoint, 'mint-saved')) {
    const mintAddress =
      publicationSession.releaseMintAddress ??
      publicationSession.expectedMintAddress ??
      normalizedBundle.release.releaseMintAddress ??
      releaseMintAddress;

    if (!mintAddress) {
      throw new Error(
        'Publication bundle did not include a release mint address',
      );
    }

    if (!releaseTransactionSignature) {
      throw new Error('Release transaction signature is missing');
    }

    logWorkflowInfo(logger, 'Saving release NFT data', {
      step: 'mint.save',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      mintAddress,
    });

    await client.saveReleaseNftData({
      releaseId: normalizedBundle.releaseId,
      mintAddress,
      transactionSignature: releaseTransactionSignature,
      metadataUri: releaseMetadataUri,
      ownerAddress: publisherAddress,
      releaseName: resolveReleaseDisplayName(normalizedBundle),
      releaseVersion: normalizedBundle.release.versionName,
      androidPackage: normalizedBundle.release.androidPackage,
      appMintAddress: normalizedBundle.signerAuthority.appMintAddress,
    });

    logWorkflowInfo(logger, 'Release NFT data saved', {
      step: 'mint.save',
      status: 'complete',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      mintAddress,
    });
  }

  if (!checkpointAtLeast(publicationCheckpoint, 'verification-submitted')) {
    if (!releaseMintAddress) {
      throw new Error(
        'Publication bundle did not include a release mint address for collection verification',
      );
    }

    logWorkflowInfo(logger, 'Preparing collection verification transaction', {
      step: 'verify.prepare',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      mintAddress: releaseMintAddress,
    });

    const preparedVerifyTransaction =
      await client.prepareVerifyCollectionTransaction({
        dappId: normalizedBundle.signerAuthority.dappId ?? normalizedBundle.dapp.id,
        nftMintAddress: releaseMintAddress,
        collectionMintAddress: normalizedBundle.signerAuthority.appMintAddress,
        collectionAuthority: normalizedBundle.signerAuthority.collectionAuthority,
        payerAddress,
      });

    collectionTransactionSignature = await signPreparedTransaction(
      signer,
      preparedVerifyTransaction.transaction,
    );

    logWorkflowInfo(logger, 'Submitting collection verification transaction', {
      step: 'verify.submit',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      mintAddress: releaseMintAddress,
    });

    const signedVerifyTransactionResult = await client.submitSignedTransaction({
      signedTransaction: collectionTransactionSignature,
      publicationSessionId: publicationSession.id,
    });

    collectionTransactionSignature =
      signedVerifyTransactionResult.transactionSignature;

    await client.markReleaseCollectionAsVerified({
      releaseId: normalizedBundle.releaseId,
    });

    logWorkflowInfo(logger, 'Release collection verified', {
      step: 'verify.submit',
      status: 'complete',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      transactionSignature: collectionTransactionSignature,
    });
  }

  if (!checkpointAtLeast(publicationCheckpoint, 'submitted')) {
    logWorkflowInfo(logger, 'Creating attestation payload', {
      step: 'attestation.create',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
    });

    attestationResult = await createAttestationPayloadFromClient(
      attestationClient,
      signer,
    );
    logWorkflowInfo(logger, 'Attestation payload created', {
      step: 'attestation.create',
      status: 'complete',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      requestUniqueId: attestationResult.requestUniqueId,
    });

    logWorkflowInfo(logger, 'Submitting release to store', {
      step: 'submit.store',
      status: 'running',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
    });

    const submissionResult = await client.submitToStore({
      releaseId: normalizedBundle.releaseId,
      whatsNew: normalizedBundle.release.newInVersion,
      attestation: {
        payload: attestationResult.payload,
        requestUniqueId: attestationResult.requestUniqueId,
      },
    });

    hubspotTicketId = submissionResult.hubspotTicketId ?? hubspotTicketId;
    logWorkflowInfo(logger, 'Release submitted to store', {
      step: 'submit.store',
      status: 'complete',
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      hubspotTicketId,
    });
  }

  if (!releaseMintAddress) {
    throw new Error('Publication session did not resolve a release mint address');
  }

  return {
    ingestionSessionId:
      publicationSession.ingestionSessionId ??
      normalizedBundle.ingestionSessionId ??
      '',
    publicationSessionId:
      publicationSession.id || normalizedBundle.publicationSessionId || '',
    releaseId:
      normalizedBundle.releaseId || publicationSession.releaseId || '',
    releaseMintAddress,
    collectionMintAddress: normalizedBundle.signerAuthority.appMintAddress,
    releaseTransactionSignature,
    collectionTransactionSignature,
    attestationRequestUniqueId:
      attestationResult?.requestUniqueId ??
      publicationSession.attestationRequestUniqueId ??
      undefined,
    hubspotTicketId,
    publicationBundle: normalizedBundle,
    publicationSession,
  };
}

export const createPublicationWorkflow = (
  client: PublicationWorkflowClient,
  options: PublicationWorkflowOptions = {},
) => {
  const pollIntervalMs = options.pollIntervalMs ?? 2500;
  const maxPollAttempts = options.maxPollAttempts ?? 120;

  const pollOptions = {
    pollIntervalMs,
    maxPollAttempts,
  } as const;

  const recoverPublicationResult = async (
    releaseId: string,
    signer: PublicationSigner,
    attestationClient: PublicationAttestationClient,
  ): Promise<PublicationWorkflowResult> => {
    logWorkflowInfo(options.logger, 'Recovering final publication state', {
      step: 'cleanup.recover',
      status: 'running',
      releaseId,
    });

    const publicationSession = normalizePublicationSession(
      await client.getPublicationSession({
        releaseId,
      }),
    );
    const publicationBundle = withPublicationBundleIdentifiers(
      normalizePublicationBundle(
        await client.getPublicationBundle({
          releaseId,
        }),
      ),
      {
        releaseId,
        publicationSessionId: publicationSession.id,
        ingestionSessionId: publicationSession.ingestionSessionId ?? null,
      },
    );

    logWorkflowInfo(options.logger, 'Recovered final publication state', {
      step: 'cleanup.recover',
      status: 'complete',
      releaseId,
      publicationSessionId: publicationSession.id,
      stage: publicationSession.stage,
    });

    return runPublicationWorkflow(
      client,
      publicationBundle,
      signer,
      attestationClient,
      publicationSession,
      options.logger,
    );
  };

  const cleanupFailedRelease = async (
    releaseId: string,
    error: Error,
  ): Promise<PublicationCleanupReleaseResult | null> => {
    if (!client.cleanupRelease) {
      return null;
    }

    options.logger?.warn?.('Rolling back failed publication release', {
      step: 'cleanup.release',
      status: 'running',
      releaseId,
      error: error.message,
    });

    const cleanupResult = await client.cleanupRelease({
      releaseId,
    });

    const message =
      cleanupResult.action === 'deleted'
        ? 'Failed publication release cleaned up'
        : 'Publication already reached the submitted state; preserving release';

    logWorkflowInfo(options.logger, message, {
      step: 'cleanup.release',
      status: 'complete',
      releaseId,
      action: cleanupResult.action,
    });

    return cleanupResult;
  };

  return {
    async startPublication(input: PublicationWorkflowInput) {
      let createdReleaseId: string | undefined;

      try {
        logWorkflowInfo(options.logger, 'Preparing publication source', {
          step: 'source.prepare',
          status: 'running',
        });

        const source = await preparePublicationSource(
          client,
          input.source,
          options.logger,
        );

        logWorkflowInfo(options.logger, 'Creating ingestion session', {
          step: 'ingestion.create',
          status: 'running',
        });

        const ingestionSession = await client.createIngestionSession({
          source,
          whatsNew: input.whatsNew,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
          ...(input.dappId ? { dappId: input.dappId } : {}),
        });

        createdReleaseId =
          ingestionSession.releaseId ?? ingestionSession.bundle?.releaseId ?? undefined;

        const createdIngestionSessionId = ingestionSession.id?.trim();
        if (!createdIngestionSessionId) {
          throw new Error(
            'Portal createIngestionSession did not return an ingestion session id',
          );
        }

        logWorkflowInfo(options.logger, 'Ingestion session created', {
          step: 'ingestion.create',
          status: 'complete',
          ingestionSessionId: createdIngestionSessionId,
          releaseId: createdReleaseId,
        });

        const readySession = await waitForIngestionSessionReady(
          client,
          createdIngestionSessionId,
          pollOptions,
          options.logger,
        );

        const releaseId =
          readySession.releaseId ?? readySession.bundle?.releaseId ?? undefined;
        if (!releaseId) {
          throw new Error(
            'Publication ingestion completed without a release identifier',
          );
        }
        createdReleaseId = releaseId;

        logWorkflowInfo(options.logger, 'Loading publication bundle', {
          step: 'bundle.load',
          status: 'running',
          releaseId,
        });

        const publicationBundle = withPublicationBundleIdentifiers(
          normalizePublicationBundle(
            readySession.bundle ??
              (await client.getPublicationBundle({
                releaseId,
              })),
          ),
          {
            releaseId,
            publicationSessionId: readySession.publicationSessionId ?? null,
            ingestionSessionId: readySession.id,
          },
        );
        buildPublicationBundleValidation(publicationBundle);

        logWorkflowInfo(options.logger, 'Publication bundle loaded', {
          step: 'bundle.load',
          status: 'complete',
          releaseId,
          androidPackage: publicationBundle.release.androidPackage,
          versionName: publicationBundle.release.versionName,
        });

        logWorkflowInfo(options.logger, 'Loading publication session', {
          step: 'session.load',
          status: 'running',
          releaseId,
        });

        const publicationSession = normalizePublicationSession(
          readySession.publicationSession ??
            (await client.getPublicationSession(
              readySession.publicationSessionId
                ? {
                    publicationSessionId: readySession.publicationSessionId,
                  }
                : {
                    releaseId,
                  },
            )),
        );

        logWorkflowInfo(options.logger, 'Publication session loaded', {
          step: 'session.load',
          status: 'complete',
          releaseId,
          publicationSessionId: publicationSession.id,
          stage: publicationSession.stage,
        });

        return runPublicationWorkflow(
          client,
          publicationBundle,
          input.signer,
          input.attestationClient,
          publicationSession,
          options.logger,
        );
      } catch (error) {
        const normalizedError = normalizeWorkflowError(error);

        if (!createdReleaseId) {
          throw normalizedError;
        }

        try {
          const cleanupResult = await cleanupFailedRelease(
            createdReleaseId,
            normalizedError,
          );

          if (cleanupResult?.action === 'preservedSubmitted') {
            return await recoverPublicationResult(
              createdReleaseId,
              input.signer,
              input.attestationClient,
            );
          }
        } catch (cleanupError) {
          const normalizedCleanupError = normalizeWorkflowError(cleanupError);
          throw new Error(
            `${normalizedError.message} Cleanup also failed for release ${createdReleaseId}: ${normalizedCleanupError.message}`,
          );
        }

        throw normalizedError;
      }
    },
    async resumePublication(input: PublicationResumeInput) {
      if (!input.publicationSessionId && !input.releaseId) {
        throw new Error(
          'Publication session id or release id is required to resume a publication',
        );
      }

      logWorkflowInfo(options.logger, 'Loading existing publication session', {
        step: 'session.load',
        status: 'running',
        releaseId: input.releaseId,
        publicationSessionId: input.publicationSessionId,
      });

      const publicationSession = normalizePublicationSession(
        await client.getPublicationSession(
          input.publicationSessionId
            ? {
                publicationSessionId: input.publicationSessionId,
              }
            : {
                releaseId: input.releaseId!,
            },
        ),
      );

      logWorkflowInfo(options.logger, 'Existing publication session loaded', {
        step: 'session.load',
        status: 'complete',
        releaseId: publicationSession.releaseId,
        publicationSessionId: publicationSession.id,
        stage: publicationSession.stage,
      });

      logWorkflowInfo(options.logger, 'Loading publication bundle', {
        step: 'bundle.load',
        status: 'running',
        releaseId: publicationSession.releaseId,
      });

      const publicationBundle = withPublicationBundleIdentifiers(
        normalizePublicationBundle(
          await client.getPublicationBundle({
            releaseId: publicationSession.releaseId,
          }),
        ),
        {
          releaseId: publicationSession.releaseId,
          publicationSessionId: publicationSession.id,
          ingestionSessionId: publicationSession.ingestionSessionId ?? null,
        },
      );

      logWorkflowInfo(options.logger, 'Publication bundle loaded', {
        step: 'bundle.load',
        status: 'complete',
        releaseId: publicationSession.releaseId,
        androidPackage: publicationBundle.release.androidPackage,
        versionName: publicationBundle.release.versionName,
      });

      return runPublicationWorkflow(
        client,
        publicationBundle,
        input.signer,
        input.attestationClient,
        publicationSession,
        options.logger,
      );
    },
  };
};
