import * as readline from 'node:readline';

import type {
  PublicationWorkflowLogger,
  PublicationWorkflowResult,
} from './runPublicationWorkflow.js';

type PublicationProgressMode = 'new-version' | 'resume';

type ProgressPhaseKey =
  | 'source'
  | 'ingestion'
  | 'context'
  | 'mint'
  | 'verify'
  | 'attest'
  | 'submit';

type ProgressPhaseState = 'pending' | 'active' | 'complete';

type ProgressMetadata = Record<string, unknown>;

type ProgressSourceKind = 'apk-file' | 'apk-url' | 'resume';

type ProgressContext = Partial<{
  sourceKind: ProgressSourceKind;
  fileName: string;
  apkUrl: string;
  sourceReleaseId: string;
  androidPackage: string;
  versionName: string;
  releaseId: string;
  publicationSessionId: string;
  ingestionSessionId: string;
  mintAddress: string;
  transactionSignature: string;
  hubspotTicketId: string;
  requestUniqueId: string;
  fileSize: number;
  bytesUploaded: number;
  bytesTotal: number;
  ingestionStatus: string;
  activeStep: string;
}>;

const SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;

const PHASES: Array<{ key: ProgressPhaseKey; label: string }> = [
  { key: 'source', label: 'Prepare source' },
  { key: 'ingestion', label: 'Process APK' },
  { key: 'context', label: 'Load release context' },
  { key: 'mint', label: 'Mint release NFT' },
  { key: 'verify', label: 'Verify collection' },
  { key: 'attest', label: 'Create attestation' },
  { key: 'submit', label: 'Submit to review' },
];

const PHASE_WEIGHT_PROFILES: Record<
  ProgressSourceKind,
  Record<ProgressPhaseKey, number>
> = {
  'apk-file': {
    source: 0.42,
    ingestion: 0.2,
    context: 0.08,
    mint: 0.12,
    verify: 0.08,
    attest: 0.04,
    submit: 0.06,
  },
  'apk-url': {
    source: 0.05,
    ingestion: 0.43,
    context: 0.12,
    mint: 0.16,
    verify: 0.1,
    attest: 0.05,
    submit: 0.09,
  },
  resume: {
    source: 0.42,
    ingestion: 0.2,
    context: 0.08,
    mint: 0.12,
    verify: 0.08,
    attest: 0.04,
    submit: 0.06,
  },
};

const STEP_PROGRESS_RANGES: Record<
  string,
  { start: number; end: number }
> = {
  'source.prepare': { start: 0.02, end: 0.1 },
  'source.upload': { start: 0.1, end: 1 },
  'source.ready': { start: 0.2, end: 1 },
  'ingestion.create': { start: 0.05, end: 0.2 },
  'ingestion.wait': { start: 0.2, end: 1 },
  'bundle.load': { start: 0.1, end: 0.55 },
  'session.load': { start: 0.55, end: 1 },
  'mint.prepare': { start: 0.05, end: 0.3 },
  'mint.submit': { start: 0.3, end: 0.65 },
  'mint.save': { start: 0.65, end: 1 },
  'verify.prepare': { start: 0.05, end: 0.35 },
  'verify.submit': { start: 0.35, end: 1 },
  'attestation.create': { start: 0.05, end: 1 },
  'submit.store': { start: 0.05, end: 1 },
};

const DEFAULT_RUNNING_STEP_PROGRESS = 0.2;

const STEP_TO_PHASE: Record<string, ProgressPhaseKey> = {
  'source.prepare': 'source',
  'source.upload': 'source',
  'source.ready': 'source',
  'ingestion.create': 'ingestion',
  'ingestion.wait': 'ingestion',
  'bundle.load': 'context',
  'session.load': 'context',
  'mint.prepare': 'mint',
  'mint.submit': 'mint',
  'mint.save': 'mint',
  'verify.prepare': 'verify',
  'verify.submit': 'verify',
  'attestation.create': 'attest',
  'submit.store': 'submit',
};

const PHASE_FINAL_STEPS: Record<ProgressPhaseKey, string[]> = {
  source: ['source.ready', 'source.upload'],
  ingestion: ['ingestion.wait'],
  context: ['session.load'],
  mint: ['mint.save'],
  verify: ['verify.submit'],
  attest: ['attestation.create'],
  submit: ['submit.store'],
};

