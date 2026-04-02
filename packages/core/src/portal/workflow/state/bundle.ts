import type {
  PublicationBundle,
  PublicationSession,
  PublicationSigner,
} from "../../types.js";
import { inferFileNameFromUrl } from "../source/files.js";

function normalizePublicationMetadata(
  bundle: PublicationBundle
): PublicationBundle["metadata"] {
  if (bundle.metadata) {
    return bundle.metadata;
  }

  return {
    localizedName:
      bundle.release.localizedName ??
      bundle.release.releaseName ??
      bundle.dapp.dappName,
    shortDescription: bundle.dapp.subtitle ?? "",
    longDescription: bundle.dapp.description ?? "",
    newInVersion: bundle.release.newInVersion,
    publisherWebsite: bundle.publisher.website,
    supportEmail:
      bundle.publisher.supportEmail ?? bundle.dapp.supportEmail ?? null,
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
      fileName:
        bundle.installFile.fileName ??
        inferFileNameFromUrl(bundle.installFile.uri),
      canonicalUrl: bundle.installFile.canonicalUrl ?? bundle.installFile.uri,
      url: bundle.installFile.uri,
      origin: "portal",
    },
    localizedStrings: [],
    releaseMetadataUri:
      bundle.release.releaseMetadataUri ??
      bundle.release.nftMetadataUri ??
      null,
  };
}

function getReleaseMetadataUri(
  bundle: PublicationBundle,
  session?: PublicationSession
): string | null {
  return (
    session?.metadataUri ??
    bundle.release.releaseMetadataUri ??
    bundle.release.nftMetadataUri ??
    bundle.metadata?.releaseMetadataUri ??
    null
  );
}

export function normalizePublicationBundle(
  bundle: PublicationBundle
): PublicationBundle {
  return {
    ...bundle,
    releaseId: bundle.releaseId || bundle.release.id || "",
    metadata: normalizePublicationMetadata(bundle),
  };
}

export function withPublicationBundleIdentifiers(
  bundle: PublicationBundle,
  identifiers: {
    releaseId?: string | null;
    publicationSessionId?: string | null;
    ingestionSessionId?: string | null;
  }
): PublicationBundle {
  return {
    ...bundle,
    releaseId:
      bundle.releaseId || bundle.release.id || identifiers.releaseId || "",
    publicationSessionId:
      bundle.publicationSessionId || identifiers.publicationSessionId || "",
    ingestionSessionId:
      bundle.ingestionSessionId || identifiers.ingestionSessionId || "",
  };
}

export function resolveReleaseMetadataUri(
  bundle: PublicationBundle,
  session?: PublicationSession
): string {
  const releaseMetadataUri = getReleaseMetadataUri(bundle, session);

  if (!releaseMetadataUri) {
    throw new Error(
      "Publication bundle did not include a release metadata URI"
    );
  }

  return releaseMetadataUri;
}

export function hasResolvableReleaseMetadataUri(
  bundle: PublicationBundle,
  session?: PublicationSession
): boolean {
  return Boolean(getReleaseMetadataUri(bundle, session));
}

export function resolvePublicationSignerAddress(
  bundle: PublicationBundle
): string {
  return (
    bundle.signerAuthority.dappWalletAddress ??
    bundle.signerAuthority.requiredSigner ??
    bundle.signerAuthority.collectionAuthority
  );
}

export function resolveReleaseDisplayName(bundle: PublicationBundle): string {
  return (
    bundle.release.localizedName ??
    bundle.release.releaseName ??
    bundle.dapp.dappName
  );
}

export function resolvePublicationFeePayer(
  bundle: PublicationBundle,
  signer: PublicationSigner
): string {
  return bundle.signerAuthority.feePayer ?? signer.publicKey;
}

export function validatePublicationBundle(bundle: PublicationBundle): void {
  const normalizedBundle = normalizePublicationBundle(bundle);
  const requiredFields: Array<[string, unknown]> = [
    ["releaseId", normalizedBundle.releaseId],
    ["publicationSessionId", normalizedBundle.publicationSessionId],
    ["ingestionSessionId", normalizedBundle.ingestionSessionId],
    ["androidPackage", normalizedBundle.release.androidPackage],
    [
      "release.localizedName",
      normalizedBundle.release.localizedName ??
        normalizedBundle.release.releaseName,
    ],
    ["versionName", normalizedBundle.release.versionName],
    ["appMintAddress", normalizedBundle.signerAuthority.appMintAddress],
    ["dappWalletAddress", normalizedBundle.signerAuthority.dappWalletAddress],
    [
      "collectionAuthority",
      normalizedBundle.signerAuthority.collectionAuthority,
    ],
    [
      "acceptedSignerRoles",
      normalizedBundle.signerAuthority.acceptedSignerRoles,
    ],
    ["metadata.localizedName", normalizedBundle.metadata?.localizedName],
    ["shortDescription", normalizedBundle.metadata?.shortDescription],
    ["longDescription", normalizedBundle.metadata?.longDescription],
    ["newInVersion", normalizedBundle.metadata?.newInVersion],
    ["installFile.uri", normalizedBundle.installFile.uri],
    ["installFile.mimeType", normalizedBundle.installFile.mimeType],
  ];

  const missing = requiredFields.filter(([, value]) => {
    if (typeof value === "string") {
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
        .join(", ")}`
    );
  }
}
