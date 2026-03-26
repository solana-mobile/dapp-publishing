import { deprecateLegacyPublishSurface } from '../portal/compat.js';
import type { PublishSolanaNetworkInput } from './types.js';

export type PublishRemoveInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  publisherDetails: {
    name: string;
    website: string;
    email: string;
  };
  requestorIsAuthorized: boolean;
  criticalUpdate: boolean;
};

export const publishRemove = async (
  _publishSolanaNetworkInput: PublishSolanaNetworkInput,
  _input: PublishRemoveInput,
  _dryRun: boolean,
): Promise<never> => {
  deprecateLegacyPublishSurface('publishRemove');
  return undefined as never;
};