const STAGE_COMPLETED_PHASES: Record<string, ProgressPhaseKey[]> = {
  PreparedForMint: ['source', 'ingestion', 'context'],
  MintSubmitted: ['source', 'ingestion', 'context'],
  MintSaved: ['source', 'ingestion', 'context', 'mint'],
  VerificationSubmitted: ['source', 'ingestion', 'context', 'mint'],
  Verified: ['source', 'ingestion', 'context', 'mint', 'verify'],
  Attested: ['source', 'ingestion', 'context', 'mint', 'verify', 'attest'],
  Submitted: [
    'source',
    'ingestion',
    'context',
    'mint',
    'verify',
    'attest',
    'submit',
  ],
};

const MAX_RECENT_EVENTS = 2;

export function createPublicationProgressReporter(input: {
  title: string;
  mode: PublicationProgressMode;
  stream?: NodeJS.WriteStream;
}) {
  return new PublicationProgressReporter(input);
}

class PublicationProgressReporter {
  readonly logger: PublicationWorkflowLogger;

  private readonly title: string;
  private readonly stream: NodeJS.WriteStream;
  private readonly interactive: boolean;
  private readonly phaseStates: Record<ProgressPhaseKey, ProgressPhaseState>;
  private readonly phaseProgress: Record<ProgressPhaseKey, number>;

  private currentMessage: string;
  private recentEvents: string[] = [];
  private context: ProgressContext = {};
  private spinnerIndex = 0;
  private renderedLineCount = 0;
  private intervalId?: ReturnType<typeof setInterval>;
  private finalState?: 'complete' | 'failed';

  constructor(input: {
    title: string;
    mode: PublicationProgressMode;
    stream?: NodeJS.WriteStream;
  }) {
    this.title = input.title;
    this.stream = input.stream ?? process.stdout;
    this.interactive =
      Boolean(this.stream.isTTY) && process.env.TERM !== 'dumb';
    this.phaseStates = Object.fromEntries(
      PHASES.map(({ key }) => [key, 'pending']),
    ) as Record<ProgressPhaseKey, ProgressPhaseState>;
    this.phaseProgress = Object.fromEntries(
      PHASES.map(({ key }) => [key, 0]),
    ) as Record<ProgressPhaseKey, number>;
    this.currentMessage =
      input.mode === 'resume'
        ? 'Loading existing publication state'
        : 'Preparing publication workflow';

    if (input.mode === 'resume') {
      this.context.sourceKind = 'resume';
    }

    if (input.mode === 'resume') {
      this.phaseStates.source = 'complete';
      this.phaseStates.ingestion = 'complete';
      this.phaseProgress.source = 1;
      this.phaseProgress.ingestion = 1;
    }

    this.logger = {
      debug: (message, metadata) => {
        this.handleEvent('debug', message, metadata);
      },
      info: (message, metadata) => {
        this.handleEvent('info', message, metadata);
      },
      warn: (message, metadata) => {
        this.handleEvent('warn', message, metadata);
      },
    };
  }

  start(input?: { message?: string; metadata?: ProgressMetadata }) {
    if (input?.message) {
      this.currentMessage = input.message;
    }

    if (input?.metadata) {
      this.updateContext(input.metadata);
    }

    this.ensureActivePhase();

    if (this.interactive) {
      this.stream.write('\x1B[?25l');
      this.render();
      this.intervalId = setInterval(() => {
        if (this.finalState) {
          return;
        }

        this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
        this.render();
      }, 120);
      this.intervalId.unref?.();
      return;
    }

    console.log(`${this.title}: ${this.currentMessage}`);
  }

  complete(result: PublicationWorkflowResult) {
    this.finalState = 'complete';
    this.currentMessage = 'Publication workflow completed';
    this.updateContext({
      androidPackage: result.publicationBundle.release.androidPackage,
      versionName: result.publicationBundle.release.versionName,
      releaseId: result.releaseId,
      publicationSessionId: result.publicationSessionId,
      ingestionSessionId: result.ingestionSessionId,
      mintAddress: result.releaseMintAddress,
      transactionSignature:
        result.collectionTransactionSignature ??
        result.releaseTransactionSignature,
      hubspotTicketId: result.hubspotTicketId,
      requestUniqueId: result.attestationRequestUniqueId,
    });

    for (const { key } of PHASES) {
      this.phaseStates[key] = 'complete';
      this.phaseProgress[key] = 1;
    }

    this.pushRecentEvent('Publication workflow completed');
    this.stopAndRenderFinalState();
  }

