import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  PublicationBundle,
  PublicationCreateUploadTargetInput,
  PublicationCreateUploadTargetResult,
} from "@solana-mobile/dapp-store-publishing-tools";
import getVideoDimensions from "get-video-dimensions";
import { imageSize } from "image-size";

import {
  ensureHttpsUrl,
  inferFileNameFromUrl,
  inferMimeType,
} from "./files.js";
import { uploadBytes } from "./http.js";
import { firstString, readDeep } from "./records.js";
import type { PortalSourceKind } from "./types.js";

const NFT_SCHEMA_VERSION = "0.4.0";
const DEFAULT_R2_PUBLIC_HOSTS = [
  "r2.solanamobiledappstore.com",
  "r2-staging.solanamobiledappstore.com",
];

type RemoteFilePayload = {
  data: string;
  fileName: string;
  mimeType: string;
};

export type ReleaseMetadataPortalClient = {
  createUploadTarget(
    input: PublicationCreateUploadTargetInput
  ): Promise<PublicationCreateUploadTargetResult>;
  fetchRemoteFile(input: {
    url: string;
    fileName?: string;
    expectedMimeType?: string;
  }): Promise<RemoteFilePayload>;
};

type PublicationMediaPurpose =
  | "icon"
  | "screenshot"
  | "banner"
  | "featureGraphic";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeMimeType(value?: string | null): string | undefined {
  return value?.split(";")[0]?.trim().toLowerCase();
}

function toPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isR2PublicUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DEFAULT_R2_PUBLIC_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

function inferExtensionFromMimeType(mimeType: string): string | undefined {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "application/json":
      return "json";
    default: {
      const subtype = mimeType
        .split("/")[1]
        ?.split("+")[0]
        ?.trim()
        .toLowerCase();
      return subtype?.replace(/[^a-z0-9]/g, "") || undefined;
    }
  }
}

function inferUploadFileExtension(fileName: string, mimeType: string): string {
  const byName = fileName.split(".").pop()?.trim().toLowerCase();
  if (byName && /^[a-z0-9]+$/.test(byName)) {
    return byName;
  }

  return inferExtensionFromMimeType(mimeType) || "bin";
}

function normalizeOptionalUrl(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return ensureHttpsUrl(trimmed);
}

