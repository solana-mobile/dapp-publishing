import { beforeEach, expect } from '@jest/globals';
import {
  mainCli,
} from '../CliSetup';
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_LOCAL_PORTAL_API_BASE_URL,
  validateNewVersionArgs,
  validateResumeArgs,
  resolvePortalTargets,
} from '../publication/cliValidation';

describe('CLI surface', () => {
  const outputHelpReference = '(outputHelp)';

  let errorOutput = '';
  let otherOutput = '';

  beforeEach(() => {
    errorOutput = '';
    otherOutput = '';
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
  });

  test('version reports the package version', () => {
    expect(() => {
      mainCli.parse(['node', 'dapp-store', '-V']);
    }).toThrow();
  });

  test('help advertises the update-only surface', () => {
    expect(() => {
      mainCli.parse(['node', 'dapp-store', '--help']);
    }).toThrow(outputHelpReference);

    expect(otherOutput).toContain('--new-version');
    expect(otherOutput).toContain('resume');
    expect(otherOutput).toContain('--apk-file');
    expect(otherOutput).toContain('--apk-url');
    expect(otherOutput).not.toContain('--dapp-id');
    expect(otherOutput).not.toContain('--fee-payer-keypair');
  });

  test('new-version validation rejects ambiguous APK sources', () => {
    expect(() =>
      validateNewVersionArgs({
        newVersion: true,
        apkFile: '/tmp/app.apk',
        apkUrl: 'https://example.com/app.apk',
        whatsNew: 'Fixes',
        signerKeypair: '/tmp/signer.json',
      }),
    ).toThrow('exactly one of `--apk-file` or `--apk-url`');
  });

  test('new-version validation rejects missing APK source', () => {
    expect(() =>
      validateNewVersionArgs({
        newVersion: true,
        whatsNew: 'Fixes',
        signerKeypair: '/tmp/signer.json',
      }),
    ).toThrow('exactly one of `--apk-file` or `--apk-url`');
  });

  test('new-version validation accepts a single HTTPS APK URL', () => {
    expect(() =>
      validateNewVersionArgs({
        newVersion: true,
        apkUrl: 'https://example.com/app.apk',
        whatsNew: 'Fixes',
        signerKeypair: '/tmp/signer.json',
      }),
    ).not.toThrow();
  });

  test('new-version validation does not require a dapp id', () => {
    expect(() =>
      validateNewVersionArgs({
        newVersion: true,
        apkUrl: 'https://example.com/app.apk',
        whatsNew: 'Fixes',
        signerKeypair: '/tmp/signer.json',
      }),
    ).not.toThrow();
  });

  test('resume validation requires a single target', () => {
    expect(() =>
      validateResumeArgs({
        releaseId: 'release-1',
        sessionId: 'session-1',
        signerKeypair: '/tmp/signer.json',
      }),
    ).toThrow('exactly one of `--release-id` or `--session-id`');
  });

  test('resume validation accepts a release id', () => {
    expect(() =>
      validateResumeArgs({
        releaseId: 'release-1',
        signerKeypair: '/tmp/signer.json',
      }),
    ).not.toThrow();
  });

  test('portal targets default to localhost in local-dev mode', () => {
    const targets = resolvePortalTargets({
      localDev: true,
      rpcUrl: 'https://api.mainnet-beta.solana.com',
    });

    expect(targets.apiBaseUrl).toBe(DEFAULT_LOCAL_PORTAL_API_BASE_URL);
    expect(targets.portalWebUrl).toContain('localhost:3333');
  });

  test('local-dev mode ignores shared portal env defaults', () => {
    const previousApiBaseUrl = process.env.DAPP_STORE_PORTAL_API_BASE_URL;
    const previousWebUrl = process.env.DAPP_STORE_PORTAL_WEB_URL;

    process.env.DAPP_STORE_PORTAL_API_BASE_URL =
      'https://portal.example.com/api';
    process.env.DAPP_STORE_PORTAL_WEB_URL = 'https://portal.example.com';

    try {
      const targets = resolvePortalTargets({
        localDev: true,
        rpcUrl: 'https://api.mainnet-beta.solana.com',
      });

      expect(targets.apiBaseUrl).toBe(DEFAULT_LOCAL_PORTAL_API_BASE_URL);
      expect(targets.portalWebUrl).toContain('localhost:3333');
    } finally {
      process.env.DAPP_STORE_PORTAL_API_BASE_URL = previousApiBaseUrl;
      process.env.DAPP_STORE_PORTAL_WEB_URL = previousWebUrl;
    }
  });

  test('local-dev mode rejects non-local portal URLs', () => {
    expect(() =>
      resolvePortalTargets({
        localDev: true,
        apiBaseUrl: 'https://portal.example.com/api',
        portalWebUrl: 'https://portal.example.com',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
      }),
    ).toThrow('only allows localhost portal endpoints');
  });

  test('portal targets honor the configured API key env name', () => {
    expect(DEFAULT_API_KEY_ENV).toBe('DAPP_STORE_API_KEY');
  });
});
