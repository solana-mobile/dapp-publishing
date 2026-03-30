import type { PublicationAttestationClient } from '@solana-mobile/dapp-store-publishing-tools';

import { callPortalProcedure } from './http.js';
import type { PortalClientConfig } from './types.js';

export function createPortalAttestationClient(
  config: PortalClientConfig,
): PublicationAttestationClient {
  return {
    async getBlockData() {
      return await callPortalProcedure<{ slot: number; blockhash: string }>(
        config,
        'attestation.getBlockData',
        {},
        'query',
      );
    },
  };
}
