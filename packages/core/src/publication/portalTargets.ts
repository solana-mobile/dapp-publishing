import { PublishingError } from "../errors.js";

export const DEFAULT_LOCAL_PORTAL_URL = "http://localhost:3333";
export const DEFAULT_PRODUCTION_PORTAL_URL = "https://publish.solanamobile.com";

export type ResolvedPortalTargets = {
  apiBaseUrl: string;
};

function normalizeUrl(value: string, label: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new PublishingError(
      "INVALID_PORTAL_URL",
      `Invalid ${label}: ${value}`
    );
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
      throw new PublishingError(
        "INVALID_PORTAL_URL",
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
      throw new PublishingError(
        "INVALID_PORTAL_URL",
        `Portal endpoints must use HTTPS unless --local-dev is set. Received ${insecureTarget[0]}: ${insecureTarget[1]}`
      );
    }
  }

  return {
    apiBaseUrl: normalizedApiBaseUrl,
  };
}
