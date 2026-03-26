import { deprecateLegacyPublishSurface } from '../portal/compat.js';
import type { PublishSolanaNetworkInput } from './types.js';

export type PublishSubmitInput = {
  appMintAddress: string;
  releaseMintAddress: string;
  publisherDetails: {
    name: string;
    website: string;
    email: string;
  };
  solanaMobileDappPublisherPortalDetails: {
    google_store_package?: string;
    testing_instructions?: string;
    alpha_testers?: Array<{ address: string; comment: string }>;
  };
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
  alphaTest?: boolean;
};

export const publishSubmit = async (
  _publishSolanaNetworkInput: PublishSolanaNetworkInput,
  _input: PublishSubmitInput,
  _dryRun: boolean,
): Promise<never> => {
  deprecateLegacyPublishSurface('publishSubmit');
  return undefined as never;
};
