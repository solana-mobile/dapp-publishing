import { describe, expect, it } from '@jest/globals';

import {
  mapBackendBundleToPublicationBundle,
  translateBackendPublicationSession,
} from '../translators.js';

describe('mapBackendBundleToPublicationBundle', () => {
  it('preserves required release metadata fields from the backend bundle', () => {
    const bundle = mapBackendBundleToPublicationBundle(
      {
        dapp: {
          id: 'dapp-1',
          dappName: 'Example dApp',
          description: 'Long description',
          walletAddress: 'wallet-1',
          androidPackage: 'com.example.app',
          dappIconUrl: 'https://example.com/icon.png',
          dappPreviewUrls: ['https://example.com/preview.png'],
          editorsChoiceGraphicUrl: 'https://example.com/editor.png',
          languages: ['en-US'],
        },
        release: {
          id: 'release-1',
          dappId: 'dapp-1',
          releaseFileUrl: 'https://example.com/release.apk',
          releaseFileName: 'release.apk',
          releaseFileSize: 123,
          releaseFileHash: 'apk-hash',
          versionCode: 42,
          versionName: '1.0.42',
          androidPackage: 'com.example.app',
          minSdkVersion: 26,
          targetSdkVersion: 35,
          permissions: ['android.permission.INTERNET'],
          locales: ['en-US'],
          certificateFingerprint: 'fingerprint',
          shortDescription: 'Short description',
          longDescription: 'Long description',
          localizedName: 'Example App',
          newInVersion: 'Bug fixes',
        },
        publisher: {},
        installFile: {},
      },
      'portal'
    );

    expect(bundle.dapp.editorsChoiceGraphicUrl).toBe(
      'https://example.com/editor.png'
    );
    expect(bundle.release.targetSdkVersion).toBe(35);
    expect(bundle.release.certificateFingerprint).toBe('fingerprint');
    expect(bundle.release.permissions).toEqual(['android.permission.INTERNET']);
    expect(bundle.release.locales).toEqual(['en-US']);
    expect(bundle.release.releaseFileHash).toBe('apk-hash');
  });
});

describe('translateBackendPublicationSession', () => {
  it('maps the backend stage to a checkpoint and status', () => {
    const session = translateBackendPublicationSession({
      id: 'session-1',
      releaseId: 'release-1',
      stage: 'Submitted',
      hubspotTicketId: 'ticket-1',
      lastError: 'boom',
    });

    expect(session.checkpoint).toBe('submitted');
    expect(session.status).toBe('completed');
    expect(session.hubspotTicketId).toBe('ticket-1');
    expect(session.error).toBe('boom');
  });
});
