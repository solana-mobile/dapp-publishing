import { expect, jest, test } from '@jest/globals';
import { Writable } from 'node:stream';

import { createPublicationProgressReporter } from '../PublicationProgressReporter';

function createTestStream() {
  const output: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output.push(String(chunk));
      callback();
    },
  }) as Writable & NodeJS.WriteStream & { output: string[] };

  stream.isTTY = false;
  stream.columns = 120;
  stream.output = output;

  return stream;
}

test('local file upload progress materially advances the bar', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const stream = createTestStream();
  try {
    const reporter = createPublicationProgressReporter({
      title: 'Publishing version',
      mode: 'new-version',
      stream,
    }) as any;

    reporter.start({
      metadata: {
        sourceKind: 'apk-file',
        fileName: 'app-release.apk',
      },
    });

    reporter.logger.debug('Uploading APK to portal storage', {
      step: 'source.upload',
      status: 'running',
      fileName: 'app-release.apk',
      fileSize: 100,
      bytesUploaded: 50,
      bytesTotal: 100,
      stepProgress: 0.5,
    });

    const lines = reporter.buildLines();

    expect(reporter.getProgressPercent()).toBeGreaterThan(0.2);
    expect(lines[1]).toContain('23%');
    expect(lines).toContain('Upload: 50 B / 100 B (50%)');
  } finally {
    logSpy.mockRestore();
  }
});

test('ingestion status updates continue advancing overall progress', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const stream = createTestStream();
  try {
    const reporter = createPublicationProgressReporter({
      title: 'Publishing version',
      mode: 'new-version',
      stream,
    }) as any;

    reporter.start({
      metadata: {
        sourceKind: 'apk-file',
        fileName: 'app-release.apk',
      },
    });

    reporter.logger.info('APK uploaded to portal storage', {
      step: 'source.upload',
      status: 'complete',
      fileName: 'app-release.apk',
    });

    reporter.logger.info('Portal ingestion is processing the APK', {
      step: 'ingestion.wait',
      status: 'running',
      ingestionStatus: 'processing',
      stepProgress: 0.7,
    });

    const lines = reporter.buildLines();

    expect(reporter.getProgressPercent()).toBeGreaterThan(0.55);
    expect(lines[1]).toContain('57%');
    expect(lines).toContain('Ingestion: processing');
  } finally {
    logSpy.mockRestore();
  }
});

test('verbose mode prints detailed identifiers as they arrive', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const stream = createTestStream();
  try {
    const reporter = createPublicationProgressReporter({
      title: 'Publishing version',
      mode: 'new-version',
      verbose: true,
      stream,
    });

    reporter.start({
      metadata: {
        sourceKind: 'apk-file',
        fileName: 'app-release.apk',
      },
    });

    reporter.logger.info('Ingestion session created', {
      step: 'ingestion.create',
      status: 'complete',
      releaseId: 'release-123',
      ingestionSessionId: 'ingestion-456',
    });

    reporter.logger.info('Publication session loaded', {
      step: 'session.load',
      status: 'complete',
      publicationSessionId: 'session-789',
    });

    reporter.logger.info('Release NFT transaction submitted', {
      step: 'mint.submit',
      status: 'complete',
      transactionSignature: 'release-tx-sig',
    });

    reporter.logger.info('Release collection verified', {
      step: 'verify.submit',
      status: 'complete',
      transactionSignature: 'collection-tx-sig',
    });

    reporter.logger.info('Attestation payload created', {
      step: 'attestation.create',
      status: 'complete',
      requestUniqueId: 'attest-111',
    });

    reporter.logger.info('Release submitted to store', {
      step: 'submit.store',
      status: 'complete',
      hubspotTicketId: 'ticket-222',
    });

    const output = stream.output.join('');

    expect(output).toContain('Verbose: Release ID: release-123');
    expect(output).toContain('Verbose: Ingestion session ID: ingestion-456');
    expect(output).toContain('Verbose: Publication session ID: session-789');
    expect(output).toContain(
      'Verbose: Release transaction signature: release-tx-sig',
    );
    expect(output).toContain(
      'Verbose: Collection transaction signature: collection-tx-sig',
    );
    expect(output).toContain(
      'Verbose: Attestation request ID: attest-111',
    );
    expect(output).toContain('Verbose: Ticket ID: ticket-222');
  } finally {
    logSpy.mockRestore();
  }
});
