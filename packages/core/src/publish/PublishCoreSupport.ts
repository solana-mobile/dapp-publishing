import { deprecateLegacyPublishSurface } from '../portal/compat.js';
import type { PublishSolanaNetworkInput } from './types.js';

export type PublishSupportInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  publisherDetails: {
    name: string;
    website: string;
    email: string;
  };
  requestorIsAuthorized: boolean;
  requestDetails: string;
};

export const publishSupport = async (
  _publishSolanaNetworkInput: PublishSolanaNetworkInput,
  _input: PublishSupportInput,
  _dryRun: boolean,
): Promise<never> => {
  deprecateLegacyPublishSurface('publishSupport');
  return undefined as never;
};
