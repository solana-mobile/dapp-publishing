import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Transform } from "node:stream";

import type {
  PublicationCreateIngestionSessionInput,
  PublicationSource,
  PublicationWorkflowLogger,
} from "../../types.js";
import type { PublicationWorkflowClient } from "../contracts.js";
import { logWorkflowDebug, logWorkflowInfo } from "../logging.js";
import {
  ensureApkFileName,
  hashFileSha256,
  inferFileNameFromUrl,
} from "./files.js";

const DEFAULT_APK_CONTENT_TYPE = "application/vnd.android.package-archive";

async function uploadLocalApkToPortal(
  client: PublicationWorkflowClient,
  source: Extract<PublicationSource, { kind: "apk-file" }>,
  logger?: PublicationWorkflowLogger
): Promise<PublicationCreateIngestionSessionInput["source"]> {
  const createUploadTarget = client.createUploadTarget;
  if (!createUploadTarget) {
    throw new Error(
      "Local apk-file sources require a createUploadTarget client method"
    );
  }

  const fileStat = await stat(source.filePath);
  const contentType = source.mimeType ?? DEFAULT_APK_CONTENT_TYPE;
  const fileHash = await hashFileSha256(source.filePath);
  const fileName = ensureApkFileName(
    source.fileName || basename(source.filePath)
  );

  logWorkflowInfo(logger, "Uploading APK to portal storage", {
    step: "source.upload",
    status: "running",
    fileName,
    filePath: source.filePath,
    fileSize: fileStat.size,
  });

  const uploadTarget = await createUploadTarget({
    fileHash,
    fileExtension: "apk",
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

    logWorkflowDebug(logger, "Uploading APK to portal storage", {
      step: "source.upload",
      status: "running",
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
    })
  );

  const uploadResponse = await fetch(uploadTarget.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "content-length": String(totalBytes),
    },
    body: uploadBody,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload APK to portal storage: ${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  uploadedBytes = totalBytes;
  emitUploadProgress(true);

  logWorkflowInfo(logger, "APK uploaded to portal storage", {
    step: "source.upload",
    status: "complete",
    fileName,
    publicUrl: uploadTarget.publicUrl,
  });

  return {
    kind: "portalUpload",
    releaseFileUrl: uploadTarget.publicUrl,
    releaseFileName: fileName,
    releaseFileSize: fileStat.size,
    releaseFileHash: fileHash,
    contentType,
  };
}

export async function preparePublicationSource(
  client: PublicationWorkflowClient,
  source: PublicationSource,
  logger?: PublicationWorkflowLogger
): Promise<PublicationCreateIngestionSessionInput["source"]> {
  switch (source.kind) {
    case "portalUpload":
      logWorkflowInfo(logger, "Using portal-hosted APK source", {
        step: "source.ready",
        status: "complete",
        fileName: source.releaseFileName,
      });
      return source;
    case "externalUrl":
      logWorkflowInfo(logger, "Using external APK URL", {
        step: "source.ready",
        status: "complete",
        fileName: source.releaseFileName ?? inferFileNameFromUrl(source.apkUrl),
        apkUrl: source.apkUrl,
      });
      return source;
    case "existingRelease":
      logWorkflowInfo(logger, "Using an existing release as the source", {
        step: "source.ready",
        status: "complete",
        sourceReleaseId: source.sourceReleaseId,
      });
      return source;
    case "apk-url":
      logWorkflowInfo(logger, "Preparing external APK URL", {
        step: "source.ready",
        status: "running",
        fileName:
          source.fileName ??
          inferFileNameFromUrl(source.canonicalUrl ?? source.url),
        apkUrl: source.canonicalUrl ?? source.url,
      });
      return {
        kind: "externalUrl",
        apkUrl: source.canonicalUrl ?? source.url,
        releaseFileName:
          source.fileName ??
          inferFileNameFromUrl(source.canonicalUrl ?? source.url),
      };
    case "apk-file":
      return uploadLocalApkToPortal(client, source, logger);
    default: {
      const exhaustiveCheck: never = source;
      return exhaustiveCheck;
    }
  }
}
