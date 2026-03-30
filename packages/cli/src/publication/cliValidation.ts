import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LOCAL_PORTAL_URL = 'http://localhost:3333';
export const DEFAULT_PRODUCTION_PORTAL_URL =
  'https://publish.solanamobile.com';
export const DEFAULT_API_KEY_ENV = 'DAPP_STORE_API_KEY';

export type NewVersionCliOptions = {
  apkFile?: string;
  apkUrl?: string;
  whatsNew?: string;
  portalUrl?: string;
  apiBaseUrl?: string;
  portalWebUrl?: string;
  apiKeyEnv?: string;
  apiKeyStdin?: boolean;
  signerKeypair?: string;
  localDev?: boolean;
  skipSelfUpdate?: boolean;
  idempotencyKey?: string;
  dappId?: string;
  verbose?: boolean;
};

export type ResumeCliOptions = {
  releaseId?: string;
  sessionId?: string;
  resumeRelease?: string;
  resumeSession?: string;
  portalUrl?: string;
  apiBaseUrl?: string;
  portalWebUrl?: string;
  apiKeyEnv?: string;
  apiKeyStdin?: boolean;
  signerKeypair?: string;
  localDev?: boolean;
  skipSelfUpdate?: boolean;
  verbose?: boolean;
};

export type ResolvedPortalTargets = {
  apiBaseUrl: string;
};

function normalizeUrl(value: string, label: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function derivePortalUrl(apiBaseUrl: string): string {
  const normalized = new URL(apiBaseUrl);
  if (normalized.pathname === '/api') {
    normalized.pathname = '/';
  } else if (normalized.pathname.endsWith('/api')) {
    normalized.pathname = normalized.pathname.slice(0, -4);
  }
  return normalized.toString().replace(/\/$/, '');
}

function deriveApiBaseUrl(portalUrl: string): string {
  const normalized = new URL(portalUrl);
  const basePath = normalized.pathname.replace(/\/$/, '');
  normalized.pathname =
    basePath.length === 0 ? '/api' : `${basePath}/api`;
  return normalized.toString().replace(/\/$/, '');
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

export function resolvePortalTargets(input: {
  portalUrl?: string;
  apiBaseUrl?: string;
  portalWebUrl?: string;
  localDev?: boolean;
}): ResolvedPortalTargets {
  const legacyApiBaseUrl =
    input.apiBaseUrl ?? process.env.DAPP_STORE_PORTAL_API_BASE_URL;
  const portalUrl =
    input.portalUrl ??
    input.portalWebUrl ??
    process.env.DAPP_STORE_PORTAL_URL ??
    process.env.DAPP_STORE_PORTAL_WEB_URL ??
    (input.localDev ? DEFAULT_LOCAL_PORTAL_URL : undefined) ??
    (legacyApiBaseUrl ? derivePortalUrl(legacyApiBaseUrl) : undefined) ??
    DEFAULT_PRODUCTION_PORTAL_URL;

  const normalizedPortalUrl = normalizeUrl(
    portalUrl ?? derivePortalUrl(legacyApiBaseUrl!),
    'portal URL',
  );
  const normalizedApiBaseUrl = normalizeUrl(
    legacyApiBaseUrl ?? deriveApiBaseUrl(normalizedPortalUrl),
    'portal API base URL',
  );

  if (input.localDev) {
    const localTargets = [
      ['portal URL', normalizedPortalUrl],
      ['portal API base URL', normalizedApiBaseUrl],
    ] as const;

    const nonLocalTarget = localTargets.find(([, value]) => !isLocalhostUrl(value));
    if (nonLocalTarget) {
      throw new Error(
        `--local-dev only allows localhost portal endpoints. Received ${nonLocalTarget[0]}: ${nonLocalTarget[1]}`,
      );
    }
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
  };
}

export function validateNewVersionArgs(input: NewVersionCliOptions): void {
  const apkSourceCount =
    (input.apkFile ? 1 : 0) + (input.apkUrl ? 1 : 0);
  if (apkSourceCount !== 1) {
    throw new Error('Specify exactly one of `--apk-file` or `--apk-url`.');
  }

  if (!input.whatsNew || input.whatsNew.trim().length === 0) {
    throw new Error('`--whats-new` is required.');
  }

  if (!input.signerKeypair || input.signerKeypair.trim().length === 0) {
    throw new Error('`--signer-keypair` is required.');
  }

  if (input.apkFile) {
    const apkPath = path.resolve(input.apkFile);
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK file not found: ${apkPath}`);
    }
  }

  if (input.apkUrl) {
    let parsed: URL;
    try {
      parsed = new URL(input.apkUrl);
    } catch {
      throw new Error('`--apk-url` must be a valid HTTPS URL.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('`--apk-url` must use HTTPS.');
    }
  }
}

export function validateResumeArgs(input: ResumeCliOptions): void {
  const releaseId = resolveResumeTarget(
    input.releaseId,
    input.resumeRelease,
    '--release-id',
    '--resume-release',
  );
  const sessionId = resolveResumeTarget(
    input.sessionId,
    input.resumeSession,
    '--session-id',
    '--resume-session',
  );
  const resumeTargetCount =
    (releaseId ? 1 : 0) + (sessionId ? 1 : 0);
  if (resumeTargetCount !== 1) {
    throw new Error('Specify exactly one of `--release-id` or `--session-id`.');
  }

  if (!input.signerKeypair || input.signerKeypair.trim().length === 0) {
    throw new Error('`--signer-keypair` is required.');
  }
}

function resolveResumeTarget(
  primary?: string,
  alias?: string,
  primaryLabel?: string,
  aliasLabel?: string,
): string | undefined {
  const trimmedPrimary = primary?.trim();
  const trimmedAlias = alias?.trim();

  if (
    trimmedPrimary &&
    trimmedAlias &&
    trimmedPrimary !== trimmedAlias
  ) {
    throw new Error(
      `Conflicting values were provided for ${primaryLabel} and ${aliasLabel}.`,
    );
  }

  return trimmedPrimary ?? trimmedAlias;
}

export async function resolveApiKey(input: {
  apiKeyEnv?: string;
  apiKeyStdin?: boolean;
}): Promise<string> {
  const envVarName = input.apiKeyEnv ?? DEFAULT_API_KEY_ENV;

  if (input.apiKeyStdin) {
    return await readSecretFromStdin();
  }

  const envValue = process.env[envVarName]?.trim();
  if (envValue) {
    return envValue;
  }

  throw new Error(
    `Portal API key is required. Set ${envVarName} or pass --api-key-stdin.`,
  );
}

async function readSecretFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('No API key was piped into stdin.');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const value = Buffer.concat(chunks).toString('utf8').trim();
  if (!value) {
    throw new Error('No API key was provided on stdin.');
  }

  return value;
}
