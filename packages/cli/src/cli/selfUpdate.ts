import { readFile } from "node:fs/promises";

import semver from "semver";
import updateNotifier from "update-notifier";

import { Constants } from "./constants.js";

type CliPackageMetadata = {
  name: string;
  version: string;
};

const FALLBACK_CLI_PACKAGE: CliPackageMetadata = {
  name: "@solana-mobile/dapp-store-cli",
  version: Constants.CLI_VERSION,
};

async function loadCliPackageMetadata(): Promise<CliPackageMetadata> {
  try {
    const packageContents = await readFile(
      new URL("../../package.json", import.meta.url),
      { encoding: "utf8" }
    );
    const parsed: unknown = JSON.parse(packageContents);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).name === "string" &&
      typeof (parsed as Record<string, unknown>).version === "string"
    ) {
      return {
        name: String((parsed as Record<string, unknown>).name),
        version: String((parsed as Record<string, unknown>).version),
      };
    }
  } catch {
    return FALLBACK_CLI_PACKAGE;
  }

  return FALLBACK_CLI_PACKAGE;
}

export const checkForSelfUpdate = async () => {
  const notifier = updateNotifier({ pkg: await loadCliPackageMetadata() });
  const updateInfo = await notifier.fetchInfo();

  const latestVersion = new semver.SemVer(updateInfo.latest);
  const currentVersion = new semver.SemVer(updateInfo.current);

  if (
    latestVersion.major > currentVersion.major ||
    latestVersion.minor > currentVersion.minor
  ) {
    throw new Error(
      `Please update to the latest version of the dApp Store CLI before proceeding.\nCurrent version is ${currentVersion.raw}\nLatest version is ${latestVersion.raw}`
    );
  }
};
