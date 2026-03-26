import type { Transaction } from '@solana/web3.js';

export type PublicationSource =
  | {
      kind: 'portalUpload';
      releaseFileUrl: string;
      releaseFileName: string;
      releaseFileSize: number;
      releaseFileHash?: string;
      contentType?: string;
    }
  | {
      kind: 'externalUrl';
      apkUrl: string;
      releaseFileName?: string;
    }
  | {
      kind: 'existingRelease';
      sourceReleaseId: string;
    }
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
    };

export type PublicationCreateUploadTargetInput = {
  fileHash: string;
  fileExtension: string;
  contentType: string;
};

export type PublicationCreateUploadTargetResult = {
  uploadUrl: string;
  key: string;
  providerId: string;
  publicUrl: string;
};

export type PublicationInstallFile = {
  uri: string;
  mimeType: string;
  size: number;
  sha256?: string | null;
  fileName?: string;
  canonicalUrl?: string;
  url?: string;
  origin?: 'portal' | 'external';
};

export type PublicationMediaAsset = {
  purpose: 'icon' | 'screenshot' | 'banner' | 'featureGraphic';
  uri: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
  sha256?: string;
  width?: number;
  height?: number;
};

export type PublicationLegalBundle = {
  licenseUrl?: string | null;
  copyrightUrl?: string | null;
  privacyPolicyUrl?: string | null;
};

export type PublicationLocalizedStrings = {
  locale: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  newInVersion: string;
};

export type PublicationMetadataBundle = {
  localizedName: string;
  shortDescription: string;
  longDescription: string;
  newInVersion: string;
  publisherWebsite?: string | null;
  supportEmail?: string | null;
  website?: string | null;
  locales: string[];
  legal: PublicationLegalBundle;
  media: PublicationMediaAsset[];
  installFile: PublicationInstallFile;
  localizedStrings: PublicationLocalizedStrings[];
  releaseMetadataUri?: string | null;
};

export type PublicationSignerAuthorityBundle = {
  dappWalletAddress: string;
  collectionAuthority: string;
  appMintAddress: string;
  sameSignerRequired: boolean;
  acceptedSignerRoles: Array<'publisher' | 'payer'>;
  dappId?: string;
  requiredSigner?: string;
  mintSigner?: string | null;
  feePayer?: string | null;
};

export type PublicationIngestionSessionStatus =
  | 'Created'
  | 'Processing'
  | 'Ready'
  | 'Failed'
  | 'created'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed';

export type PublicationCheckpoint =
  | 'created'
  | 'bundle-ready'
  | 'mint-submitted'
  | 'mint-saved'
  | 'verification-submitted'
  | 'verified'
  | 'attested'
  | 'submitted'
  | 'completed';

export type PublicationSessionStage =
  | 'PreparedForMint'
  | 'MintSubmitted'
  | 'MintSaved'
  | 'VerificationSubmitted'
  | 'Verified'
  | 'Attested'
  | 'Submitted'
  | 'Failed';

export type PublicationSessionStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed';

export type PublicationIngestionSession = {
  id: string;
  publisherUserJoinId?: string | null;
  sourceKind?: 'portalUpload' | 'externalUrl' | 'existingRelease';
  source?: PublicationSource;
  dappId?: string | null;
  status: PublicationIngestionSessionStatus;
  idempotencyKey: string;
  whatsNew: string;
  sourceUrl?: string | null;
  canonicalSourceUrl?: string | null;
  releaseFileName?: string | null;
  releaseFileSize?: number | null;
  releaseFileHash?: string | null;
  androidPackage?: string | null;
  versionName?: string | null;
  versionCode?: number | null;
  processingError?: string | null;
  releaseId?: string | null;
  publicationSessionId?: string | null;
  bundle?: PublicationBundle;
  publicationSession?: PublicationSession;
  created?: string;
  updated?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string | null;
};

