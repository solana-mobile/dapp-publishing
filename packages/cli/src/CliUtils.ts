import fs from "fs";
import { createHash } from "node:crypto";
import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import debugModule from "debug";
import { keypairIdentity, Metaplex, type MetaplexFile, type Amount, lamports } from "@metaplex-foundation/js";
import updateNotifier from "update-notifier";
import { readFile } from 'fs/promises';
const cliPackage = JSON.parse((await readFile(new URL("./package.json", import.meta.url))).toString());
import boxen from "boxen";
import ver from "semver";
import path from "path";
import { CachedStorageDriver } from "./upload/CachedStorageDriver.js";
import { TurboStorageDriver } from "./upload/TurboStorageDriver.js";
import { EnvVariables } from "./config/index.js";
import { S3Client } from "@aws-sdk/client-s3";
import { awsStorage } from "@metaplex-foundation/js-plugin-aws";
import { S3StorageManager } from "./config/index.js";
import nacl from "tweetnacl";
import {
  createPublicationSigner,
  type PublicationAttestationClient,
  type PublicationBundle,
  type PublicationCleanupReleaseInput,
  type PublicationCleanupReleaseResult,
  type PublicationCreateUploadTargetInput,
  type PublicationCreateUploadTargetResult,
  type PublicationCreateIngestionSessionInput,
  type PublicationGetBundleInput,
  type PublicationGetIngestionSessionInput,
  type PublicationGetSessionInput,
  type PublicationIngestionSession,
  type PublicationPreparedReleaseTransaction,
  type PublicationPreparedVerifyCollectionTransaction,
  type PublicationPrepareReleaseNftTransactionInput,
  type PublicationPrepareVerifyCollectionTransactionInput,
  type PublicationSaveReleaseNftDataInput,
  type PublicationSaveReleaseNftDataResult,
  type PublicationSession,
  type PublicationSigner,
  type PublicationSubmitSignedTransactionResult,
  type PublicationSubmitToStoreInput,
  type PublicationSubmitToStoreResult,
  type PublicationWorkflowClient,
} from "@solana-mobile/dapp-store-publishing-tools";

export class Constants {
  static CLI_VERSION = "0.16.0";
  static CONFIG_FILE_NAME = "config.yaml";
  static DEFAULT_RPC_DEVNET = "https://api.devnet.solana.com";
  static DEFAULT_PRIORITY_FEE = 500000;

  static getConfigFilePath = () => {
    return path.join(process.cwd(), Constants.CONFIG_FILE_NAME);
  };
}

export const debug = debugModule("CLI");

export const checkForSelfUpdate = async () => {
  const notifier = updateNotifier({ pkg: cliPackage });
  const updateInfo = await notifier.fetchInfo();

  const latestVer = new ver.SemVer(updateInfo.latest);
  const currentVer = new ver.SemVer(updateInfo.current);

  if (
    latestVer.major > currentVer.major ||
    latestVer.minor > currentVer.minor
  ) {
    throw new Error(
      `Please update to the latest version of the dApp Store CLI before proceeding.\nCurrent version is ${currentVer.raw}\nLatest version is ${latestVer.raw}`
    );
  }
};

export const checkMintedStatus = async (
  conn: Connection,
  appAddr: string,
  releaseAddr: string
) => {
  for (let i = 0; i < 5; i++) {
    const results = await conn.getMultipleAccountsInfo([
      new PublicKey(appAddr),
      new PublicKey(releaseAddr),
    ]);

    const isAppMinted = results[0] != undefined && results[0]?.lamports > 0
    const isReleaseMinted = results[1] != undefined && results[1]?.lamports > 0

    if (isAppMinted && isReleaseMinted) {
      return
    } else {
      let errorMessage = ``
      if (!isAppMinted) {
        errorMessage = errorMessage + `App NFT fetch at address ${appAddr} failed.\n`
      }
      if (!isReleaseMinted) {
        errorMessage = errorMessage + `Release NFT fetch at address ${releaseAddr} failed.\n`
      }
      if (i == 4) {
        throw new Error(
          `Expected App :: ${appAddr} and Release :: ${releaseAddr} to be minted before submission.\n
          but ${errorMessage}\n
          Please ensure you have minted all of your NFTs before submitting to the Solana Mobile dApp publisher portal.`
        );
      } else {
        sleep(2000)
      }
    }
  }
};

export const sleep = (ms: number):Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch (e) {
    showMessage(
      "KeyPair Error",
      "Something went wrong when attempting to retrieve the keypair at " +
      pathToKeypairFile,
      "error"
    );
  }
};

type PortalProcedureResult<T> =
  | {
      _tag: "Left";
      left: {
        name?: string;
        message: string;
      };
    }
  | {
      _tag: "Right";
      right: T;
    };

type PortalClientConfig = {
  apiBaseUrl: string;
  apiKey: string;
  dappId?: string;
};

