import { describe, expect, it } from '@jest/globals';

import { mapBackendBundleToPublicationBundle } from '../translators.js';

describe('mapBackendBundleToPublicationBundle', () => {
  it('keeps localized short-description fallback distinct from metadata shortDescription', () => {
    const description = 'A'.repeat(80);

    const bundle = mapBackendBundleToPublicationBundle(
      {
        dapp: {
          dappName: 'Example dApp',
          description,
          subtitle: 'Portal subtitle',
        },
        release: {},
        publisher: {},
        installFile: {},
        signerAuthority: {},
      },
      '',
      'portal'
    );

    expect(bundle.metadata.shortDescription).toBe('Portal subtitle');
    expect(bundle.metadata.localizedStrings[0].shortDescription).toBe(
      description.slice(0, 50)
    );
  });

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
        signerAuthority: {},
      },
      'https://example.com/metadata.json',
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
