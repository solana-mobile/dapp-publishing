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
  /**
   * Set when `uploadUrl` writes to a staging key rather than to `key`. Such an
   * upload only becomes readable at `publicUrl` once it has been finalized.
   */
  stagingKey?: string;
};

export type PublicationFinalizeUploadInput =
  PublicationCreateUploadTargetInput & {
    stagingKey: string;
  };

export type PublicationFinalizeUploadResult = {
  key: string;
  providerId: string;
  publicUrl: string;
  reused: boolean;
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
  processingProgress?: number | null;
  processingStage?: string | null;
  processingDetail?: string | null;
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
  hubspotTicketId?: string | null;
  lastError?: string | null;
  created: string;
  updated: string;
  checkpoint?: PublicationCheckpoint;
  status?: PublicationSessionStatus;
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
    editorsChoiceGraphicUrl?: string | null;
    appWebsite?: string | null;
    contactEmail?: string | null;
    supportEmail?: string | null;
    languages?: string[];
    licenseUrl?: string | null;
    copyrightUrl?: string | null;
    privacyPolicyUrl?: string | null;
    walletAddress?: string | null;
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

export type PublicationGetIngestionSessionInput =
  | {
      sessionId: string;
      ingestionSessionId?: string;
    }
  | {
      sessionId?: string;
      ingestionSessionId: string;
    };

export type PublicationGetSessionInput = {
  publicationSessionId?: string;
  releaseId?: string;
};

export type PublicationCleanupReleaseInput = {
  releaseId: string;
};

export type PublicationCleanupReleaseResult = {
  success: boolean;
  releaseId: string;
  action: 'deleted' | 'preservedSubmitted';
  message: string;
};

export type PublicationSubmitToStoreInput = {
  releaseId: string;
  whatsNew?: string;
  criticalUpdate?: boolean;
  testingInstructions?: string;
  isResubmission?: boolean;
};

export type PublicationWorkflowResult = {
  ingestionSessionId: string;
  publicationSessionId: string;
  releaseId: string;
  hubspotTicketId?: string;
  publicationSession: PublicationSession;
};

export type PublicationWorkflowLogger = {
  debug?: (message: string, metadata?: Record<string, unknown>) => void;
  info?: (message: string, metadata?: Record<string, unknown>) => void;
  warn?: (message: string, metadata?: Record<string, unknown>) => void;
};