type PortalPublicationBundle = PublicationBundle & {
  release: PublicationBundle["release"] & {
    releaseName: string;
    releaseMetadataUri?: string | null;
  };
  metadata: {
    localizedName: string;
    shortDescription: string;
    longDescription: string;
    newInVersion: string;
    publisherWebsite?: string | null;
    supportEmail?: string | null;
    website?: string | null;
    locales: string[];
    legal: {
      licenseUrl?: string | null;
      copyrightUrl?: string | null;
      privacyPolicyUrl?: string | null;
    };
    media: Array<Record<string, unknown>>;
    installFile: {
      url: string;
      fileName: string;
      mimeType?: string;
      size?: number;
      sha256?: string | null;
      canonicalUrl?: string | null;
      origin: "portal" | "external";
    };
    localizedStrings: Array<{
      locale: string;
      name: string;
      shortDescription: string;
      longDescription: string;
      newInVersion: string;
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(value: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const candidate = readDeep(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function readDeep(value: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = value;

  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function ensureHttpsUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:\/\//, "https://");
  }

  return `https://${trimmed}`;
}

function inferFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = pathname.split("/").filter(Boolean).pop();
    return basename || "app-release.apk";
  } catch {
    return "app-release.apk";
  }
}

function inferFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() || "apk";
  return extension.replace(/[^a-z0-9]/g, "") || "apk";
}

function ensureApkFileName(fileName: string): string {
  return /\.apk$/i.test(fileName) ? fileName : `${fileName}.apk`;
}

function inferMimeType(fileName: string): string {
  const extension = inferFileExtension(fileName);
  if (extension === "apk") {
    return "application/vnd.android.package-archive";
  }
  if (extension === "json") {
    return "application/json";
  }
  return "application/octet-stream";
}

function toBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function unwrapPortalResult<T>(
  result: PortalProcedureResult<T> | Record<string, unknown> | T,
  fallbackMessage: string,
): T {
  if (isRecord(result) && "_tag" in result) {
    const tagged = result as PortalProcedureResult<T>;
    if (tagged._tag === "Left") {
      throw new Error(tagged.left.message || fallbackMessage);
    }

    return tagged.right;
  }

  return result as T;
}

async function callPortalProcedure<T>(
  config: PortalClientConfig,
  procedure: string,
  input: unknown,
  method: "query" | "mutation" = "mutation",
): Promise<T> {
  const baseUrl = config.apiBaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/trpc/${procedure}`);
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-api-key": config.apiKey,
  };

  let response: Response;
  if (method === "query") {
    if (input !== undefined) {
      url.searchParams.set("input", JSON.stringify(input));
    }
    response = await fetch(url, {
      method: "GET",
      headers,
    });
  } else {
    headers["content-type"] = "application/json";
    response = await fetch(url, {
      method: "POST",
      headers,
      body: input === undefined ? undefined : JSON.stringify(input),
    });
  }

  const text = await response.text();
  let payload: unknown;

  try {
    payload = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180) || "[empty]";
    throw new Error(
      `Failed to parse portal response from ${procedure}: ${preview}`,
    );
  }

  const normalizedPayload =
    isRecord(payload) && "0" in payload
      ? (payload as Record<string, unknown>)["0"]
      : payload;

  if (!response.ok) {
    if (isRecord(normalizedPayload)) {
      const error = readDeep(normalizedPayload, "error.message");
      if (typeof error === "string" && error.length > 0) {
        throw new Error(`${procedure}: ${error}`);
      }

      const nested = readDeep(normalizedPayload, "result.data");
      if (isRecord(nested) && nested._tag === "Left") {
        const left = nested as PortalProcedureResult<T>;
        if (left.left.message) {
          throw new Error(`${procedure}: ${left.left.message}`);
        }
      }
    }

    throw new Error(
      `${procedure}: Portal request failed with status ${response.status}`,
    );
  }

  const result =
    readDeep(normalizedPayload, "result.data") ??
    readDeep(normalizedPayload, "result");
  return unwrapPortalResult(
    result as PortalProcedureResult<T> | Record<string, unknown> | T,
    `Portal request failed for ${procedure}`,
  );
}

function isRetryableCreateIngestionSessionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes(
      "failed to parse portal response from publication.createingestionsession",
    ) ||
    message.includes("gateway timeout") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("unexpected token <")
  );
}

async function callCreateIngestionSessionWithRetry(
  config: PortalClientConfig,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callPortalProcedure<Record<string, unknown>>(
        config,
        "publication.createIngestionSession",
        input,
        "mutation",
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableCreateIngestionSessionError(error) || attempt === 2) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 1500 * (attempt + 1)),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create ingestion session");
}

async function uploadBytes(
  uploadUrl: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
    },
    body,
  });

  if (!response.ok) {
    const preview = (await response.text()).replace(/\s+/g, " ").trim();
    throw new Error(
      `Failed to upload file to the portal: ${preview || response.statusText}`,
    );
  }
}

function normalizePublicationCheckpoint(session: {
  stage?: string;
  mintTransactionSignature?: string | null;
  verificationTransactionSignature?: string | null;
  attestationRequestUniqueId?: string | null;
  hubspotTicketId?: string | null;
  expectedMintAddress?: string | null;
  metadataUri?: string | null;
}): PublicationSession["checkpoint"] {
  switch (session.stage) {
    case "Submitted":
      return "submitted";
    case "Attested":
      return "verified";
    case "Verified":
    case "VerificationSubmitted":
      return "verified";
    case "MintSaved":
      return "mint-saved";
    case "MintSubmitted":
      return "mint-submitted";
    case "PreparedForMint":
      return "bundle-ready";
    case "Failed":
      break;
    default:
      break;
  }

  if (session.hubspotTicketId) {
    return "submitted";
  }

  if (session.attestationRequestUniqueId) {
    return "verified";
  }

  if (session.verificationTransactionSignature) {
    return "verified";
  }

  if (session.mintTransactionSignature) {
    return "mint-submitted";
  }

  if (session.expectedMintAddress || session.metadataUri) {
    return "bundle-ready";
  }

  return "created";
}

function normalizePublicationStatus(session: {
  stage?: string;
  hubspotTicketId?: string | null;
}) {
  if (session.stage === "Failed") {
    return "failed" as const;
  }

  if (session.stage === "Submitted" || session.hubspotTicketId) {
    return "completed" as const;
  }

  return "running" as const;
}

function inferPublicationSourceKind(
  sourceKind?: string,
): "portal" | "external" {
  if (sourceKind === "externalUrl") {
    return "external";
  }

  return "portal";
}

function buildReleaseMetadataDocument(
  bundle: PublicationBundle,
  sourceKind: "portal" | "external",
): Record<string, unknown> {
  const releaseName =
    bundle.release.localizedName ||
    bundle.release.releaseName ||
    bundle.metadata.localizedName ||
    bundle.dapp.dappName;
  const shortDescription =
    bundle.metadata.shortDescription || bundle.release.newInVersion || "";
  const longDescription =
    bundle.metadata.longDescription || shortDescription || bundle.dapp.description || "";
  const newInVersion =
    bundle.metadata.newInVersion || bundle.release.newInVersion || "";
  const installFile = bundle.metadata.installFile;
  const image =
    bundle.dapp.dappIconUrl ||
    bundle.dapp.featureGraphicUrl ||
    bundle.dapp.bannerUrl;
  if (!image) {
    throw new Error(
      "Publication bundle did not include a public app image URL.",
    );
  }
  const publisherWebsite =
    bundle.metadata.publisherWebsite ||
    bundle.publisher.website ||
    bundle.dapp.appWebsite ||
    "";
  const licenseUrl =
    bundle.metadata.legal.licenseUrl || bundle.dapp.licenseUrl || "";
  const copyrightUrl =
    bundle.metadata.legal.copyrightUrl || bundle.dapp.copyrightUrl || "";
  const privacyPolicyUrl =
    bundle.metadata.legal.privacyPolicyUrl || bundle.dapp.privacyPolicyUrl || "";

  return {
    schema_version: "0.4.0",
    name: releaseName.slice(0, 32),
    description: shortDescription || longDescription || releaseName,
    image,
    properties: {
      category: "dApp",
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
            bundle.publisher.supportEmail || bundle.metadata.supportEmail || bundle.publisher.email,
        },
        release_details: {
          updated_on: new Date().toISOString(),
          ...(licenseUrl ? { license_url: ensureHttpsUrl(licenseUrl) } : {}),
          ...(copyrightUrl ? { copyright_url: copyrightUrl } : {}),
          ...(privacyPolicyUrl
            ? { privacy_policy_url: ensureHttpsUrl(privacyPolicyUrl) }
            : {}),
          localized_resources: {
            short_description: "5",
            long_description: "1",
            new_in_version: "2",
            name: "4",
          },
        },
        media: bundle.metadata.media ?? [],
        files: [
          {
            mime: installFile.mimeType || inferMimeType(installFile.fileName),
            purpose: "install",
            size: installFile.size ?? 0,
            sha256: installFile.sha256 || "",
            uri: installFile.url,
          },
        ],
        android_details: {
          android_package: bundle.release.androidPackage,
          version_code: bundle.release.versionCode,
          version: bundle.release.versionName,
          min_sdk: bundle.release.minSdkVersion ?? 1,
          cert_fingerprint: bundle.release.certificateFingerprint || "",
          permissions: bundle.release.permissions ?? [],
          locales: bundle.release.locales ?? bundle.dapp.languages ?? ["en-US"],
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

function mapBackendBundleToPublicationBundle(
  backendBundle: Record<string, unknown>,
  releaseMetadataUri: string,
  sourceKind: "portal" | "external",
): PublicationBundle {
  const release = isRecord(backendBundle.release)
    ? backendBundle.release
    : {};
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

  const releaseName =
    (typeof release.localizedName === "string" && release.localizedName) ||
    (typeof dapp.dappName === "string" && dapp.dappName) ||
    "Release update";

  return {
    ingestionSessionId: String(backendBundle.ingestionSessionId || ""),
    publicationSessionId: String(backendBundle.publicationSessionId || ""),
    releaseId: String(backendBundle.releaseId || release.id || ""),
    dapp: {
      id: String(dapp.id || ""),
      dappName: String(dapp.dappName || releaseName),
      subtitle:
        typeof dapp.subtitle === "string" ? dapp.subtitle : null,
      description: String(dapp.description || ""),
      androidPackage: String(dapp.androidPackage || release.androidPackage || ""),
      dappIconUrl:
        typeof dapp.dappIconUrl === "string" ? dapp.dappIconUrl : null,
      dappPreviewUrls: Array.isArray(dapp.dappPreviewUrls)
        ? (dapp.dappPreviewUrls as string[])
        : [],
      bannerUrl: typeof dapp.bannerUrl === "string" ? dapp.bannerUrl : null,
      featureGraphicUrl:
        typeof dapp.featureGraphicUrl === "string"
          ? dapp.featureGraphicUrl
          : null,
      appWebsite: typeof dapp.appWebsite === "string" ? dapp.appWebsite : null,
      contactEmail:
        typeof dapp.contactEmail === "string" ? dapp.contactEmail : null,
      supportEmail: String(dapp.supportEmail || publisher.supportEmail || ""),
      languages: Array.isArray(dapp.languages) ? (dapp.languages as string[]) : [],
      licenseUrl: typeof dapp.licenseUrl === "string" ? dapp.licenseUrl : null,
      copyrightUrl:
        typeof dapp.copyrightUrl === "string" ? dapp.copyrightUrl : null,
      privacyPolicyUrl:
        typeof dapp.privacyPolicyUrl === "string" ? dapp.privacyPolicyUrl : null,
      walletAddress: String(dapp.walletAddress || ""),
      nftMintAddress: String(dapp.nftMintAddress || ""),
      lastApprovedReleaseId:
        typeof dapp.lastApprovedReleaseId === "string"
          ? dapp.lastApprovedReleaseId
          : null,
    },
    publisher: {
      id: String(publisher.id || ""),
      type:
        publisher.type === "organization" || publisher.type === "individual"
          ? publisher.type
          : "organization",
      name: String(publisher.name || ""),
      website: String(publisher.website || ""),
      email: String(publisher.email || ""),
      supportEmail: String(
        publisher.supportEmail || dapp.supportEmail || publisher.email || "",
      ),
    },
    installFile: {
      uri: String(installFile.uri || release.releaseFileUrl || ""),
      mimeType:
        typeof installFile.mimeType === "string"
          ? installFile.mimeType
          : inferMimeType(
              (typeof release.releaseFileName === "string" &&
                release.releaseFileName) ||
                inferFileNameFromUrl(
                  String(installFile.uri || release.releaseFileUrl || ""),
                ),
            ),
      size:
        typeof installFile.size === "number" ? installFile.size : 0,
      sha256:
        typeof installFile.sha256 === "string"
          ? installFile.sha256
          : null,
      fileName:
        (typeof release.releaseFileName === "string" &&
          release.releaseFileName) ||
        inferFileNameFromUrl(String(installFile.uri || release.releaseFileUrl || "")),
      canonicalUrl:
        typeof installFile.canonicalUrl === "string"
          ? installFile.canonicalUrl
          : String(installFile.uri || release.releaseFileUrl || ""),
      url: String(installFile.uri || release.releaseFileUrl || ""),
      origin: sourceKind,
    },
    metadata: {
      localizedName: releaseName,
      shortDescription:
        (typeof release.shortDescription === "string" && release.shortDescription) ||
        (typeof dapp.subtitle === "string" && dapp.subtitle) ||
        String(dapp.description || "").slice(0, 50),
      longDescription:
        (typeof release.longDescription === "string" && release.longDescription) ||
        String(dapp.description || ""),
      newInVersion:
        (typeof release.newInVersion === "string" && release.newInVersion) ||
        "",
      publisherWebsite:
        typeof publisher.website === "string" ? publisher.website : null,
      supportEmail:
        typeof publisher.supportEmail === "string"
          ? publisher.supportEmail
          : null,
      website:
        typeof dapp.appWebsite === "string" ? dapp.appWebsite : null,
      locales: Array.isArray(dapp.languages) ? (dapp.languages as string[]) : [],
      legal: {
        licenseUrl:
          typeof dapp.licenseUrl === "string" ? dapp.licenseUrl : null,
        copyrightUrl:
          typeof dapp.copyrightUrl === "string" ? dapp.copyrightUrl : null,
        privacyPolicyUrl:
          typeof dapp.privacyPolicyUrl === "string" ? dapp.privacyPolicyUrl : null,
      },
      media: [],
      installFile: {
        url: String(installFile.uri || release.releaseFileUrl || ""),
        fileName:
          (typeof release.releaseFileName === "string" && release.releaseFileName) ||
          inferFileNameFromUrl(String(installFile.uri || release.releaseFileUrl || "")),
        mimeType:
          typeof installFile.mimeType === "string"
            ? installFile.mimeType
            : inferMimeType(
                (typeof release.releaseFileName === "string" &&
                  release.releaseFileName) ||
                  inferFileNameFromUrl(String(installFile.uri || release.releaseFileUrl || "")),
              ),
        size:
          typeof installFile.size === "number" ? installFile.size : 0,
        sha256:
          typeof installFile.sha256 === "string"
            ? installFile.sha256
            : null,
        canonicalUrl: String(installFile.uri || release.releaseFileUrl || ""),
        origin: sourceKind,
      },
      localizedStrings: [
        {
          locale: "en-US",
          name: releaseName,
          shortDescription:
            (typeof release.shortDescription === "string" &&
              release.shortDescription) ||
            String(dapp.description || "").slice(0, 50),
          longDescription:
            (typeof release.longDescription === "string" &&
              release.longDescription) ||
            String(dapp.description || ""),
          newInVersion:
            (typeof release.newInVersion === "string" && release.newInVersion) ||
            "",
        },
      ],
      releaseMetadataUri:
        releaseMetadataUri ||
        (typeof release.nftMetadataUri === "string"
          ? release.nftMetadataUri
          : null),
    },
    signerAuthority: {
      dappWalletAddress: String(
        signerAuthority.dappWalletAddress ||
          signerAuthority.requiredSigner ||
          dapp.walletAddress ||
          "",
      ),
      collectionAuthority: String(
        signerAuthority.collectionAuthority ||
          signerAuthority.dappWalletAddress ||
          dapp.walletAddress ||
          "",
      ),
      appMintAddress: String(
        signerAuthority.appMintAddress || dapp.nftMintAddress || "",
      ),
      sameSignerRequired:
        typeof signerAuthority.sameSignerRequired === "boolean"
          ? signerAuthority.sameSignerRequired
          : true,
      acceptedSignerRoles: Array.isArray(
        signerAuthority.acceptedSignerRoles,
      )
        ? (signerAuthority.acceptedSignerRoles as Array<'publisher' | 'payer'>)
        : ['publisher', 'payer'],
      dappId: String(dapp.id || ""),
      requiredSigner:
        typeof signerAuthority.requiredSigner === "string"
          ? signerAuthority.requiredSigner
          : String(
              signerAuthority.dappWalletAddress ||
                signerAuthority.collectionAuthority ||
                dapp.walletAddress ||
                "",
            ),
      mintSigner:
        typeof signerAuthority.mintSigner === "string"
          ? signerAuthority.mintSigner
          : String(
              signerAuthority.dappWalletAddress ||
                signerAuthority.collectionAuthority ||
                dapp.walletAddress ||
                "",
            ),
      feePayer:
        typeof signerAuthority.feePayer === "string"
          ? signerAuthority.feePayer
          : null,
    },
    release: {
      releaseName,
      versionName:
        (typeof release.versionName === "string" && release.versionName) ||
        String(release.versionCode || "1"),
      versionCode:
        typeof release.versionCode === "number" ? release.versionCode : 1,
      androidPackage: String(
        release.androidPackage || dapp.androidPackage || "",
      ),
      localizedName:
        (typeof release.localizedName === "string" && release.localizedName) ||
        releaseName,
      newInVersion:
        (typeof release.newInVersion === "string" && release.newInVersion) ||
        "",
      releaseMintAddress:
        typeof release.nftMintAddress === "string"
          ? release.nftMintAddress
          : null,
      releaseMetadataUri:
        releaseMetadataUri ||
        (typeof release.nftMetadataUri === "string"
          ? release.nftMetadataUri
          : null),
    },
  };
}

function translateBackendPublicationSession(
  backendSession: Record<string, unknown>,
): PublicationSession {
  const stage = typeof backendSession.stage === "string" ? backendSession.stage : "PreparedForMint";

  return {
    id: String(backendSession.id || ""),
    ingestionSessionId: String(
      backendSession.ingestionSessionId || "",
    ),
    releaseId: String(backendSession.releaseId || ""),
    status: normalizePublicationStatus({
      stage,
      hubspotTicketId:
        typeof backendSession.hubspotTicketId === "string"
          ? backendSession.hubspotTicketId
          : null,
    }),
    checkpoint: normalizePublicationCheckpoint({
      stage,
      mintTransactionSignature:
        typeof backendSession.mintTransactionSignature === "string"
          ? backendSession.mintTransactionSignature
          : null,
      verificationTransactionSignature:
        typeof backendSession.verificationTransactionSignature === "string"
          ? backendSession.verificationTransactionSignature
          : null,
      attestationRequestUniqueId:
        typeof backendSession.attestationRequestUniqueId === "string"
          ? backendSession.attestationRequestUniqueId
          : null,
      hubspotTicketId:
        typeof backendSession.hubspotTicketId === "string"
          ? backendSession.hubspotTicketId
          : null,
      expectedMintAddress:
        typeof backendSession.expectedMintAddress === "string"
          ? backendSession.expectedMintAddress
          : null,
      metadataUri:
        typeof backendSession.metadataUri === "string"
          ? backendSession.metadataUri
          : null,
    }),
    metadataUri:
      typeof backendSession.metadataUri === "string"
        ? backendSession.metadataUri
        : null,
    releaseMintAddress:
      typeof backendSession.expectedMintAddress === "string"
        ? backendSession.expectedMintAddress
        : null,
    collectionMintAddress: null,
    mintTransactionSignature:
      typeof backendSession.mintTransactionSignature === "string"
        ? backendSession.mintTransactionSignature
        : null,
    verifyTransactionSignature:
      typeof backendSession.verificationTransactionSignature === "string"
        ? backendSession.verificationTransactionSignature
        : null,
    attestationRequestUniqueId:
      typeof backendSession.attestationRequestUniqueId === "string"
        ? backendSession.attestationRequestUniqueId
        : null,
    attestationPayload: null,
    hubspotTicketId:
      typeof backendSession.hubspotTicketId === "string"
        ? backendSession.hubspotTicketId
        : null,
    error:
      typeof backendSession.lastError === "string"
        ? backendSession.lastError
        : null,
    created:
      typeof backendSession.created === "string"
        ? backendSession.created
        : new Date().toISOString(),
    updated:
      typeof backendSession.updated === "string"
        ? backendSession.updated
        : new Date().toISOString(),
    createdAt:
      typeof backendSession.created === "string"
        ? backendSession.created
        : undefined,
    updatedAt:
      typeof backendSession.updated === "string"
        ? backendSession.updated
        : undefined,
  };
}

function translateBackendIngestionSession(
  backendSession: Record<string, unknown>,
  bundle?: Record<string, unknown>,
  publicationSession?: Record<string, unknown>,
): PublicationIngestionSession & {
  bundle?: PublicationBundle;
  publicationSession?: PublicationSession;
} {
  const sourceKind =
    typeof backendSession.sourceKind === "string"
      ? backendSession.sourceKind
      : "portalUpload";
  const translatedPublicationSession = publicationSession
    ? translateBackendPublicationSession(publicationSession)
    : undefined;
  const translatedBundle = bundle
    ? {
        ...mapBackendBundleToPublicationBundle(
          bundle,
          firstString(publicationSession, ["metadataUri"]) ||
            firstString(bundle, ["release.nftMetadataUri"]) ||
            "",
          inferPublicationSourceKind(sourceKind),
        ),
        ingestionSessionId: String(backendSession.id || ""),
        publicationSessionId:
          typeof backendSession.publicationSessionId === "string"
            ? backendSession.publicationSessionId
            : translatedPublicationSession?.id || "",
        releaseId:
          typeof backendSession.releaseId === "string"
            ? backendSession.releaseId
            : firstString(bundle, ["release.id"]) || "",
      }
    : undefined;

  const source = {
    kind:
      sourceKind === "externalUrl"
        ? ("apk-url" as const)
        : sourceKind === "existingRelease"
          ? ("existingRelease" as const)
          : ("apk-file" as const),
    filePath:
      sourceKind === "existingRelease"
        ? String(backendSession.releaseId || "")
        : typeof backendSession.sourceUrl === "string"
          ? backendSession.sourceUrl
          : "",
    fileName:
      typeof backendSession.releaseFileName === "string"
        ? backendSession.releaseFileName
        : inferFileNameFromUrl(
            typeof backendSession.sourceUrl === "string"
              ? backendSession.sourceUrl
              : "",
          ),
    url:
      typeof backendSession.sourceUrl === "string"
        ? backendSession.sourceUrl
        : "",
    mimeType: inferMimeType(
      typeof backendSession.releaseFileName === "string"
        ? backendSession.releaseFileName
        : inferFileNameFromUrl(
            typeof backendSession.sourceUrl === "string"
              ? backendSession.sourceUrl
              : "",
          ),
    ),
    size:
      typeof backendSession.releaseFileSize === "number"
        ? backendSession.releaseFileSize
        : undefined,
    sha256:
      typeof backendSession.releaseFileHash === "string"
        ? backendSession.releaseFileHash
        : undefined,
    canonicalUrl:
      typeof backendSession.canonicalSourceUrl === "string"
        ? backendSession.canonicalSourceUrl
        : undefined,
    sourceReleaseId: String(backendSession.releaseId || ""),
  } as
    | {
        kind: "apk-file";
        fileName: string;
        filePath: string;
        mimeType?: string;
        size?: number;
        sha256?: string;
      }
    | {
        kind: "apk-url";
        url: string;
        fileName?: string;
        mimeType?: string;
        size?: number;
        sha256?: string;
        canonicalUrl?: string;
      }
    | {
      kind: "existingRelease";
      sourceReleaseId: string;
      };

  return {
    id: String(backendSession.id || ""),
    dappId: String(backendSession.dappId || ""),
    idempotencyKey: String(backendSession.idempotencyKey || ""),
    source,
    whatsNew: String(backendSession.whatsNew || ""),
    status:
      backendSession.status === "Failed"
        ? "failed"
        : backendSession.status === "Ready"
          ? "ready"
          : backendSession.status === "Processing"
            ? "processing"
            : "created",
    publicationSessionId:
      typeof backendSession.publicationSessionId === "string"
        ? backendSession.publicationSessionId
        : translatedPublicationSession?.id ?? null,
    releaseId:
      typeof backendSession.releaseId === "string"
        ? backendSession.releaseId
        : translatedBundle?.releaseId ??
          translatedPublicationSession?.releaseId ??
          null,
    processingError:
      typeof backendSession.processingError === "string"
        ? backendSession.processingError
        : null,
    processingProgress:
      typeof backendSession.processingProgress === "number"
        ? backendSession.processingProgress
        : null,
    processingStage:
      typeof backendSession.processingStage === "string"
        ? backendSession.processingStage
        : null,
    processingDetail:
      typeof backendSession.processingDetail === "string"
        ? backendSession.processingDetail
        : null,
    error:
      typeof backendSession.processingError === "string"
        ? backendSession.processingError
        : null,
    createdAt:
      typeof backendSession.created === "string"
        ? backendSession.created
        : undefined,
    updatedAt:
      typeof backendSession.updated === "string"
        ? backendSession.updated
        : undefined,
    ...(translatedBundle ? { bundle: translatedBundle } : {}),
    ...(translatedPublicationSession
      ? { publicationSession: translatedPublicationSession }
      : {}),
  };
}

export function createPublicationSignerFromKeypair(
  keypair: Keypair,
): PublicationSigner {
  return createPublicationSigner({
    publicKey: keypair.publicKey.toBase58(),
    signTransaction: async (transaction: Transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    },
    signMessage: async (message: Uint8Array) =>
      nacl.sign.detached(message, keypair.secretKey),
  });
}

export function createPortalAttestationClient(
  config: PortalClientConfig,
): PublicationAttestationClient {
  return {
    async getBlockData() {
      return await callPortalProcedure<{ slot: number; blockhash: string }>(
        config,
        "attestation.getBlockData",
        {},
        "query",
      );
    },
  };
}

export function createPortalWorkflowClient(
  config: PortalClientConfig,
): PublicationWorkflowClient {
  const metadataUriByReleaseId = new Map<string, string>();
  const publicationSessionIdByReleaseId = new Map<string, string>();
  let currentPublicationSessionId: string | undefined;
  let currentReleaseId: string | undefined;

  const uploadReleaseMetadata = async (bundle: PublicationBundle) => {
    const releaseId = bundle.releaseId;
    const cached = metadataUriByReleaseId.get(releaseId);
    if (cached) {
      return cached;
    }

    if (typeof bundle.release.releaseMetadataUri === "string" && bundle.release.releaseMetadataUri.length > 0) {
      metadataUriByReleaseId.set(releaseId, bundle.release.releaseMetadataUri);
      return bundle.release.releaseMetadataUri;
    }

    const metadataDocument = buildReleaseMetadataDocument(
      bundle,
      inferPublicationSourceKind(
        bundle.metadata.installFile.origin === "external"
          ? "externalUrl"
          : "portalUpload",
      ),
    );
    delete (metadataDocument as Record<string, unknown>).__origin;
    const metadataBytes = Buffer.from(
      JSON.stringify(metadataDocument),
      "utf8",
    );
    const fileHash = createHash("sha256").update(metadataBytes).digest("hex");
    const uploadTarget = await callPortalProcedure<{
      uploadUrl: string;
      key: string;
      providerId: string;
      publicUrl: string;
    }>(config, "publication.createUploadTarget", {
      fileHash,
      fileExtension: "json",
      contentType: "application/json",
    });

    await uploadBytes(
      uploadTarget.uploadUrl,
      metadataBytes,
      "application/json",
    );

    metadataUriByReleaseId.set(releaseId, uploadTarget.publicUrl);
    return uploadTarget.publicUrl;
  };

  return {
    async createUploadTarget(
      input: PublicationCreateUploadTargetInput,
    ): Promise<PublicationCreateUploadTargetResult> {
      return await callPortalProcedure<PublicationCreateUploadTargetResult>(
        config,
        "publication.createUploadTarget",
        input,
        "mutation",
      );
    },

    async createIngestionSession(
      input: PublicationCreateIngestionSessionInput,
    ): Promise<PublicationIngestionSession> {
      const dappId = input.dappId || config.dappId;
      const idempotencyKey = input.idempotencyKey || `${Date.now()}`;

      if (input.source.kind === "apk-file") {
        const source = (() => {
          const filePath = path.resolve(input.source.filePath);
          const fileName = ensureApkFileName(
            input.source.fileName || path.basename(filePath),
          );
          const fileExtension = "apk";
          const contentType =
            input.source.mimeType ||
            "application/vnd.android.package-archive";
          const fileBytes = fs.readFileSync(filePath);
          const fileHash =
            input.source.sha256 ||
            createHash("sha256").update(fileBytes).digest("hex");
          return {
            filePath,
            fileName,
            fileBytes,
            fileHash,
            fileExtension,
            contentType,
            releaseFileSize:
              input.source.size ?? fileBytes.byteLength,
          };
        })();

        const uploadTarget = await callPortalProcedure<{
          uploadUrl: string;
          key: string;
          providerId: string;
          publicUrl: string;
        }>(config, "publication.createUploadTarget", {
          fileHash: source.fileHash,
          fileExtension: source.fileExtension,
          contentType: source.contentType,
        }, "mutation");

        await uploadBytes(
          uploadTarget.uploadUrl,
          fromBase64(toBase64(source.fileBytes)),
          source.contentType,
        );

        const backendResult = await callCreateIngestionSessionWithRetry(
          config,
          {
            source: {
              kind: "portalUpload",
              releaseFileUrl: uploadTarget.publicUrl,
              releaseFileName: source.fileName,
              releaseFileSize: source.releaseFileSize,
            },
            whatsNew: input.whatsNew,
            idempotencyKey,
            ...(dappId ? { dappId } : {}),
          },
        );

        currentReleaseId =
          typeof backendResult.releaseId === "string"
            ? backendResult.releaseId
            : currentReleaseId;
        currentPublicationSessionId =
          typeof backendResult.publicationSessionId === "string"
            ? backendResult.publicationSessionId
            : currentPublicationSessionId;
        if (currentReleaseId && currentPublicationSessionId) {
          publicationSessionIdByReleaseId.set(
            currentReleaseId,
            currentPublicationSessionId,
          );
        }

        const translated = translateBackendIngestionSession(
          backendResult,
          isRecord(backendResult.bundle)
            ? (backendResult.bundle as Record<string, unknown>)
            : undefined,
          isRecord(backendResult.publicationSession)
            ? (backendResult.publicationSession as Record<string, unknown>)
            : undefined,
        );

        if (translated.releaseId && translated.publicationSessionId) {
          publicationSessionIdByReleaseId.set(
            translated.releaseId,
            translated.publicationSessionId,
          );
        }
        if (translated.publicationSessionId) {
          currentPublicationSessionId = translated.publicationSessionId;
        } else if (translated.publicationSession) {
          currentPublicationSessionId = translated.publicationSession.id;
        }
        if (translated.releaseId) {
          currentReleaseId = translated.releaseId;
        }

        return translated;
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

      const backendResult = await callCreateIngestionSessionWithRetry(
        config,
        {
          source: backendSource,
          whatsNew: input.whatsNew,
          idempotencyKey,
          ...(dappId ? { dappId } : {}),
        },
      );

      currentReleaseId =
        typeof backendResult.releaseId === "string"
          ? backendResult.releaseId
          : currentReleaseId;
      currentPublicationSessionId =
        typeof backendResult.publicationSessionId === "string"
          ? backendResult.publicationSessionId
          : currentPublicationSessionId;
      if (currentReleaseId && currentPublicationSessionId) {
        publicationSessionIdByReleaseId.set(
          currentReleaseId,
          currentPublicationSessionId,
        );
      }

      const translated = translateBackendIngestionSession(
        backendResult,
        isRecord(backendResult.bundle)
          ? (backendResult.bundle as Record<string, unknown>)
          : undefined,
        isRecord(backendResult.publicationSession)
          ? (backendResult.publicationSession as Record<string, unknown>)
          : undefined,
      );

      if (translated.releaseId && translated.publicationSessionId) {
        publicationSessionIdByReleaseId.set(
          translated.releaseId,
          translated.publicationSessionId,
        );
      }
      if (translated.publicationSessionId) {
        currentPublicationSessionId = translated.publicationSessionId;
      } else if (translated.publicationSession) {
        currentPublicationSessionId = translated.publicationSession.id;
      }
      if (translated.releaseId) {
        currentReleaseId = translated.releaseId;
      }

      return translated;
    },

    async getIngestionSession(
      input: PublicationGetIngestionSessionInput,
    ): Promise<PublicationIngestionSession> {
      const resolvedSessionId =
        input.sessionId ||
        (("ingestionSessionId" in input &&
          typeof input.ingestionSessionId === "string" &&
          input.ingestionSessionId.length > 0)
          ? input.ingestionSessionId
          : undefined);

      if (!resolvedSessionId) {
        throw new Error(
          "publication.getIngestionSession requires a session id",
        );
      }

      const backendResult = await callPortalProcedure<Record<string, unknown>>(
        config,
        "publication.getIngestionSession",
        {
          sessionId: resolvedSessionId,
        },
        "query",
      );

      if (typeof backendResult.publicationSessionId === "string") {
        currentPublicationSessionId = backendResult.publicationSessionId;
      }
      if (typeof backendResult.releaseId === "string") {
        currentReleaseId = backendResult.releaseId;
      }

      const translated = translateBackendIngestionSession(
        backendResult,
        isRecord(backendResult.bundle)
          ? (backendResult.bundle as Record<string, unknown>)
          : undefined,
        isRecord(backendResult.publicationSession)
          ? (backendResult.publicationSession as Record<string, unknown>)
          : undefined,
      );

      if (translated.releaseId && translated.publicationSessionId) {
        publicationSessionIdByReleaseId.set(
          translated.releaseId,
          translated.publicationSessionId,
        );
      }
      if (translated.publicationSessionId) {
        currentPublicationSessionId = translated.publicationSessionId;
      } else if (translated.publicationSession) {
        currentPublicationSessionId = translated.publicationSession.id;
      }
      if (translated.releaseId) {
        currentReleaseId = translated.releaseId;
      }

      return translated;
    },

    async getPublicationBundle(
      input: PublicationGetBundleInput,
    ): Promise<PublicationBundle> {
      const backendBundle = await callPortalProcedure<Record<string, unknown>>(
        config,
        "publication.getPublicationBundle",
        { releaseId: input.releaseId },
        "query",
      );

      const linkedPublicationSessionId =
        publicationSessionIdByReleaseId.get(input.releaseId) ||
        currentPublicationSessionId;
      const linkedPublicationSession = linkedPublicationSessionId
        ? translateBackendPublicationSession(
            await callPortalProcedure<Record<string, unknown>>(
              config,
              "publication.getPublicationSession",
              {
                publicationSessionId: linkedPublicationSessionId,
                releaseId: input.releaseId,
              },
              "query",
            ),
          )
        : undefined;

      const releaseMetadataUri =
        metadataUriByReleaseId.get(input.releaseId) ||
        (isRecord(backendBundle.release) &&
        typeof backendBundle.release.nftMetadataUri === "string" &&
        backendBundle.release.nftMetadataUri.length > 0
          ? backendBundle.release.nftMetadataUri
          : await uploadReleaseMetadata(
              mapBackendBundleToPublicationBundle(
                backendBundle,
                "",
                "portal",
              ),
            ));

      metadataUriByReleaseId.set(input.releaseId, releaseMetadataUri);

      const translated = mapBackendBundleToPublicationBundle(
        backendBundle,
        releaseMetadataUri,
        inferPublicationSourceKind(
          currentReleaseId && publicationSessionIdByReleaseId.has(currentReleaseId)
            ? "portalUpload"
            : "externalUrl",
        ),
      );

      translated.releaseId = translated.releaseId || input.releaseId;
      translated.publicationSessionId =
        translated.publicationSessionId ||
        linkedPublicationSession?.id ||
        publicationSessionIdByReleaseId.get(input.releaseId) ||
        currentPublicationSessionId ||
        "";
      translated.ingestionSessionId =
        translated.ingestionSessionId ||
        linkedPublicationSession?.ingestionSessionId ||
        "";
      currentReleaseId = translated.releaseId || currentReleaseId;
      currentPublicationSessionId =
        translated.publicationSessionId || currentPublicationSessionId;
      if (translated.releaseId && translated.publicationSessionId) {
        publicationSessionIdByReleaseId.set(
          translated.releaseId,
          translated.publicationSessionId,
        );
      }

      return translated;
    },

    async getPublicationSession(
      input: PublicationGetSessionInput,
    ): Promise<PublicationSession> {
      const backendResult = await callPortalProcedure<Record<string, unknown>>(
        config,
        "publication.getPublicationSession",
        {
          publicationSessionId:
            input.publicationSessionId ||
            (input.releaseId
              ? publicationSessionIdByReleaseId.get(input.releaseId)
              : undefined),
          releaseId: input.releaseId,
        },
        "query",
      );

      const translated = translateBackendPublicationSession(backendResult);
      currentPublicationSessionId = translated.id;
      currentReleaseId = translated.releaseId || currentReleaseId;
      if (translated.releaseId) {
        publicationSessionIdByReleaseId.set(translated.releaseId, translated.id);
      }
      return translated;
    },

    async cleanupRelease(
      input: PublicationCleanupReleaseInput,
    ): Promise<PublicationCleanupReleaseResult> {
      return await callPortalProcedure<PublicationCleanupReleaseResult>(
        config,
        "publication.cleanupRelease",
        input,
        "mutation",
      );
    },

    async prepareReleaseNftTransaction(
      input: PublicationPrepareReleaseNftTransactionInput,
    ): Promise<PublicationPreparedReleaseTransaction> {
      return await callPortalProcedure<PublicationPreparedReleaseTransaction>(
        config,
        "publication.prepareReleaseNftTransaction",
        input,
        "mutation",
      );
    },

    async submitSignedTransaction(input: {
      signedTransaction: string;
      publicationSessionId?: string;
    }): Promise<PublicationSubmitSignedTransactionResult> {
      return await callPortalProcedure<PublicationSubmitSignedTransactionResult>(
        config,
        "publication.submitSignedTransaction",
        {
          signedTransaction: input.signedTransaction,
          publicationSessionId:
            input.publicationSessionId || currentPublicationSessionId,
        },
        "mutation",
      );
    },

    async saveReleaseNftData(
      input: PublicationSaveReleaseNftDataInput,
    ): Promise<PublicationSaveReleaseNftDataResult> {
      return await callPortalProcedure<PublicationSaveReleaseNftDataResult>(
        config,
        "publication.saveReleaseNftData",
        input,
        "mutation",
      );
    },

    async prepareVerifyCollectionTransaction(
      input: PublicationPrepareVerifyCollectionTransactionInput,
    ): Promise<PublicationPreparedVerifyCollectionTransaction> {
      return await callPortalProcedure<PublicationPreparedVerifyCollectionTransaction>(
        config,
        "publication.prepareVerifyCollectionTransaction",
        input,
        "mutation",
      );
    },

    async markReleaseCollectionAsVerified(input: {
      releaseId: string;
    }): Promise<{ success: boolean; releaseId: string }> {
      return await callPortalProcedure<{ success: boolean; releaseId: string }>(
        config,
        "publication.markReleaseCollectionAsVerified",
        input,
        "mutation",
      );
    },

    async submitToStore(
      input: PublicationSubmitToStoreInput,
    ): Promise<PublicationSubmitToStoreResult> {
      const attestation = isRecord(input.attestation)
        ? input.attestation
        : undefined;

      const payload =
        typeof attestation?.payload === "string" && attestation.payload.length > 0
          ? attestation.payload
          : typeof attestation?.attestationPayload === "string" &&
              attestation.attestationPayload.length > 0
            ? attestation.attestationPayload
          : typeof (input as Record<string, unknown>).attestationPayload ===
              "string"
            ? String((input as Record<string, unknown>).attestationPayload)
            : "";
      const requestUniqueId =
        typeof attestation?.requestUniqueId === "string"
          ? attestation.requestUniqueId
          : typeof (input as Record<string, unknown>).requestUniqueId === "string"
            ? String((input as Record<string, unknown>).requestUniqueId)
            : "";

      return await callPortalProcedure<PublicationSubmitToStoreResult>(
        config,
        "publication.submitToStore",
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
        "mutation",
      );
    },
  };
}

export const showMessage = (
  titleMessage = "",
  contentMessage = "",
  type: "standard" | "error" | "warning" = "standard"
): string => {
  let color = "cyan";
  if (type == "error") {
    color = "redBright";
  } else if (type == "warning") {
    color = "yellow";
  }

  const msg = boxen(contentMessage, {
    title: titleMessage,
    padding: 1,
    margin: 1,
    borderStyle: "single",
    borderColor: color,
    textAlignment: "left",
    titleAlignment: "center",
  });

  console.log(msg);
  return msg;
};

export const getMetaplexInstance = (
  connection: Connection,
  keypair: Keypair,
  storageParams: string = ""
) => {
  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));
  const isDevnet = connection.rpcEndpoint.includes("devnet");

  //TODO: Use DI for this
  const s3Mgr = new S3StorageManager(new EnvVariables());
  s3Mgr.parseCmdArg(storageParams);

  if (s3Mgr.hasS3Config) {
    const awsClient = new S3Client({
      region: s3Mgr.s3Config.regionName,
      credentials: {
        accessKeyId: s3Mgr.s3Config.accessKey,
        secretAccessKey: s3Mgr.s3Config.secretKey,
      },
    });

    const bucketPlugin = awsStorage(awsClient, s3Mgr.s3Config.bucketName);
    metaplex.use(bucketPlugin);
  } else {
    const turboDriver = new TurboStorageDriver(
      keypair,
      isDevnet ? "devnet" : "mainnet",
      Number(process.env.TURBO_BUFFER_PERCENTAGE || 20)
    );

    const metaplexAdapter = {
      async upload(file: MetaplexFile): Promise<string> {
        return turboDriver.upload(file);
      },
      async getUploadPrice(bytes: number): Promise<Amount> {
        const price = await turboDriver.getUploadPrice(bytes);
        return lamports(price);
      },
    };

    metaplex.storage().setDriver(metaplexAdapter);
  }

  metaplex.storage().setDriver(
    new CachedStorageDriver(metaplex.storage().driver(), {
      assetManifestPath: isDevnet
        ? "./.asset-manifest-devnet.json"
        : "./.asset-manifest.json",
    })
  );

  return metaplex;
};
