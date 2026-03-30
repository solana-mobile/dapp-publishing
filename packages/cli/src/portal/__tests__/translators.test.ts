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
      'portal',
    );

    expect(bundle.metadata.shortDescription).toBe('Portal subtitle');
    expect(bundle.metadata.localizedStrings[0].shortDescription).toBe(
      description.slice(0, 50),
    );
  });
});