  fail(error: unknown) {
    this.finalState = 'failed';
    if (error instanceof Error && error.message.trim().length > 0) {
      this.pushRecentEvent(`Failed: ${error.message.trim()}`);
    }
    this.stopAndRenderFinalState();
  }

  private handleEvent(
    level: 'debug' | 'info' | 'warn',
    message: string,
    metadata?: ProgressMetadata,
  ) {
    this.currentMessage = message.trim().length > 0 ? message : this.currentMessage;

    if (metadata) {
      this.updateContext(metadata);
      this.updatePhaseState(metadata);
      this.applyStageHint(metadata);
    }

    if (level === 'warn') {
      this.pushRecentEvent(`Warning: ${message}`);
    } else if (
      level === 'info' &&
      this.readString(metadata, 'status') === 'complete'
    ) {
      this.pushRecentEvent(message);
    }

    if (this.interactive) {
      this.render();
      return;
    }

    if (level === 'debug') {
      return;
    }

    console.log(this.buildLogLine(level, message, metadata));
  }

  private updatePhaseState(metadata: ProgressMetadata) {
    const step = this.readString(metadata, 'step');
    if (!step) {
      return;
    }

    const phaseKey = STEP_TO_PHASE[step];
    if (!phaseKey) {
      return;
    }

    const phaseIndex = this.getPhaseIndex(phaseKey);
    for (let index = 0; index < phaseIndex; index += 1) {
      this.phaseStates[PHASES[index].key] = 'complete';
      this.phaseProgress[PHASES[index].key] = 1;
    }

    if (this.phaseStates[phaseKey] !== 'complete') {
      this.phaseStates[phaseKey] = 'active';
    }

    const status = this.readString(metadata, 'status');
    const resolvedProgress = this.resolvePhaseProgress(step, metadata, status);
    if (resolvedProgress !== undefined) {
      this.phaseProgress[phaseKey] = Math.max(
        this.phaseProgress[phaseKey],
        resolvedProgress,
      );
    }

    if (
      status === 'complete' &&
      PHASE_FINAL_STEPS[phaseKey].includes(step)
    ) {
      this.phaseStates[phaseKey] = 'complete';
      this.phaseProgress[phaseKey] = 1;
      this.ensureActivePhase();
    }
  }

  private resolvePhaseProgress(
    step: string,
    metadata: ProgressMetadata,
    status: string | undefined,
  ): number | undefined {
    const range = STEP_PROGRESS_RANGES[step];
    const explicitProgress =
      this.readProgress(metadata, 'stepProgress') ??
      this.readByteProgress(metadata);

    if (status === 'complete') {
      return range?.end ?? 1;
    }

    if (!range) {
      return explicitProgress;
    }

    if (explicitProgress !== undefined) {
      return this.interpolateProgress(range, explicitProgress);
    }

    if (status === 'running') {
      return this.interpolateProgress(range, DEFAULT_RUNNING_STEP_PROGRESS);
    }

    return undefined;
  }

  private interpolateProgress(
    range: { start: number; end: number },
    progress: number,
  ): number {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    return range.start + (range.end - range.start) * clampedProgress;
  }

  private applyStageHint(metadata: ProgressMetadata) {
    const stage = this.readString(metadata, 'stage');
    if (!stage) {
      return;
    }

    const completedPhases = STAGE_COMPLETED_PHASES[stage];
    if (!completedPhases) {
      return;
    }

    for (const phaseKey of completedPhases) {
      this.phaseStates[phaseKey] = 'complete';
      this.phaseProgress[phaseKey] = 1;
    }

    this.ensureActivePhase();
  }

