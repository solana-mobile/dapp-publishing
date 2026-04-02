import { deprecateLegacyPublishSurface } from '../portal/compat.js';
import type { PublishSolanaNetworkInput } from './types.js';

export type PublishUpdateInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  publisherDetails: {
    name: string;
    website: string;
    email: string;
  };
  solanaMobileDappPublisherPortalDetails: {
    testing_instructions?: string;
    alpha_testers?: Array<{ address: string; comment: string }>;
  };
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
  criticalUpdate: boolean;
  alphaTest?: boolean;
};

export const publishUpdate = async (
  _publishSolanaNetworkInput: PublishSolanaNetworkInput,
  _input: PublishUpdateInput,
  _dryRun: boolean,
): Promise<never> => {
  deprecateLegacyPublishSurface('publishUpdate');
  return undefined as never;
};
