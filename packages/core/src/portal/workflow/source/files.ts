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

export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}