  private updateContext(metadata: ProgressMetadata) {
    const sourceKind = this.readString(metadata, 'sourceKind');
    if (
      sourceKind === 'apk-file' ||
      sourceKind === 'apk-url' ||
      sourceKind === 'resume'
    ) {
      this.context.sourceKind = sourceKind;
    }

    const fileName = this.readString(metadata, 'fileName');
    if (fileName) {
      this.context.fileName = fileName;
    }

    const apkUrl = this.readString(metadata, 'apkUrl');
    if (apkUrl) {
      this.context.apkUrl = apkUrl;
    }

    const sourceReleaseId = this.readString(metadata, 'sourceReleaseId');
    if (sourceReleaseId) {
      this.context.sourceReleaseId = sourceReleaseId;
    }

    const androidPackage = this.readString(metadata, 'androidPackage');
    if (androidPackage) {
      this.context.androidPackage = androidPackage;
    }

    const versionName = this.readString(metadata, 'versionName');
    if (versionName) {
      this.context.versionName = versionName;
    }

    const releaseId = this.readString(metadata, 'releaseId');
    if (releaseId) {
      this.context.releaseId = releaseId;
    }

    const publicationSessionId =
      this.readString(metadata, 'publicationSessionId') ??
      this.readString(metadata, 'sessionId');
    if (publicationSessionId) {
      this.context.publicationSessionId = publicationSessionId;
    }

    const ingestionSessionId = this.readString(metadata, 'ingestionSessionId');
    if (ingestionSessionId) {
      this.context.ingestionSessionId = ingestionSessionId;
    }

    const mintAddress = this.readString(metadata, 'mintAddress');
    if (mintAddress) {
      this.context.mintAddress = mintAddress;
    }

    const transactionSignature = this.readString(
      metadata,
      'transactionSignature',
    );
    if (transactionSignature) {
      this.context.transactionSignature = transactionSignature;
    }

    const hubspotTicketId = this.readString(metadata, 'hubspotTicketId');
    if (hubspotTicketId) {
      this.context.hubspotTicketId = hubspotTicketId;
    }

    const requestUniqueId = this.readString(metadata, 'requestUniqueId');
    if (requestUniqueId) {
      this.context.requestUniqueId = requestUniqueId;
    }

    const fileSize = this.readNumber(metadata, 'fileSize');
    if (fileSize !== undefined) {
      this.context.fileSize = fileSize;
    }

    const bytesUploaded = this.readNumber(metadata, 'bytesUploaded');
    if (bytesUploaded !== undefined) {
      this.context.bytesUploaded = bytesUploaded;
    }

    const bytesTotal =
      this.readNumber(metadata, 'bytesTotal') ??
      this.readNumber(metadata, 'fileSize');
    if (bytesTotal !== undefined) {
      this.context.bytesTotal = bytesTotal;
    }

    const ingestionStatus = this.readString(metadata, 'ingestionStatus');
    if (ingestionStatus) {
      this.context.ingestionStatus = ingestionStatus;
    }

    const activeStep = this.readString(metadata, 'step');
    if (activeStep) {
      this.context.activeStep = activeStep;
    }
  }