export type PublicationSession = {
  id: string;
  releaseId: string;
  ingestionSessionId?: string | null;
  stage?: PublicationSessionStage;
  expectedMintAddress?: string | null;
  metadataUri?: string | null;
  signerAddress?: string | null;
  mintTransactionSignature?: string | null;
  verificationTransactionSignature?: string | null;
  attestationRequestUniqueId?: string | null;
  hubspotTicketId?: string | null;
  lastError?: string | null;
  created: string;
  updated: string;
  checkpoint?: PublicationCheckpoint;
  status?: PublicationSessionStatus;
  releaseMintAddress?: string | null;
  collectionMintAddress?: string | null;
  verifyTransactionSignature?: string | null;
  attestationPayload?: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicationBundle = {
  ingestionSessionId: string;
  publicationSessionId: string;
  releaseId: string;
  dapp: {
    id: string;
    dappName: string;
    subtitle?: string | null;
    description?: string | null;
    androidPackage: string;
    dappIconUrl?: string | null;
    dappPreviewUrls?: string[];
    bannerUrl?: string | null;
    featureGraphicUrl?: string | null;
    appWebsite?: string | null;
    contactEmail?: string | null;
    supportEmail?: string | null;
    languages?: string[];
    licenseUrl?: string | null;
    copyrightUrl?: string | null;
    privacyPolicyUrl?: string | null;
    walletAddress?: string | null;
    nftMintAddress?: string | null;
    lastApprovedReleaseId?: string | null;
    website?: string | null;
  };
  publisher: {
    id: string;
    type: 'organization' | 'individual';
    name: string;
    website: string;
    email: string;
    supportEmail?: string | null;
  };
  installFile: PublicationInstallFile;
  signerAuthority: PublicationSignerAuthorityBundle;
  release: {
    id?: string;
    dappId?: string;
    releaseFileUrl?: string;
    releaseFileName?: string;
    releaseFileSize?: number;
    releaseFileHash?: string | null;
    androidPackage: string;
    versionName: string;
    versionCode: number;
    minSdkVersion?: number | null;
    targetSdkVersion?: number | null;
    permissions?: string[];
    locales?: string[];
    certificateFingerprint?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    newInVersion: string;
    sagaFeatures?: string | null;
    localizedName: string;
    status?: string;
    processingError?: string | null;
    processedAt?: string | null;
    releaseMintAddress?: string | null;
    releaseMetadataUri?: string | null;
    nftMintAddress?: string | null;
    nftTransactionSignature?: string | null;
    nftMetadataUri?: string | null;
    nftCluster?: string | null;
    isCollectionVerified?: boolean;
    uploadProvider?: 'Arweave' | 'S3' | 'R2' | 'IPFS' | null;
    uploadProviderId?: string | null;
    publishedAt?: string | null;
    rejectedAt?: string | null;
    rejectionReason?: string | null;
    submissionStatus?: string;
    hubspotTicketId?: string | null;
    submittedAt?: string | null;
    reviewStartedAt?: string | null;
    reviewCompletedAt?: string | null;
    source?: 'Portal' | 'Hubspot';
    created?: string;
    updated?: string;
    isLive?: boolean;
    liveVersionComparison?: string;
    releaseName?: string;
  };
  metadata?: PublicationMetadataBundle;
};

export type PublicationPreparedReleaseTransaction = {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  mintAddress: string;
  metadataUri: string;
};

export type PublicationPreparedVerifyCollectionTransaction = {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
};

export type PublicationSubmitSignedTransactionResult = {
  transactionSignature: string;
};

export type PublicationSaveReleaseNftDataResult = {
  success: boolean;
  releaseId: string;
  mintAddress: string;
};

export type PublicationMarkReleaseCollectionAsVerifiedResult = {
  success: boolean;
  releaseId: string;
};

export type PublicationSubmitToStoreResult = {
  success: boolean;
  hubspotTicketId?: string;
  message: string;
};

export type PublicationCreateIngestionSessionInput = {
  source: PublicationSource;
  whatsNew: string;
  idempotencyKey: string;
  dappId?: string;
};

export type PublicationGetIngestionSessionInput = {
  sessionId: string;
};

export type PublicationGetBundleInput = {
  releaseId: string;
};

export type PublicationGetSessionInput = {
  publicationSessionId?: string;
  releaseId?: string;
};

export type PublicationPrepareReleaseNftTransactionInput = {
  releaseId: string;
  releaseName: string;
  releaseMetadataUri: string;
  appMintAddress: string;
  publisherAddress: string;
  payerAddress: string;
};

export type PublicationPrepareVerifyCollectionTransactionInput = {
  dappId: string;
  nftMintAddress: string;
  collectionMintAddress: string;
  collectionAuthority: string;
  payerAddress: string;
};

export type PublicationSaveReleaseNftDataInput = {
  releaseId: string;
  mintAddress: string;
  transactionSignature: string;
  metadataUri: string;
  ownerAddress: string;
  releaseName: string;
  releaseVersion: string;
  androidPackage: string;
  appMintAddress: string;
  uploadProvider?: 'Arweave' | 'S3' | 'R2' | 'IPFS';
  uploadProviderId?: string;
};

export type PublicationSubmitToStoreInput = {
  releaseId: string;
  whatsNew?: string;
  criticalUpdate?: boolean;
  testingInstructions?: string;
  attestation: {
    payload: string;
    requestUniqueId: string;
  };
  isResubmission?: boolean;
};

export type PublicationSigner = {
  publicKey: string;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export type PublicationAttestationBlockData = {
  slot: number;
  blockhash: string;
};

export type PublicationAttestationClient = {
  getBlockData(): Promise<PublicationAttestationBlockData>;
};

export type PublicationWorkflowResult = {
  ingestionSessionId: string;
  publicationSessionId: string;
  releaseId: string;
  releaseMintAddress: string;
  collectionMintAddress: string;
  releaseTransactionSignature?: string;
  collectionTransactionSignature?: string;
  attestationRequestUniqueId?: string;
  hubspotTicketId?: string;
  publicationBundle: PublicationBundle;
  publicationSession: PublicationSession;
};

export type PublicationWorkflowLogger = {
  debug?: (message: string, metadata?: Record<string, unknown>) => void;
  info?: (message: string, metadata?: Record<string, unknown>) => void;
  warn?: (message: string, metadata?: Record<string, unknown>) => void;
};
