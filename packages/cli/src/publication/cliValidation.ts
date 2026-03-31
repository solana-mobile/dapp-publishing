import fs from "node:fs";
import path from "node:path";

export const DEFAULT_LOCAL_PORTAL_URL = "http://localhost:3333";
export const DEFAULT_PRODUCTION_PORTAL_URL = "https://publish.solanamobile.com";
export const DEFAULT_API_KEY_ENV = "DAPP_STORE_API_KEY";
export const UPDATED_PUBLISHING_CLI_DOCS_URL =
  "https://docs.solanamobile.com/dapp-store/publishing-cli/publishing-updates";

export type NewVersionCliOptions = {
  apkFile?: string;
  apkUrl?: string;
  whatsNew?: string;
  portalUrl?: string;
  apiKeyEnv?: string;
  apiKeyStdin?: boolean;
  keypair?: string;
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
  apiKeyEnv?: string;
  apiKeyStdin?: boolean;
  keypair?: string;
  localDev?: boolean;
  skipSelfUpdate?: boolean;
  verbose?: boolean;
};

export type ResolvedPortalTargets = {
  apiBaseUrl: string;
};

function normalizeUrl(value: string, label: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function deriveApiBaseUrl(portalUrl: string): string {
  const normalized = new URL(portalUrl);
  const basePath = normalized.pathname.replace(/\/$/, "");
  normalized.pathname = basePath.length === 0 ? "/api" : `${basePath}/api`;
  return normalized.toString().replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function resolvePortalTargets(input: {
  portalUrl?: string;
  localDev?: boolean;
}): ResolvedPortalTargets {
  const portalUrl =
    input.portalUrl ??
    process.env.DAPP_STORE_PORTAL_URL ??
    (input.localDev ? DEFAULT_LOCAL_PORTAL_URL : undefined) ??
    DEFAULT_PRODUCTION_PORTAL_URL;

  const normalizedPortalUrl = normalizeUrl(portalUrl, "portal URL");
  const normalizedApiBaseUrl = normalizeUrl(
    deriveApiBaseUrl(normalizedPortalUrl),
    "portal API base URL"
  );

  if (input.localDev) {
    const localTargets = [
      ["portal URL", normalizedPortalUrl],
      ["portal API base URL", normalizedApiBaseUrl],
    ] as const;

    const nonLocalTarget = localTargets.find(
      ([, value]) => !isLocalhostUrl(value)
    );
    if (nonLocalTarget) {
      throw new Error(
        `--local-dev only allows localhost portal endpoints. Received ${nonLocalTarget[0]}: ${nonLocalTarget[1]}`
      );
    }
  }

  if (!input.localDev) {
    const portalTargets = [
      ["portal URL", normalizedPortalUrl],
      ["portal API base URL", normalizedApiBaseUrl],
    ] as const;
    const insecureTarget = portalTargets.find(([, value]) => {
      return new URL(value).protocol !== "https:";
    });

    if (insecureTarget) {
      throw new Error(
        `Portal endpoints must use HTTPS unless --local-dev is set. Received ${insecureTarget[0]}: ${insecureTarget[1]}`
      );
    }
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
  };
}

export function validateNewVersionArgs(input: NewVersionCliOptions): void {
  const apkSourceCount = (input.apkFile ? 1 : 0) + (input.apkUrl ? 1 : 0);
  if (apkSourceCount !== 1) {
    throw new Error("Specify exactly one of `--apk-file` or `--apk-url`.");
  }

  if (!input.whatsNew || input.whatsNew.trim().length === 0) {
    throw new Error("`--whats-new` is required.");
  }

  if (!input.keypair || input.keypair.trim().length === 0) {
    throw new Error("`--keypair` is required.");
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
      throw new Error("`--apk-url` must be a valid HTTPS URL.");
    }

    if (parsed.protocol !== "https:") {
      throw new Error("`--apk-url` must use HTTPS.");
    }
  }
}

export function validateResumeArgs(input: ResumeCliOptions): void {
  const releaseId = resolveResumeTarget(
    input.releaseId,
    input.resumeRelease,
    "--release-id",
    "--resume-release"
  );
  const sessionId = resolveResumeTarget(
    input.sessionId,
    input.resumeSession,
    "--session-id",
    "--resume-session"
  );
  const resumeTargetCount = (releaseId ? 1 : 0) + (sessionId ? 1 : 0);
  if (resumeTargetCount !== 1) {
    throw new Error("Specify exactly one of `--release-id` or `--session-id`.");
  }

  if (!input.keypair || input.keypair.trim().length === 0) {
    throw new Error("`--keypair` is required.");
  }
}

function resolveResumeTarget(
  primary?: string,
  alias?: string,
  primaryLabel?: string,
  aliasLabel?: string
): string | undefined {
  const trimmedPrimary = primary?.trim();
  const trimmedAlias = alias?.trim();

  if (trimmedPrimary && trimmedAlias && trimmedPrimary !== trimmedAlias) {
    throw new Error(
      `Conflicting values were provided for ${primaryLabel} and ${aliasLabel}.`
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
    withUpdatedCliDocs(
      `Portal API key is required. Set ${envVarName} or pass --api-key-stdin.`
    )
  );
}

export function formatUpdatedCliUsageError(message: string): string {
  return withUpdatedCliDocs(normalizeCliErrorMessage(message));
}

async function readSecretFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(withUpdatedCliDocs("No API key was piped into stdin."));
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const value = Buffer.concat(chunks).toString("utf8").trim();
  if (!value) {
    throw new Error(withUpdatedCliDocs("No API key was provided on stdin."));
  }

  return value;
}

function withUpdatedCliDocs(message: string): string {
  return [
    message,
    "",
    "The publishing CLI has changed. See the updated usage guide:",
    UPDATED_PUBLISHING_CLI_DOCS_URL,
  ].join("\n");
}

function normalizeCliErrorMessage(message: string): string {
  const normalized = message.replace(/^error:\s*/i, "").trim();
  if (normalized.length === 0) {
    return "Invalid CLI arguments.";
  }

  const sentence = normalized.endsWith(".") ? normalized : `${normalized}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
