export function ensureHttpsUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://')) {
    return trimmed.replace(/^http:\/\//, 'https://');
  }

  return `https://${trimmed}`;
}

export function inferFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = pathname.split('/').filter(Boolean).pop();
    return basename || 'app-release.apk';
  } catch {
    return 'app-release.apk';
  }
}

export function inferFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim().toLowerCase() || 'apk';
  return extension.replace(/[^a-z0-9]/g, '') || 'apk';
}

export function ensureApkFileName(fileName: string): string {
  return /\.apk$/i.test(fileName) ? fileName : `${fileName}.apk`;
}

export function inferMimeType(fileName: string): string {
  const extension = inferFileExtension(fileName);
  if (extension === 'apk') {
    return 'application/vnd.android.package-archive';
  }
  if (extension === 'json') {
    return 'application/json';
  }
  return 'application/octet-stream';
}

export function toBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64');
}

export function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}
