import { randomUUID } from 'node:crypto';
import path from 'node:path';

import * as dotenv from 'dotenv';
import { Command, Option } from 'commander';

import {
  checkForSelfUpdate,
  Constants,
  createPortalAttestationClient,
  createPortalWorkflowClient,
  createPublicationSignerFromKeypair,
  parseKeypair,
  showMessage,
} from './CliUtils.js';
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PRODUCTION_PORTAL_URL,
  resolveApiKey,
  resolvePortalTargets,
  validateNewVersionArgs,
  validateResumeArgs,
  type NewVersionCliOptions,
  type ResumeCliOptions,
  type ResolvedPortalTargets,
} from './publication/cliValidation.js';
import { createPublicationProgressReporter } from './publication/PublicationProgressReporter.js';
import { extractPublicationSummaryLines } from './publication/publicationSummary.js';
import { runPublicationWorkflow } from './publication/runPublicationWorkflow.js';
import type {
  PublicationResumeInput,
  PublicationWorkflowInput,
} from './publication/runPublicationWorkflow.js';

dotenv.config();

export const mainCli = new Command();

mainCli
  .name('dapp-store')
  .version(Constants.CLI_VERSION)
  .description('Portal-backed CLI for Solana Mobile dApp version publishing')
  .showHelpAfterError();

mainCli
  .option('--apk-file <path>', 'Path to the APK file to publish')
  .option('--apk-url <url>', 'HTTPS URL for an externally hosted APK')
  .option('--whats-new <text>', 'What changed in this version')
  .option('--portal-url <url>', 'Publishing portal base URL')
  .option(
    '--api-key-env <name>',
    'Environment variable that contains the portal API key',
    DEFAULT_API_KEY_ENV,
  )
  .option(
    '--api-key-stdin',
    'Read the portal API key from stdin instead of an env var',
  )
  .option('--signer-keypair <path>', 'Path to the Solana signer keypair')
  .addOption(new Option('--rpc-url <url>', 'Solana RPC URL').hideHelp())
  .option('--local-dev', 'Allow localhost portal endpoints and skip gating')
  .option(
    '--skip-self-update',
    'Bypass the self-update check when working against a local portal',
  )
  .option(
    '--idempotency-key <key>',
    'Optional idempotency key for safe retries',
  )
  .option(
    '--verbose',
    'Print detailed publication identifiers as they are emitted',
  )
  .action(async () => {
    await runRootAction();
  });

const resumeCommand = mainCli.command('resume');

resumeCommand
  .description('Resume a partially completed publication session')
  .option('--release-id <id>', 'Publication release identifier')
  .option('--resume-release <id>', 'Alias for --release-id')
  .option('--session-id <id>', 'Publication session identifier')
  .option('--resume-session <id>', 'Alias for --session-id')
  .option('--portal-url <url>', 'Publishing portal base URL')
  .option(
    '--api-key-env <name>',
    'Environment variable that contains the portal API key',
    DEFAULT_API_KEY_ENV,
  )
  .option(
    '--api-key-stdin',
    'Read the portal API key from stdin instead of an env var',
  )
  .option('--signer-keypair <path>', 'Path to the Solana signer keypair')
  .addOption(new Option('--rpc-url <url>', 'Solana RPC URL').hideHelp())
  .option('--local-dev', 'Allow localhost portal endpoints and skip gating')
  .option(
    '--skip-self-update',
    'Bypass the self-update check when working against a local portal',
  )
  .option(
    '--verbose',
    'Print detailed publication identifiers as they are emitted',
  )
  .action(async (options: ResumeCliOptions) => {
    await runResumeAction(options);
  });

mainCli.addHelpText(
  'after',
  [
    '',
    'Usage:',
    '  dapp-store --apk-file ./app.apk --whats-new "Bug fixes"',
    '  dapp-store --apk-url https://example.com/app.apk --whats-new "Bug fixes"',
    '  dapp-store resume --release-id <release-id> [--session-id <session-id>]',
    '',
    'Portal:',
    '  Set DAPP_STORE_PORTAL_URL to the portal origin (for example https://staging.publish.solanamobile.com).',
    '  The CLI derives the /api endpoint from that URL for the active publication workflow.',
    `  If unset, it defaults to ${DEFAULT_PRODUCTION_PORTAL_URL}.`,
    '  The target app must already exist in the portal and already have its App NFT.',
    '  The portal decides whether the submission is the first release for an existing app or a later update.',
    '',
    'Secrets:',
    `  Portal API key defaults to ${DEFAULT_API_KEY_ENV} or the name passed via --api-key-env.`,
    '  Use --api-key-stdin to read the portal API key from stdin.',
    '',
    'Local development:',
    '  Pass --local-dev to allow localhost portal endpoints and to skip self-update gating.',
    '  Local-dev mode rejects non-local portal URLs.',
  ].join('\n'),
);

async function runRootAction() {
  await runWithUserFacingErrors(async () => {
    const options = mainCli.opts() as NewVersionCliOptions;

    if (!hasPublicationInputs(options)) {
      mainCli.outputHelp();
      return;
    }

    validateNewVersionArgs(options);
    enforceSelfUpdatePolicy(options);

    const targets = resolvePortalTargets(options);
    const apiKey = await resolveApiKey(options);
    const signer = loadSigner(options.signerKeypair);
    const clients = createPortalClients(targets, apiKey);
    const progress = createPublicationProgressReporter({
      title: 'Publishing version',
      mode: 'new-version',
      verbose: options.verbose,
    });

    progress.start({
      message: 'Connecting to publishing portal',
      metadata: buildNewVersionProgressMetadata(options),
    });

    try {
      const result = await runPublicationWorkflow({
        mode: 'new-version',
        client: clients.workflowClient,
        input: buildNewVersionWorkflowInput(
          options,
          signer,
          clients.attestationClient,
        ),
        options: {
          logger: progress.logger,
        },
      });

      progress.complete(result);
      showPublicationSummary('Version publication completed', result);
    } catch (error) {
      progress.fail(error);
      throw error;
    }
  });
}

