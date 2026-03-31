import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import { mainCli } from "../CliSetup";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_LOCAL_PORTAL_URL,
  DEFAULT_PRODUCTION_PORTAL_URL,
  UPDATED_PUBLISHING_CLI_DOCS_URL,
  formatUpdatedCliUsageError,
  resolveApiKey,
  resolvePortalTargets,
  validateNewVersionArgs,
  validateResumeArgs,
} from "../publication/cliValidation";

describe("CLI surface", () => {
  const outputHelpReference = "(outputHelp)";
  const trackedEnvKeys = [
    DEFAULT_API_KEY_ENV,
    "ALT_DAPP_STORE_API_KEY",
    "DAPP_STORE_PORTAL_URL",
    "DAPP_STORE_PORTAL_WEB_URL",
    "DAPP_STORE_PORTAL_API_BASE_URL",
  ] as const;

  let errorOutput = "";
  let otherOutput = "";
  let tempDir = "";
  let originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    errorOutput = "";
    otherOutput = "";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dapp-store-cli-test-"));
    originalEnv = Object.fromEntries(
      trackedEnvKeys.map((key) => [key, process.env[key]])
    );
    for (const key of trackedEnvKeys) {
      delete process.env[key];
    }

    mainCli.exitOverride();
    mainCli.configureOutput({
      getOutHelpWidth(): number {
        return 200;
      },
      getErrHelpWidth(): number {
        return 200;
      },
      writeOut(str: string) {
        otherOutput += str;
      },
      writeErr(str: string) {
        errorOutput += str;
      },
    });
    process.exitCode = 0;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function createTempApkFile(fileName = "app-release.apk") {
    const apkPath = path.join(tempDir, fileName);
    fs.writeFileSync(apkPath, "apk");
    return apkPath;
  }

  test("version reports the package version", () => {
    expect(() => {
      mainCli.parse(["node", "dapp-store", "-V"]);
    }).toThrow();
  });

  test("help advertises the default publication surface", () => {
    expect(() => {
      mainCli.parse(["node", "dapp-store", "--help"]);
    }).toThrow(outputHelpReference);

    expect(otherOutput).not.toContain("--new-version");
    expect(otherOutput).toContain("resume");
    expect(otherOutput).toContain("--apk-file");
    expect(otherOutput).toContain("--apk-url");
    expect(otherOutput).toContain("--keypair");
    expect(otherOutput).toContain("--portal-url");
    expect(otherOutput).not.toContain("--dapp-id");
    expect(otherOutput).not.toContain("--fee-payer-keypair");
    expect(otherOutput).not.toContain("--signer-keypair");
    expect(errorOutput).toBe("");
  });

  test("new-version validation rejects ambiguous APK sources", () => {
    expect(() =>
      validateNewVersionArgs({
        apkFile: createTempApkFile(),
        apkUrl: "https://example.com/app.apk",
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("exactly one of `--apk-file` or `--apk-url`");
  });

  test("new-version validation rejects missing APK source", () => {
    expect(() =>
      validateNewVersionArgs({
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("exactly one of `--apk-file` or `--apk-url`");
  });

  test("new-version validation rejects blank release notes", () => {
    expect(() =>
      validateNewVersionArgs({
        apkUrl: "https://example.com/app.apk",
        whatsNew: "   ",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("`--whats-new` is required.");
  });

  test("new-version validation rejects missing keypair", () => {
    expect(() =>
      validateNewVersionArgs({
        apkUrl: "https://example.com/app.apk",
        whatsNew: "Fixes",
      })
    ).toThrow("`--keypair` is required.");
  });

  test("new-version validation rejects a missing local APK file", () => {
    expect(() =>
      validateNewVersionArgs({
        apkFile: path.join(tempDir, "missing.apk"),
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("APK file not found");
  });

  test("new-version validation rejects non-HTTPS APK URLs", () => {
    expect(() =>
      validateNewVersionArgs({
        apkUrl: "http://example.com/app.apk",
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("`--apk-url` must use HTTPS.");
  });

  test("new-version validation accepts an existing APK file", () => {
    expect(() =>
      validateNewVersionArgs({
        apkFile: createTempApkFile(),
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).not.toThrow();
  });

  test("new-version validation accepts a single HTTPS APK URL", () => {
    expect(() =>
      validateNewVersionArgs({
        apkUrl: "https://example.com/app.apk",
        whatsNew: "Fixes",
        keypair: "/tmp/signer.json",
      })
    ).not.toThrow();
  });

  test("resume validation requires a single target", () => {
    expect(() =>
      validateResumeArgs({
        releaseId: "release-1",
        sessionId: "session-1",
        keypair: "/tmp/signer.json",
      })
    ).toThrow("exactly one of `--release-id` or `--session-id`");
  });

  test("resume validation accepts alias flags", () => {
    expect(() =>
      validateResumeArgs({
        resumeRelease: "release-1",
        keypair: "/tmp/signer.json",
      })
    ).not.toThrow();

    expect(() =>
      validateResumeArgs({
        resumeSession: "session-1",
        keypair: "/tmp/signer.json",
      })
    ).not.toThrow();
  });

  test("resume validation rejects conflicting release aliases", () => {
    expect(() =>
      validateResumeArgs({
        releaseId: "release-1",
        resumeRelease: "release-2",
        keypair: "/tmp/signer.json",
      })
    ).toThrow(
      "Conflicting values were provided for --release-id and --resume-release."
    );
  });

  test("resume validation accepts a release id", () => {
    expect(() =>
      validateResumeArgs({
        releaseId: "release-1",
        keypair: "/tmp/signer.json",
      })
    ).not.toThrow();
  });

  test("portal targets default to production when unset", () => {
    const targets = resolvePortalTargets({});

    expect(targets.apiBaseUrl).toBe(`${DEFAULT_PRODUCTION_PORTAL_URL}/api`);
  });

  test("portal targets default to localhost in local-dev mode", () => {
    const targets = resolvePortalTargets({
      localDev: true,
    });

    expect(targets.apiBaseUrl).toBe(`${DEFAULT_LOCAL_PORTAL_URL}/api`);
  });

  test("portal targets derive the API base URL from the configured portal URL", () => {
    const targets = resolvePortalTargets({
      portalUrl: "https://staging.publish.solanamobile.com",
    });

    expect(targets.apiBaseUrl).toBe(
      "https://staging.publish.solanamobile.com/api"
    );
  });

  test("portal targets preserve portal subpaths when deriving /api", () => {
    const targets = resolvePortalTargets({
      portalUrl: "https://portal.example.com/publishing",
    });

    expect(targets.apiBaseUrl).toBe(
      "https://portal.example.com/publishing/api"
    );
  });

  test("portal targets honor DAPP_STORE_PORTAL_URL from the environment", () => {
    process.env.DAPP_STORE_PORTAL_URL = "https://env.publish.solanamobile.com";

    const targets = resolvePortalTargets({});

    expect(targets.apiBaseUrl).toBe("https://env.publish.solanamobile.com/api");
  });

  test("portal targets ignore removed legacy portal env vars", () => {
    process.env.DAPP_STORE_PORTAL_WEB_URL =
      "https://legacy-web.publish.solanamobile.com";
    process.env.DAPP_STORE_PORTAL_API_BASE_URL =
      "https://legacy.publish.solanamobile.com/root/api";

    const targets = resolvePortalTargets({});

    expect(targets.apiBaseUrl).toBe(`${DEFAULT_PRODUCTION_PORTAL_URL}/api`);
  });

  test("local-dev mode rejects non-local portal URLs", () => {
    expect(() =>
      resolvePortalTargets({
        localDev: true,
        portalUrl: "https://portal.example.com",
      })
    ).toThrow("only allows localhost portal endpoints");
  });

  test("non-local portal endpoints must use HTTPS", () => {
    expect(() =>
      resolvePortalTargets({
        portalUrl: "http://portal.example.com",
      })
    ).toThrow("Portal endpoints must use HTTPS unless --local-dev is set.");
  });

  test("portal targets honor the configured API key env name", () => {
    expect(DEFAULT_API_KEY_ENV).toBe("DAPP_STORE_API_KEY");
  });

  test("resolveApiKey reads the default API key env var", async () => {
    process.env.DAPP_STORE_API_KEY = "portal-secret";

    await expect(resolveApiKey({})).resolves.toBe("portal-secret");
  });

  test("resolveApiKey reads a custom API key env var", async () => {
    process.env.ALT_DAPP_STORE_API_KEY = "alt-secret";

    await expect(
      resolveApiKey({ apiKeyEnv: "ALT_DAPP_STORE_API_KEY" })
    ).resolves.toBe("alt-secret");
  });

  test("resolveApiKey rejects when no API key is available", async () => {
    await expect(resolveApiKey({})).rejects.toThrow(
      "Portal API key is required."
    );
    await expect(resolveApiKey({})).rejects.toThrow(
      UPDATED_PUBLISHING_CLI_DOCS_URL
    );
  });

  test("formatUpdatedCliUsageError converts unknown-option errors into docs guidance", () => {
    expect(formatUpdatedCliUsageError("error: unknown option '-k'")).toContain(
      "Unknown option '-k'."
    );
    expect(formatUpdatedCliUsageError("error: unknown option '-k'")).toContain(
      UPDATED_PUBLISHING_CLI_DOCS_URL
    );
  });
});
