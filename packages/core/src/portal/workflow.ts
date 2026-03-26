import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import {
  createAttestationPayloadFromClient,
  type PublicationAttestationResult,
} from './attestation.js';
import { signSerializedTransaction } from './signer.js';
import type {
  PublicationAttestationClient,
  PublicationBundle,
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
): Promise<PublicationCreateIngestionSessionInput['source']> {
  const createUploadTarget = client.createUploadTarget;
  if (!createUploadTarget) {
    throw new Error(
      'Local apk-file sources require a createUploadTarget client method',
    );
  }

  const fileBuffer = await readFile(source.filePath);
  const fileStat = await stat(source.filePath);
  const contentType =
    source.mimeType ?? 'application/vnd.android.package-archive';
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const fileName = source.fileName || basename(source.filePath);
  const fileExtension = sanitizeFileExtension(fileName);
  const uploadTarget = await createUploadTarget({
    fileHash,
    fileExtension,
    contentType,
  });

  const uploadResponse = await fetch(uploadTarget.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload APK to portal storage: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

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
): Promise<PublicationCreateIngestionSessionInput['source']> {
  switch (source.kind) {
    case 'portalUpload':
    case 'externalUrl':
    case 'existingRelease':
      return source;
    case 'apk-url':
      return {
        kind: 'externalUrl',
        apkUrl: source.canonicalUrl ?? source.url,
        releaseFileName:
          source.fileName ?? inferFileNameFromUrl(source.canonicalUrl ?? source.url),
      };
    case 'apk-file':
      return uploadLocalApkToPortal(client, source);
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
): Promise<PublicationIngestionSession> {
  for (let attempt = 1; attempt <= options.maxPollAttempts; attempt += 1) {
    const session = await client.getIngestionSession({ sessionId: ingestionSessionId });
    if (session.status === 'Failed' || session.status === 'failed') {
      throw new Error(
        session.error ||
          session.processingError ||
          'Publication ingestion failed before the bundle was ready',
      );
    }

    if (isReadyIngestionSession(session)) {
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
    logger?.info?.('Preparing release NFT transaction', {
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
    logger?.info?.('Release NFT transaction submitted', {
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

    logger?.info?.('Release NFT data saved', {
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

    const signedVerifyTransactionResult = await client.submitSignedTransaction({
      signedTransaction: collectionTransactionSignature,
      publicationSessionId: publicationSession.id,
    });

    collectionTransactionSignature =
      signedVerifyTransactionResult.transactionSignature;

    await client.markReleaseCollectionAsVerified({
      releaseId: normalizedBundle.releaseId,
    });

    logger?.info?.('Release collection verified', {
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      transactionSignature: collectionTransactionSignature,
    });
  }

  if (!checkpointAtLeast(publicationCheckpoint, 'submitted')) {
    attestationResult = await createAttestationPayloadFromClient(
      attestationClient,
      signer,
    );
    logger?.info?.('Attestation payload created', {
      releaseId: normalizedBundle.releaseId,
      publicationSessionId: publicationSession.id,
      requestUniqueId: attestationResult.requestUniqueId,
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
    logger?.info?.('Release submitted to store', {
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

  return {
    async startPublication(input: PublicationWorkflowInput) {
      const source = await preparePublicationSource(client, input.source);
      const ingestionSession = await client.createIngestionSession({
        source,
        whatsNew: input.whatsNew,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        ...(input.dappId ? { dappId: input.dappId } : {}),
      });

      const readySession = await waitForIngestionSessionReady(
        client,
        ingestionSession.id,
        pollOptions,
      );

      const releaseId =
        readySession.releaseId ?? readySession.bundle?.releaseId ?? undefined;
      if (!releaseId) {
        throw new Error(
          'Publication ingestion completed without a release identifier',
        );
      }

      const publicationBundle = normalizePublicationBundle(
        readySession.bundle ??
          (await client.getPublicationBundle({
            releaseId,
          })),
      );
      buildPublicationBundleValidation(publicationBundle);

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

      return runPublicationWorkflow(
        client,
        publicationBundle,
        input.signer,
        input.attestationClient,
        publicationSession,
        options.logger,
      );
    },
    async resumePublication(input: PublicationResumeInput) {
      if (!input.publicationSessionId && !input.releaseId) {
        throw new Error(
          'Publication session id or release id is required to resume a publication',
        );
      }

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

      const publicationBundle = normalizePublicationBundle(
        await client.getPublicationBundle({
          releaseId: publicationSession.releaseId,
        }),
      );

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