function normalizeReleaseName(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 32 ? trimmed : trimmed.slice(0, 32);
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

async function getVideoMediaDimensions(
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string
): Promise<{ width: number; height: number }> {
  const tempFilePath = path.join(
    os.tmpdir(),
    `dapp-store-media-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${inferUploadFileExtension(fileName, mimeType)}`
  );

  await fs.writeFile(tempFilePath, fileBytes);

  try {
    const dimensions = await getVideoDimensions(tempFilePath);
    const width = toPositiveNumber(dimensions.width);
    const height = toPositiveNumber(dimensions.height);

    if (!width || !height) {
      throw new Error(`Unable to determine video dimensions for ${fileName}`);
    }

    return { width, height };
  } finally {
    await fs.rm(tempFilePath, { force: true });
  }
}

async function getMediaDimensions(
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string
): Promise<{ width: number; height: number }> {
  if (isVideoMimeType(mimeType)) {
    return await getVideoMediaDimensions(fileBytes, fileName, mimeType);
  }

  const dimensions = imageSize(fileBytes);
  const width = toPositiveNumber(dimensions.width);
  const height = toPositiveNumber(dimensions.height);

  if (!width || !height) {
    throw new Error(`Unable to determine image dimensions for ${fileName}`);
  }

  return { width, height };
}

function getPreferredFeatureGraphicUrl(bundle: PublicationBundle): string {
  return (
    firstString(bundle, [
      "dapp.editorsChoiceGraphicUrl",
      "dapp.featureGraphicUrl",
    ]) || ""
  );
}

async function resolveMediaItem(
  client: ReleaseMetadataPortalClient,
  input: {
    defaultMimeType?: string;
    expectedMimeType?: string;
    fallbackFileName: string;
    purpose: PublicationMediaPurpose;
    uri: string;
  }
) {
  const resolvedUri = ensureHttpsUrl(input.uri);
  const isAlreadyPublicR2 = isR2PublicUrl(resolvedUri);

  let remoteFile: RemoteFilePayload;
  try {
    remoteFile = await client.fetchRemoteFile({
      url: resolvedUri,
      fileName: input.fallbackFileName,
      expectedMimeType: input.expectedMimeType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch ${input.purpose} media from ${resolvedUri}: ${message}`
    );
  }
  const fileBytes = Buffer.from(remoteFile.data, "base64");

  if (fileBytes.byteLength === 0) {
    throw new Error(`Remote media file is empty: ${resolvedUri}`);
  }

  const remoteFileName = remoteFile.fileName || input.fallbackFileName;
  const resolvedMimeType =
    normalizeMimeType(remoteFile.mimeType) ||
    input.defaultMimeType ||
    inferMimeType(remoteFileName);
  const fileHash = createHash("sha256").update(fileBytes).digest("hex");
  const dimensions = await getMediaDimensions(
    fileBytes,
    remoteFileName,
    resolvedMimeType
  );

  if (isAlreadyPublicR2) {
    return {
      mime: resolvedMimeType,
      purpose: input.purpose,
      uri: resolvedUri,
      width: dimensions.width,
      height: dimensions.height,
      sha256: fileHash,
    };
  }

  const uploadTarget = await client.createUploadTarget({
    fileHash,
    fileExtension: inferUploadFileExtension(remoteFileName, resolvedMimeType),
    contentType: resolvedMimeType,
  });

  if (!uploadTarget.uploadUrl || !uploadTarget.publicUrl) {
    throw new Error(
      `The portal did not return a valid upload target for ${input.purpose}.`
    );
  }

  await uploadBytes(uploadTarget.uploadUrl, fileBytes, resolvedMimeType);

  return {
    mime: resolvedMimeType,
    purpose: input.purpose,
    uri: uploadTarget.publicUrl,
    width: dimensions.width,
    height: dimensions.height,
    sha256: fileHash,
  };
}

export async function buildReleaseMetadataDocument(
  client: ReleaseMetadataPortalClient,
  bundle: PublicationBundle,
  sourceKind: PortalSourceKind
): Promise<Record<string, unknown>> {
  const releaseName = normalizeReleaseName(
    bundle.metadata?.localizedName ||
      bundle.release.localizedName ||
      bundle.release.releaseName ||
      bundle.dapp.dappName ||
      "Release update"
  );
  const shortDescription =
    bundle.metadata?.shortDescription ||
    bundle.release.shortDescription ||
    bundle.dapp.subtitle ||
    "Release NFT";
  const longDescription =
    bundle.metadata?.longDescription ||
    bundle.release.longDescription ||
    bundle.dapp.description ||
    shortDescription;
  const newInVersion =
    bundle.metadata?.newInVersion || bundle.release.newInVersion || "";
  const publisherAddress =
    bundle.signerAuthority.dappWalletAddress ||
    bundle.signerAuthority.collectionAuthority ||
    bundle.dapp.walletAddress ||
    "";
  const publisherName = bundle.publisher.name || "";
  const publisherWebsite = normalizeOptionalUrl(
    bundle.metadata?.publisherWebsite ||
      bundle.publisher.website ||
      bundle.dapp.appWebsite ||
      bundle.dapp.website ||
      undefined
  );
  const publisherContact =
    bundle.publisher.email ||
    bundle.dapp.contactEmail ||
    bundle.dapp.supportEmail ||
    "";
  const publisherSupportEmail =
    bundle.publisher.supportEmail ||
    bundle.metadata?.supportEmail ||
    bundle.dapp.supportEmail ||
    bundle.dapp.contactEmail ||
    bundle.publisher.email ||
    publisherContact;
  const iconUri = bundle.dapp.dappIconUrl || "";

  if (!iconUri) {
    throw new Error(
      "Publication bundle did not include a public app icon URL."
    );
  }

  const installUri =
    bundle.installFile.uri || bundle.release.releaseFileUrl || "";
  const installMimeType =
    bundle.installFile.mimeType ||
    inferMimeType(inferFileNameFromUrl(installUri));
  const installSize =
    bundle.installFile.size ?? bundle.release.releaseFileSize ?? 0;
  const installSha256 =
    bundle.installFile.sha256 || bundle.release.releaseFileHash || "";
  const androidPackage =
    bundle.release.androidPackage || bundle.dapp.androidPackage;
  const versionName = bundle.release.versionName || "";
  const versionCode = bundle.release.versionCode ?? 0;
  const minSdkVersion = bundle.release.minSdkVersion ?? 1;
  const targetSdkRaw = readDeep(bundle, "release.targetSdkVersion");
  const targetSdkVersion =
    typeof targetSdkRaw === "number"
      ? targetSdkRaw
      : Number(targetSdkRaw || 0) || null;
  const certificateFingerprint = bundle.release.certificateFingerprint || "";
  const permissions = bundle.release.permissions ?? [];
  const locales =
    bundle.release.locales && bundle.release.locales.length > 0
      ? bundle.release.locales
      : bundle.metadata?.locales && bundle.metadata.locales.length > 0
      ? bundle.metadata.locales
      : bundle.dapp.languages && bundle.dapp.languages.length > 0
      ? bundle.dapp.languages
      : ["en-US"];
  const previewUris = bundle.dapp.dappPreviewUrls ?? [];
  const bannerUri = bundle.dapp.bannerUrl || "";
  const featureGraphicUri = getPreferredFeatureGraphicUrl(bundle);

  const media: Array<Record<string, unknown>> = [];
  const iconMedia = await resolveMediaItem(client, {
    defaultMimeType: "image/png",
    fallbackFileName: "release-icon.png",
    purpose: "icon",
    uri: iconUri,
  });
  media.push(iconMedia);

  for (const [index, previewUri] of previewUris.entries()) {
    media.push(
      await resolveMediaItem(client, {
        fallbackFileName: `release-screenshot-${index + 1}`,
        purpose: "screenshot",
        uri: previewUri,
      })
    );
  }

  if (bannerUri) {
    media.push(
      await resolveMediaItem(client, {
        defaultMimeType: inferMimeType(inferFileNameFromUrl(bannerUri)),
        fallbackFileName: "release-banner.png",
        purpose: "banner",
        uri: bannerUri,
      })
    );
  }

  if (featureGraphicUri) {
    media.push(
      await resolveMediaItem(client, {
        defaultMimeType: inferMimeType(
          inferFileNameFromUrl(featureGraphicUri)
        ),
        fallbackFileName: "release-feature-graphic.png",
        purpose: "featureGraphic",
        uri: featureGraphicUri,
      })
    );
  }

  const licenseUrl = normalizeOptionalUrl(
    bundle.metadata?.legal.licenseUrl || bundle.dapp.licenseUrl || undefined
  );
  const copyrightUrl =
    bundle.metadata?.legal.copyrightUrl ||
    bundle.dapp.copyrightUrl ||
    undefined;
  const privacyPolicyUrl = normalizeOptionalUrl(
    bundle.metadata?.legal.privacyPolicyUrl ||
      bundle.dapp.privacyPolicyUrl ||
      undefined
  );

  return {
    schema_version: NFT_SCHEMA_VERSION,
    name: releaseName,
    description: shortDescription,
    image: iconMedia.uri,
    ...(publisherWebsite ? { external_url: publisherWebsite } : {}),
    properties: {
      category: "dApp",
      creators: [
        {
          address: publisherAddress,
          share: 100,
        },
      ],
    },
    extensions: {
      solana_dapp_store: {
        publisher_details: {
          name: publisherName,
          ...(publisherWebsite ? { website: publisherWebsite } : {}),
          contact: publisherContact,
          support_email: publisherSupportEmail,
        },
        release_details: {
          updated_on: new Date().toISOString(),
          ...(licenseUrl ? { license_url: licenseUrl } : {}),
          ...(copyrightUrl ? { copyright_url: copyrightUrl } : {}),
          ...(privacyPolicyUrl ? { privacy_policy_url: privacyPolicyUrl } : {}),
          localized_resources: {
            long_description: "1",
            new_in_version: "2",
            name: "4",
            short_description: "5",
          },
        },
        media,
        files: [
          {
            mime: installMimeType,
            purpose: "install",
            size: installSize,
            sha256: installSha256,
            uri: installUri,
          },
        ],
        android_details: {
          android_package: androidPackage,
          version: versionName,
          version_code: versionCode,
          min_sdk: minSdkVersion,
          target_sdk: targetSdkVersion,
          cert_fingerprint: certificateFingerprint,
          permissions: asStringArray(permissions),
          locales: asStringArray(locales),
        },
      },
      i18n: {
        "en-US": {
          "1": longDescription,
          "2": newInVersion,
          "4": releaseName,
          "5": shortDescription.slice(0, 50),
        },
      },
    },
    __origin: sourceKind,
  };
}