  private stopAndRenderFinalState() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.interactive) {
      this.render();
      this.stream.write('\n');
      this.stream.write('\x1B[?25h');
      return;
    }

    const statusLabel =
      this.finalState === 'complete' ? 'completed' : 'failed';
    console.log(`${this.title}: ${statusLabel}`);
  }

  private ensureActivePhase() {
    if (this.finalState) {
      return;
    }

    const activePhase = PHASES.find(
      ({ key }) => this.phaseStates[key] === 'active',
    );
    if (activePhase) {
      return;
    }

    const nextPendingPhase = PHASES.find(
      ({ key }) => this.phaseStates[key] === 'pending',
    );

    if (nextPendingPhase) {
      this.phaseStates[nextPendingPhase.key] = 'active';
    }
  }

  private render() {
    const lines = this.buildLines();

    if (this.renderedLineCount > 0) {
      readline.moveCursor(this.stream, 0, -(this.renderedLineCount - 1));
      readline.cursorTo(this.stream, 0);
      readline.clearScreenDown(this.stream);
    }

    this.stream.write(lines.join('\n'));
    this.renderedLineCount = lines.length;
  }

  private buildLines(): string[] {
    const completedCount = PHASES.filter(
      ({ key }) => this.phaseStates[key] === 'complete',
    ).length;
    const activePhase = this.getActivePhaseKey();
    const phaseLabel =
      activePhase && this.finalState !== 'complete'
        ? PHASES[this.getPhaseIndex(activePhase)].label
        : 'Complete';
    const percent = this.getProgressPercent();
    const bar = this.buildProgressBar(percent);
    const statusToken = this.getStatusToken();
    const lines = [
      this.fitToWidth(
        `${this.title}  [${statusToken}] ${completedCount}/${PHASES.length} complete | ${phaseLabel}`,
      ),
      this.fitToWidth(`${bar} ${Math.round(percent * 100)}%`),
      this.fitToWidth(`Working: ${this.currentMessage}`),
      ...this.buildDetailLines(),
    ];

    return lines;
  }

  private buildDetailLines(): string[] {
    const targetTokens = [
      this.context.androidPackage
        ? `app ${this.truncateMiddle(this.context.androidPackage, 42)}`
        : null,
      this.context.versionName
        ? `version ${this.truncateMiddle(this.context.versionName, 24)}`
        : null,
      this.context.fileName
        ? `file ${this.truncateMiddle(this.context.fileName, 26)}`
        : null,
      this.context.apkUrl
        ? `url ${this.truncateMiddle(this.compactUrl(this.context.apkUrl), 32)}`
        : null,
      this.context.sourceReleaseId
        ? `source ${this.compactIdentifier(this.context.sourceReleaseId)}`
        : null,
    ].filter((token): token is string => token !== null);

    const idTokens = [
      this.context.releaseId
        ? `release ${this.compactIdentifier(this.context.releaseId)}`
        : null,
      this.context.publicationSessionId
        ? `session ${this.compactIdentifier(this.context.publicationSessionId)}`
        : null,
      this.context.ingestionSessionId
        ? `ingestion ${this.compactIdentifier(this.context.ingestionSessionId)}`
        : null,
      this.context.mintAddress
        ? `mint ${this.compactIdentifier(this.context.mintAddress)}`
        : null,
      this.context.transactionSignature
        ? `tx ${this.compactIdentifier(this.context.transactionSignature)}`
        : null,
      this.context.requestUniqueId
        ? `attest ${this.compactIdentifier(this.context.requestUniqueId)}`
        : null,
      this.context.hubspotTicketId
        ? `ticket ${this.compactIdentifier(this.context.hubspotTicketId)}`
        : null,
    ].filter((token): token is string => token !== null);

    const lines: string[] = [];
    if (targetTokens.length > 0) {
      lines.push(this.fitToWidth(`Target: ${targetTokens.join(' | ')}`));
    }
    const uploadLine = this.buildUploadLine();
    if (uploadLine) {
      lines.push(this.fitToWidth(uploadLine));
    }
    const ingestionLine = this.buildIngestionLine();
    if (ingestionLine) {
      lines.push(this.fitToWidth(ingestionLine));
    }
    if (idTokens.length > 0) {
      lines.push(this.fitToWidth(`IDs: ${idTokens.slice(0, 4).join(' | ')}`));
    }
    if (this.recentEvents.length > 0) {
      lines.push(
        this.fitToWidth(
          `Recent: ${this.recentEvents[this.recentEvents.length - 1]}`,
        ),
      );
    }

    return lines;
  }

  private buildProgressBar(percent: number): string {
    const columns = this.stream.columns ?? 100;
    const barWidth = Math.min(32, Math.max(10, columns - 44));
    const filled = Math.max(0, Math.min(barWidth, Math.round(percent * barWidth)));
    const empty = Math.max(0, barWidth - filled);
    return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
  }

  private buildUploadLine(): string | null {
    if (
      this.context.bytesTotal === undefined ||
      this.context.bytesUploaded === undefined
    ) {
      return null;
    }

    const activeStep = this.context.activeStep;
    if (activeStep !== 'source.upload' && this.finalState !== 'complete') {
      return null;
    }

    const ratio =
      this.context.bytesTotal > 0
        ? this.context.bytesUploaded / this.context.bytesTotal
        : 1;

    return `Upload: ${this.formatBytes(this.context.bytesUploaded)} / ${this.formatBytes(this.context.bytesTotal)} (${Math.round(
      Math.max(0, Math.min(1, ratio)) * 100,
    )}%)`;
  }

  private buildIngestionLine(): string | null {
    if (!this.context.ingestionStatus) {
      return null;
    }

    const activePhase = this.getActivePhaseKey();
    if (activePhase !== 'ingestion' && this.finalState !== 'complete') {
      return null;
    }

    return `Ingestion: ${this.context.ingestionStatus}`;
  }

  private getProgressPercent(): number {
    if (this.finalState === 'complete') {
      return 1;
    }

    const weights = this.getPhaseWeights();
    const progress = PHASES.reduce((total, { key }) => {
      const phaseProgress = Math.max(0, Math.min(1, this.phaseProgress[key]));
      return total + phaseProgress * weights[key];
    }, 0);

    return Math.max(0, Math.min(0.99, progress));
  }

  private getStatusToken(): string {
    if (this.finalState === 'complete') {
      return 'done';
    }

    if (this.finalState === 'failed') {
      return 'fail';
    }

    return SPINNER_FRAMES[this.spinnerIndex];
  }

  private getActivePhaseKey(): ProgressPhaseKey | undefined {
    const activePhase = PHASES.find(
      ({ key }) => this.phaseStates[key] === 'active',
    );
    if (activePhase) {
      return activePhase.key;
    }

    const pendingPhase = PHASES.find(
      ({ key }) => this.phaseStates[key] === 'pending',
    );
    return pendingPhase?.key;
  }

  private getPhaseIndex(phaseKey: ProgressPhaseKey): number {
    return PHASES.findIndex(({ key }) => key === phaseKey);
  }

  private pushRecentEvent(message: string) {
    this.recentEvents.push(this.truncateMiddle(message.trim(), 96));
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents = this.recentEvents.slice(-MAX_RECENT_EVENTS);
    }
  }

  private buildLogLine(
    level: 'info' | 'warn',
    message: string,
    metadata?: ProgressMetadata,
  ): string {
    const step = this.readString(metadata, 'step');
    const phaseKey = step ? STEP_TO_PHASE[step] : this.getActivePhaseKey();
    const phaseIndex = phaseKey ? this.getPhaseIndex(phaseKey) + 1 : 0;
    const phaseLabel = phaseKey
      ? PHASES[this.getPhaseIndex(phaseKey)].label
      : 'Publication workflow';
    const prefix =
      level === 'warn'
        ? 'warning'
        : phaseIndex > 0
          ? `${phaseIndex}/${PHASES.length}`
          : 'info';

    return `${prefix} ${phaseLabel}: ${message}`;
  }

  private compactIdentifier(value: string): string {
    return this.truncateMiddle(value, 18);
  }

  private getPhaseWeights(): Record<ProgressPhaseKey, number> {
    const profile =
      this.context.sourceKind ??
      (this.context.apkUrl ? 'apk-url' : 'apk-file');
    return PHASE_WEIGHT_PROFILES[profile];
  }

  private compactUrl(value: string): string {
    try {
      const url = new URL(value);
      const path = url.pathname === '/' ? '' : url.pathname;
      return `${url.host}${path}`;
    } catch {
      return value;
    }
  }

  private fitToWidth(value: string): string {
    const width = this.stream.columns ?? 100;
    if (width <= 3) {
      return value.slice(0, Math.max(0, width));
    }
    return value.length <= width ? value : `${value.slice(0, width - 3)}...`;
  }

  private truncateMiddle(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    if (maxLength <= 3) {
      return value.slice(0, maxLength);
    }

    const startLength = Math.ceil((maxLength - 3) / 2);
    const endLength = Math.floor((maxLength - 3) / 2);
    return `${value.slice(0, startLength)}...${value.slice(-endLength)}`;
  }

  private readString(
    metadata: ProgressMetadata | undefined,
    key: string,
  ): string | undefined {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(
    metadata: ProgressMetadata | undefined,
    key: string,
  ): number | undefined {
    const value = metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private readProgress(
    metadata: ProgressMetadata | undefined,
    key: string,
  ): number | undefined {
    const value = this.readNumber(metadata, key);
    if (value === undefined) {
      return undefined;
    }

    if (value > 1) {
      return Math.max(0, Math.min(1, value / 100));
    }

    return Math.max(0, Math.min(1, value));
  }

  private readByteProgress(
    metadata: ProgressMetadata | undefined,
  ): number | undefined {
    const bytesUploaded = this.readNumber(metadata, 'bytesUploaded');
    const bytesTotal =
      this.readNumber(metadata, 'bytesTotal') ??
      this.readNumber(metadata, 'fileSize');

    if (
      bytesUploaded === undefined ||
      bytesTotal === undefined ||
      bytesTotal <= 0
    ) {
      return undefined;
    }

    return Math.max(0, Math.min(1, bytesUploaded / bytesTotal));
  }

  private formatBytes(value: number): string {
    if (value < 1024) {
      return `${Math.round(value)} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = -1;

    do {
      size /= 1024;
      unitIndex += 1;
    } while (size >= 1024 && unitIndex < units.length - 1);

    const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
  }
}
