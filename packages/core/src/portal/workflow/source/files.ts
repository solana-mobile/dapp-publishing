import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";

export function ensureApkFileName(fileName: string): string {
  return /\.apk$/i.test(fileName) ? fileName : `${fileName}.apk`;
}

export function inferFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const fileName = basename(pathname);
    return fileName.length > 0 ? fileName : "release.apk";
  } catch {
    return "release.apk";
  }
}

export function normalizeLocalFileAccessError(
  filePath: string,
  error: unknown
): Error {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (code === "EPERM" || code === "EACCES") {
    return new Error(
      `Cannot read local APK at ${filePath}. macOS denied access to this location (${code}). Move the APK out of Downloads into your workspace or another accessible folder, or grant this app Full Disk Access, then retry.`
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  try {
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk);
    }
  } catch (error) {
    throw normalizeLocalFileAccessError(filePath, error);
  }

  return hash.digest("hex");
}