async function runResumeAction(options: ResumeCliOptions) {
  await runWithUserFacingErrors(async () => {
    validateResumeArgs(options);
    enforceSelfUpdatePolicy(options);

    const targets = resolvePortalTargets(options);
    const apiKey = await resolveApiKey(options);
    const signer = loadSigner(options.signerKeypair);
    const clients = createPortalClients(targets, apiKey);
    const progress = createPublicationProgressReporter({
      title: 'Resuming publication',
      mode: 'resume',
      verbose: options.verbose,
    });

    progress.start({
      message: 'Connecting to publishing portal',
      metadata: buildResumeProgressMetadata(options),
    });

    try {
      const result = await runPublicationWorkflow({
        mode: 'resume',
        client: clients.workflowClient,
        input: buildResumeWorkflowInput(
          options,
          signer,
          clients.attestationClient,
        ),
        options: {
          logger: progress.logger,
        },
      });

      progress.complete(result);
      showPublicationSummary('Publication resume completed', result);
    } catch (error) {
      progress.fail(error);
      throw error;
    }
  });
}

function createPortalClients(
  targets: ResolvedPortalTargets,
  apiKey: string,
) {
  return {
    workflowClient: createPortalWorkflowClient({
      apiBaseUrl: targets.apiBaseUrl,
      apiKey,
    }),
    attestationClient: createPortalAttestationClient({
      apiBaseUrl: targets.apiBaseUrl,
      apiKey,
    }),
  };
}

function buildNewVersionWorkflowInput(
  options: NewVersionCliOptions,
  signer: ReturnType<typeof createPublicationSignerFromKeypair>,
  attestationClient: PublicationWorkflowInput['attestationClient'],
): PublicationWorkflowInput {
  return {
    source: buildPublicationSource(options),
    whatsNew: options.whatsNew ?? '',
    idempotencyKey: options.idempotencyKey ?? randomUUID(),
    signer,
    attestationClient,
  };
}

function buildResumeWorkflowInput(
  options: ResumeCliOptions,
  signer: ReturnType<typeof createPublicationSignerFromKeypair>,
  attestationClient: PublicationResumeInput['attestationClient'],
): PublicationResumeInput {
  return {
    publicationSessionId: resolveResumeSessionId(options),
    releaseId: resolveResumeReleaseId(options),
    signer,
    attestationClient,
  };
}

function buildPublicationSource(options: NewVersionCliOptions) {
  if (options.apkFile) {
    return {
      kind: 'apk-file' as const,
      filePath: options.apkFile,
      fileName: path.basename(options.apkFile),
    };
  }

  if (!options.apkUrl) {
    throw new Error('`--apk-file` or `--apk-url` is required.');
  }

  return {
    kind: 'apk-url' as const,
    url: options.apkUrl,
    fileName: inferFileNameFromUrl(options.apkUrl),
  };
}

function buildNewVersionProgressMetadata(
  options: NewVersionCliOptions,
): Record<string, string> {
  if (options.apkFile) {
    return {
      sourceKind: 'apk-file',
      fileName: path.basename(options.apkFile),
    };
  }

  if (options.apkUrl) {
    const fileName = inferFileNameFromUrl(options.apkUrl);
    return {
      sourceKind: 'apk-url',
      apkUrl: options.apkUrl,
      ...(fileName ? { fileName } : {}),
    };
  }

  return {};
}

function buildResumeProgressMetadata(
  options: ResumeCliOptions,
): Record<string, string> {
  const publicationSessionId = resolveResumeSessionId(options);
  const releaseId = resolveResumeReleaseId(options);

  return {
    ...(publicationSessionId ? { publicationSessionId } : {}),
    ...(releaseId ? { releaseId } : {}),
  };
}

function inferFileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split('/').filter(Boolean).pop();
    return fileName || undefined;
  } catch {
    return undefined;
  }
}

function enforceSelfUpdatePolicy(
  options: NewVersionCliOptions | ResumeCliOptions,
) {
  if (options.skipSelfUpdate && !options.localDev) {
    throw new Error(
      '`--skip-self-update` is only allowed together with `--local-dev`.',
    );
  }
}

function resolveResumeReleaseId(options: ResumeCliOptions): string | undefined {
  return options.releaseId ?? options.resumeRelease;
}

function resolveResumeSessionId(options: ResumeCliOptions): string | undefined {
  return options.sessionId ?? options.resumeSession;
}

function loadSigner(keypairPath?: string) {
  if (!keypairPath) {
    throw new Error('`--signer-keypair` is required.');
  }

  const keypair = parseKeypair(keypairPath);
  if (!keypair) {
    throw new Error('Failed to load the signer keypair.');
  }

  return createPublicationSignerFromKeypair(keypair);
}

function hasPublicationInputs(options: NewVersionCliOptions): boolean {
  return Boolean(
    options.apkFile ||
      options.apkUrl ||
      options.whatsNew ||
      options.portalUrl ||
      options.signerKeypair ||
      options.idempotencyKey ||
      options.dappId ||
      options.verbose,
  );
}

function showPublicationSummary(title: string, result: unknown) {
  const summaryLines = extractPublicationSummaryLines(result);
  showMessage(title, summaryLines.join('\n'), 'standard');
}

async function runWithUserFacingErrors(block: () => Promise<void>) {
  try {
    await block();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    showMessage('Error', message, 'error');
    process.exitCode = 1;
  }
}
