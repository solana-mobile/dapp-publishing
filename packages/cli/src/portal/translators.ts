import type {
  PublicationBundle,
  PublicationIngestionSession,
  PublicationSession,
  PublicationSource,
} from '@solana-mobile/dapp-store-publishing-tools';

import {
  ensureHttpsUrl,
  inferFileNameFromUrl,
  inferMimeType,
} from './files.js';
import { firstString, isRecord } from './records.js';
import type { PortalSourceKind } from './types.js';

function asString(value: unknown): string {
  return String(value || '');
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function buildInstallFileDetails(
  release: Record<string, unknown>,
  installFile: Record<string, unknown>
) {
  const url = asString(installFile.uri || release.releaseFileUrl || '');
  const fileName =
    (typeof release.releaseFileName === 'string' && release.releaseFileName) ||
    inferFileNameFromUrl(url);

  return {
    url,
    fileName,
    mimeType:
      typeof installFile.mimeType === 'string'
        ? installFile.mimeType
        : inferMimeType(fileName),
    size: numberOrDefault(installFile.size, 0),
    sha256: typeof installFile.sha256 === 'string' ? installFile.sha256 : null,
    canonicalUrl:
      typeof installFile.canonicalUrl === 'string'
        ? installFile.canonicalUrl
        : url,
  };
}

function normalizePublicationCheckpoint(session: {
  stage?: string;
  mintTransactionSignature?: string | null;
  verificationTransactionSignature?: string | null;
  attestationRequestUniqueId?: string | null;
  hubspotTicketId?: string | null;
  expectedMintAddress?: string | null;
  metadataUri?: string | null;
}): PublicationSession['checkpoint'] {
  switch (session.stage) {
    case 'Submitted':
      return 'submitted';
    case 'Attested':
      return 'verified';
    case 'Verified':
    case 'VerificationSubmitted':
      return 'verified';
    case 'MintSaved':
      return 'mint-saved';
    case 'MintSubmitted':
      return 'mint-submitted';
    case 'PreparedForMint':
      return 'bundle-ready';
    case 'Failed':
      break;
    default:
      break;
  }

  if (session.hubspotTicketId) {
    return 'submitted';
  }

  if (session.attestationRequestUniqueId) {
    return 'verified';
  }

  if (session.verificationTransactionSignature) {
    return 'verified';
  }

  if (session.mintTransactionSignature) {
    return 'mint-submitted';
  }

  if (session.expectedMintAddress || session.metadataUri) {
    return 'bundle-ready';
  }

  return 'created';
}

function normalizePublicationStatus(session: {
  stage?: string;
  hubspotTicketId?: string | null;
}) {
  if (session.stage === 'Failed') {
    return 'failed' as const;
  }

  if (session.stage === 'Submitted' || session.hubspotTicketId) {
    return 'completed' as const;
  }

  return 'running' as const;
}

export function inferPublicationSourceKind(
  sourceKind?: string
): PortalSourceKind {
  if (sourceKind === 'externalUrl') {
    return 'external';
  }

  return 'portal';
}

export function buildReleaseMetadataDocument(
  bundle: PublicationBundle,
  sourceKind: PortalSourceKind
): Record<string, unknown> {
  const releaseName =
    bundle.release.localizedName ||
    bundle.release.releaseName ||
    bundle.metadata.localizedName ||
    bundle.dapp.dappName;
  const shortDescription =
    bundle.metadata.shortDescription || bundle.release.newInVersion || '';
  const longDescription =
    bundle.metadata.longDescription ||
    shortDescription ||
    bundle.dapp.description ||
    '';
  const newInVersion =
    bundle.metadata.newInVersion || bundle.release.newInVersion || '';
  const installFile = bundle.metadata.installFile;
  const image =
    bundle.dapp.dappIconUrl ||
    bundle.dapp.featureGraphicUrl ||
    bundle.dapp.bannerUrl;

  if (!image) {
    throw new Error(
      'Publication bundle did not include a public app image URL.'
    );
  }

  const publisherWebsite =
    bundle.metadata.publisherWebsite ||
    bundle.publisher.website ||
    bundle.dapp.appWebsite ||
    '';
  const licenseUrl =
    bundle.metadata.legal.licenseUrl || bundle.dapp.licenseUrl || '';
  const copyrightUrl =
    bundle.metadata.legal.copyrightUrl || bundle.dapp.copyrightUrl || '';
  const privacyPolicyUrl =
    bundle.metadata.legal.privacyPolicyUrl ||
    bundle.dapp.privacyPolicyUrl ||
    '';

  return {
    schema_version: '0.4.0',
    name: releaseName.slice(0, 32),
    description: shortDescription || longDescription || releaseName,
    image,
    properties: {
      category: 'dApp',
      creators: [
        {
          address:
            bundle.signerAuthority.dappWalletAddress ||
            bundle.signerAuthority.collectionAuthority,
          share: 100,
        },
      ],
    },
    extensions: {
      solana_dapp_store: {
        publisher_details: {
          name: bundle.publisher.name,
          ...(publisherWebsite
            ? { website: ensureHttpsUrl(publisherWebsite) }
            : {}),
          contact: bundle.publisher.email,
          support_email:
            bundle.publisher.supportEmail ||
            bundle.metadata.supportEmail ||
            bundle.publisher.email,
        },
        release_details: {
          updated_on: new Date().toISOString(),
          ...(licenseUrl ? { license_url: ensureHttpsUrl(licenseUrl) } : {}),
          ...(copyrightUrl ? { copyright_url: copyrightUrl } : {}),
          ...(privacyPolicyUrl
            ? { privacy_policy_url: ensureHttpsUrl(privacyPolicyUrl) }
            : {}),
          localized_resources: {
            short_description: '5',
            long_description: '1',
            new_in_version: '2',
            name: '4',
          },
        },
        media: bundle.metadata.media ?? [],
        files: [
          {
            mime: installFile.mimeType || inferMimeType(installFile.fileName),
            purpose: 'install',
            size: installFile.size ?? 0,
            sha256: installFile.sha256 || '',
            uri: installFile.url,
          },
        ],
        android_details: {
          android_package: bundle.release.androidPackage,
          version_code: bundle.release.versionCode,
          version: bundle.release.versionName,
          min_sdk: bundle.release.minSdkVersion ?? 1,
          cert_fingerprint: bundle.release.certificateFingerprint || '',
          permissions: bundle.release.permissions ?? [],
          locales: bundle.release.locales ?? bundle.dapp.languages ?? ['en-US'],
        },
      },
      i18n: {
        'en-US': {
          '1': longDescription,
          '2': newInVersion,
          '4': releaseName,
          '5': shortDescription.slice(0, 50),
        },
      },
    },
    __origin: sourceKind,
  };
}

export function mapBackendBundleToPublicationBundle(
  backendBundle: Record<string, unknown>,
  releaseMetadataUri: string,
  sourceKind: PortalSourceKind
): PublicationBundle {
  const release = isRecord(backendBundle.release) ? backendBundle.release : {};
  const dapp = isRecord(backendBundle.dapp) ? backendBundle.dapp : {};
  const publisher = isRecord(backendBundle.publisher)
    ? backendBundle.publisher
    : {};
  const installFile = isRecord(backendBundle.installFile)
    ? backendBundle.installFile
    : {};
  const signerAuthority = isRecord(backendBundle.signerAuthority)
    ? backendBundle.signerAuthority
    : {};
  const installFileDetails = buildInstallFileDetails(release, installFile);

  const releaseName =
    (typeof release.localizedName === 'string' && release.localizedName) ||
    (typeof dapp.dappName === 'string' && dapp.dappName) ||
    'Release update';
  const shortDescription =
    (typeof release.shortDescription === 'string' &&
      release.shortDescription) ||
    (typeof dapp.subtitle === 'string' && dapp.subtitle) ||
    asString(dapp.description || '').slice(0, 50);
  const localizedShortDescription =
    (typeof release.shortDescription === 'string' &&
      release.shortDescription) ||
    asString(dapp.description || '').slice(0, 50);
  const longDescription =
    (typeof release.longDescription === 'string' && release.longDescription) ||
    asString(dapp.description || '');
  const newInVersion =
    (typeof release.newInVersion === 'string' && release.newInVersion) || '';

  return {
    ingestionSessionId: asString(backendBundle.ingestionSessionId || ''),
    publicationSessionId: asString(backendBundle.publicationSessionId || ''),
    releaseId: asString(backendBundle.releaseId || release.id || ''),
    dapp: {
      id: asString(dapp.id || ''),
      dappName: asString(dapp.dappName || releaseName),
      subtitle: optionalString(dapp.subtitle),
      description: asString(dapp.description || ''),
      androidPackage: asString(
        dapp.androidPackage || release.androidPackage || ''
      ),
      dappIconUrl: optionalString(dapp.dappIconUrl),
      dappPreviewUrls: stringArray(dapp.dappPreviewUrls),
      bannerUrl: optionalString(dapp.bannerUrl),
      featureGraphicUrl: optionalString(dapp.featureGraphicUrl),
      editorsChoiceGraphicUrl: optionalString(dapp.editorsChoiceGraphicUrl),
      appWebsite: optionalString(dapp.appWebsite),
      contactEmail: optionalString(dapp.contactEmail),
      supportEmail: asString(dapp.supportEmail || publisher.supportEmail || ''),
      languages: stringArray(dapp.languages),
      licenseUrl: optionalString(dapp.licenseUrl),
      copyrightUrl: optionalString(dapp.copyrightUrl),
      privacyPolicyUrl: optionalString(dapp.privacyPolicyUrl),
      walletAddress: asString(dapp.walletAddress || ''),
      nftMintAddress: asString(dapp.nftMintAddress || ''),
      lastApprovedReleaseId: optionalString(dapp.lastApprovedReleaseId),
      website: optionalString(dapp.website || dapp.appWebsite),
    },
    publisher: {
      id: asString(publisher.id || ''),
      type:
        publisher.type === 'organization' || publisher.type === 'individual'
          ? publisher.type
          : 'organization',
      name: asString(publisher.name || ''),
      website: asString(publisher.website || ''),
      email: asString(publisher.email || ''),
      supportEmail: asString(
        publisher.supportEmail || dapp.supportEmail || publisher.email || ''
      ),
    },
    installFile: {
      uri: installFileDetails.url,
      mimeType: installFileDetails.mimeType,
      size: installFileDetails.size,
      sha256: installFileDetails.sha256,
      fileName: installFileDetails.fileName,
      canonicalUrl: installFileDetails.canonicalUrl,
      url: installFileDetails.url,
      origin: sourceKind,
    },
    metadata: {
      localizedName: releaseName,
      shortDescription,
      longDescription,
      newInVersion,
      publisherWebsite: optionalString(publisher.website),
      supportEmail: optionalString(publisher.supportEmail),
      website: optionalString(dapp.appWebsite),
      locales: stringArray(dapp.languages),
      legal: {
        licenseUrl: optionalString(dapp.licenseUrl),
        copyrightUrl: optionalString(dapp.copyrightUrl),
        privacyPolicyUrl: optionalString(dapp.privacyPolicyUrl),
      },
      media: [],
      installFile: {
        url: installFileDetails.url,
        fileName: installFileDetails.fileName,
        mimeType: installFileDetails.mimeType,
        size: installFileDetails.size,
        sha256: installFileDetails.sha256,
        canonicalUrl: installFileDetails.canonicalUrl,
        origin: sourceKind,
      },
      localizedStrings: [
        {
          locale: 'en-US',
          name: releaseName,
          shortDescription: localizedShortDescription,
          longDescription,
          newInVersion,
        },
      ],
      releaseMetadataUri:
        releaseMetadataUri ||
        (typeof release.nftMetadataUri === 'string'
          ? release.nftMetadataUri
          : null),
    },
    signerAuthority: {
      dappWalletAddress: asString(
        signerAuthority.dappWalletAddress ||
          signerAuthority.requiredSigner ||
          dapp.walletAddress ||
          ''
      ),
      collectionAuthority: asString(
        signerAuthority.collectionAuthority ||
          signerAuthority.dappWalletAddress ||
          dapp.walletAddress ||
          ''
      ),
      appMintAddress: asString(
        signerAuthority.appMintAddress || dapp.nftMintAddress || ''
      ),
      sameSignerRequired:
        typeof signerAuthority.sameSignerRequired === 'boolean'
          ? signerAuthority.sameSignerRequired
          : true,
      acceptedSignerRoles: Array.isArray(signerAuthority.acceptedSignerRoles)
        ? (signerAuthority.acceptedSignerRoles as Array<'publisher' | 'payer'>)
        : ['publisher', 'payer'],
      dappId: asString(dapp.id || ''),
      requiredSigner:
        typeof signerAuthority.requiredSigner === 'string'
          ? signerAuthority.requiredSigner
          : asString(
              signerAuthority.dappWalletAddress ||
                signerAuthority.collectionAuthority ||
                dapp.walletAddress ||
                ''
            ),
      mintSigner:
        typeof signerAuthority.mintSigner === 'string'
          ? signerAuthority.mintSigner
          : asString(
              signerAuthority.dappWalletAddress ||
                signerAuthority.collectionAuthority ||
                dapp.walletAddress ||
                ''
            ),
      feePayer: optionalString(signerAuthority.feePayer),
    },
    release: {
      id: asString(release.id || backendBundle.releaseId || ''),
      dappId: asString(release.dappId || dapp.id || ''),
      releaseFileUrl: optionalString(
        typeof release.releaseFileUrl === 'string'
          ? release.releaseFileUrl
          : installFileDetails.url
      ),
      releaseFileName: asString(
        typeof release.releaseFileName === 'string'
          ? release.releaseFileName
          : installFileDetails.fileName
      ),
      releaseFileSize: numberOrDefault(
        release.releaseFileSize || installFileDetails.size,
        installFileDetails.size
      ),
      releaseFileHash:
        typeof release.releaseFileHash === 'string'
          ? release.releaseFileHash
          : installFileDetails.sha256,
      releaseName,
      versionName:
        (typeof release.versionName === 'string' && release.versionName) ||
        asString(release.versionCode || '1'),
      versionCode: numberOrDefault(release.versionCode, 1),
      androidPackage: asString(
        release.androidPackage || dapp.androidPackage || ''
      ),
      minSdkVersion:
        typeof release.minSdkVersion === 'number'
          ? release.minSdkVersion
          : null,
      targetSdkVersion:
        typeof release.targetSdkVersion === 'number'
          ? release.targetSdkVersion
          : null,
      permissions: stringArray(release.permissions),
      locales: stringArray(release.locales),
      certificateFingerprint:
        typeof release.certificateFingerprint === 'string'
          ? release.certificateFingerprint
          : null,
      shortDescription:
        typeof release.shortDescription === 'string'
          ? release.shortDescription
          : null,
      longDescription:
        typeof release.longDescription === 'string'
          ? release.longDescription
          : null,
      localizedName:
        (typeof release.localizedName === 'string' && release.localizedName) ||
        releaseName,
      newInVersion,
      sagaFeatures:
        typeof release.sagaFeatures === 'string' ? release.sagaFeatures : null,
      status: typeof release.status === 'string' ? release.status : undefined,
      processingError: optionalString(release.processingError),
      processedAt: optionalString(release.processedAt),
      releaseMintAddress: optionalString(release.nftMintAddress),
      releaseMetadataUri:
        releaseMetadataUri ||
        (typeof release.nftMetadataUri === 'string'
          ? release.nftMetadataUri
          : null),
      nftMintAddress: optionalString(release.nftMintAddress),
      nftTransactionSignature: optionalString(release.nftTransactionSignature),
      nftMetadataUri: optionalString(release.nftMetadataUri),
      nftCluster: optionalString(release.nftCluster),
      isCollectionVerified:
        typeof release.isCollectionVerified === 'boolean'
          ? release.isCollectionVerified
          : undefined,
      uploadProvider:
        release.uploadProvider === 'Arweave' ||
        release.uploadProvider === 'S3' ||
        release.uploadProvider === 'R2' ||
        release.uploadProvider === 'IPFS'
          ? release.uploadProvider
          : null,
      uploadProviderId: optionalString(release.uploadProviderId),
      publishedAt: optionalString(release.publishedAt),
      rejectedAt: optionalString(release.rejectedAt),
      rejectionReason: optionalString(release.rejectionReason),
      submissionStatus:
        typeof release.submissionStatus === 'string'
          ? release.submissionStatus
          : undefined,
      hubspotTicketId: optionalString(release.hubspotTicketId),
      submittedAt: optionalString(release.submittedAt),
      reviewStartedAt: optionalString(release.reviewStartedAt),
      reviewCompletedAt: optionalString(release.reviewCompletedAt),
      source:
        release.source === 'Portal' || release.source === 'Hubspot'
          ? release.source
          : undefined,
      created: optionalString(release.created) || undefined,
      updated: optionalString(release.updated) || undefined,
      isLive: typeof release.isLive === 'boolean' ? release.isLive : undefined,
      liveVersionComparison:
        typeof release.liveVersionComparison === 'string'
          ? release.liveVersionComparison
          : undefined,
    },
  };
}

export function translateBackendPublicationSession(
  backendSession: Record<string, unknown>
): PublicationSession {
  const stage =
    typeof backendSession.stage === 'string'
      ? backendSession.stage
      : 'PreparedForMint';

  return {
    id: asString(backendSession.id || ''),
    ingestionSessionId: asString(backendSession.ingestionSessionId || ''),
    releaseId: asString(backendSession.releaseId || ''),
    status: normalizePublicationStatus({
      stage,
      hubspotTicketId: optionalString(backendSession.hubspotTicketId),
    }),
    checkpoint: normalizePublicationCheckpoint({
      stage,
      mintTransactionSignature: optionalString(
        backendSession.mintTransactionSignature
      ),
      verificationTransactionSignature: optionalString(
        backendSession.verificationTransactionSignature
      ),
      attestationRequestUniqueId: optionalString(
        backendSession.attestationRequestUniqueId
      ),
      hubspotTicketId: optionalString(backendSession.hubspotTicketId),
      expectedMintAddress: optionalString(backendSession.expectedMintAddress),
      metadataUri: optionalString(backendSession.metadataUri),
    }),
    metadataUri: optionalString(backendSession.metadataUri),
    releaseMintAddress: optionalString(backendSession.expectedMintAddress),
    collectionMintAddress: null,
    mintTransactionSignature: optionalString(
      backendSession.mintTransactionSignature
    ),
    verifyTransactionSignature: optionalString(
      backendSession.verificationTransactionSignature
    ),
    attestationRequestUniqueId: optionalString(
      backendSession.attestationRequestUniqueId
    ),
    attestationPayload: null,
    hubspotTicketId: optionalString(backendSession.hubspotTicketId),
    error: optionalString(backendSession.lastError),
    created:
      typeof backendSession.created === 'string'
        ? backendSession.created
        : new Date().toISOString(),
    updated:
      typeof backendSession.updated === 'string'
        ? backendSession.updated
        : new Date().toISOString(),
    createdAt:
      typeof backendSession.created === 'string'
        ? backendSession.created
        : undefined,
    updatedAt:
      typeof backendSession.updated === 'string'
        ? backendSession.updated
        : undefined,
  };
}

function translateIngestionSource(
  backendSession: Record<string, unknown>
): PublicationSource {
  const sourceKind =
    typeof backendSession.sourceKind === 'string'
      ? backendSession.sourceKind
      : 'portalUpload';
  const sourceUrl =
    typeof backendSession.sourceUrl === 'string'
      ? backendSession.sourceUrl
      : '';

  return {
    kind:
      sourceKind === 'externalUrl'
        ? ('apk-url' as const)
        : sourceKind === 'existingRelease'
        ? ('existingRelease' as const)
        : ('apk-file' as const),
    filePath:
      sourceKind === 'existingRelease'
        ? asString(backendSession.releaseId || '')
        : sourceUrl,
    fileName:
      typeof backendSession.releaseFileName === 'string'
        ? backendSession.releaseFileName
        : inferFileNameFromUrl(sourceUrl),
    url: sourceUrl,
    mimeType: inferMimeType(
      typeof backendSession.releaseFileName === 'string'
        ? backendSession.releaseFileName
        : inferFileNameFromUrl(sourceUrl)
    ),
    size:
      typeof backendSession.releaseFileSize === 'number'
        ? backendSession.releaseFileSize
        : undefined,
    sha256:
      typeof backendSession.releaseFileHash === 'string'
        ? backendSession.releaseFileHash
        : undefined,
    canonicalUrl:
      typeof backendSession.canonicalSourceUrl === 'string'
        ? backendSession.canonicalSourceUrl
        : undefined,
    sourceReleaseId: asString(backendSession.releaseId || ''),
  } as
    | {
        kind: 'apk-file';
        fileName: string;
        filePath: string;
        mimeType?: string;
        size?: number;
        sha256?: string;
      }
    | {
        kind: 'apk-url';
        url: string;
        fileName?: string;
        mimeType?: string;
        size?: number;
        sha256?: string;
        canonicalUrl?: string;
      }
    | {
        kind: 'existingRelease';
        sourceReleaseId: string;
      };
}

export function translateBackendIngestionSession(
  backendSession: Record<string, unknown>,
  bundle?: Record<string, unknown>,
  publicationSession?: Record<string, unknown>
): PublicationIngestionSession & {
  bundle?: PublicationBundle;
  publicationSession?: PublicationSession;
} {
  const sourceKind =
    typeof backendSession.sourceKind === 'string'
      ? backendSession.sourceKind
      : 'portalUpload';
  const translatedPublicationSession = publicationSession
    ? translateBackendPublicationSession(publicationSession)
    : undefined;
  const translatedBundle = bundle
    ? {
        ...mapBackendBundleToPublicationBundle(
          bundle,
          firstString(publicationSession, ['metadataUri']) ||
            firstString(bundle, ['release.nftMetadataUri']) ||
            '',
          inferPublicationSourceKind(sourceKind)
        ),
        ingestionSessionId: asString(backendSession.id || ''),
        publicationSessionId:
          typeof backendSession.publicationSessionId === 'string'
            ? backendSession.publicationSessionId
            : translatedPublicationSession?.id || '',
        releaseId:
          typeof backendSession.releaseId === 'string'
            ? backendSession.releaseId
            : firstString(bundle, ['release.id']) || '',
      }
    : undefined;

  return {
    id: asString(backendSession.id || ''),
    dappId: asString(backendSession.dappId || ''),
    idempotencyKey: asString(backendSession.idempotencyKey || ''),
    source: translateIngestionSource(backendSession),
    whatsNew: asString(backendSession.whatsNew || ''),
    status:
      backendSession.status === 'Failed'
        ? 'failed'
        : backendSession.status === 'Ready'
        ? 'ready'
        : backendSession.status === 'Processing'
        ? 'processing'
        : 'created',
    publicationSessionId:
      typeof backendSession.publicationSessionId === 'string'
        ? backendSession.publicationSessionId
        : translatedPublicationSession?.id ?? null,
    releaseId:
      typeof backendSession.releaseId === 'string'
        ? backendSession.releaseId
        : translatedBundle?.releaseId ??
          translatedPublicationSession?.releaseId ??
          null,
    processingError: optionalString(backendSession.processingError),
    processingProgress:
      typeof backendSession.processingProgress === 'number'
        ? backendSession.processingProgress
        : null,
    processingStage: optionalString(backendSession.processingStage),
    processingDetail: optionalString(backendSession.processingDetail),
    error: optionalString(backendSession.processingError),
    createdAt:
      typeof backendSession.created === 'string'
        ? backendSession.created
        : undefined,
    updatedAt:
      typeof backendSession.updated === 'string'
        ? backendSession.updated
        : undefined,
    ...(translatedBundle ? { bundle: translatedBundle } : {}),
    ...(translatedPublicationSession
      ? { publicationSession: translatedPublicationSession }
      : {}),
  };
}
