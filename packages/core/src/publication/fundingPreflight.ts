import {
  address,
  createSolanaRpc,
  type Address,
  type Commitment,
} from "@solana/kit";

import { PublishingError } from "../errors.js";

const BALANCE_CHECK_COMMITMENT: Commitment = "confirmed";
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

// Release NFT minting currently needs roughly ~0.015 SOL in rent plus fees.
// Keep a small buffer so publishing fails before uploading the APK.
export const MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS = 16_000_000;

export type FundingPreflightInput = {
  localDev?: boolean;
  publicKey: string;
  rpcUrl?: string;
};

export type BalanceClient = {
  getBalance(address: Address): Promise<bigint>;
};

export type BalanceClientFactory = (rpcUrl: string) => BalanceClient;

export type FundingPreflightResult = {
  /** The signer balance, unless the check was skipped or the RPC failed. */
  balanceLamports?: bigint;
  /** Set when the RPC failed and publishing continues without the check. */
  warning?: string;
};

function createBalanceClient(rpcUrl: string): BalanceClient {
  const rpc = createSolanaRpc(rpcUrl);
  return {
    async getBalance(address: Address) {
      const { value } = await rpc
        .getBalance(address, { commitment: BALANCE_CHECK_COMMITMENT })
        .send();
      return value;
    },
  };
}

function trimOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveFundingPreflightRpcUrl(input: {
  localDev?: boolean;
  rpcUrl?: string;
}): string | undefined {
  const explicitRpcUrl = trimOptional(input.rpcUrl);
  if (explicitRpcUrl) {
    return explicitRpcUrl;
  }

  if (input.localDev) {
    return undefined;
  }

  return DEFAULT_MAINNET_RPC_URL;
}

function formatSolAmount(lamports: bigint | number): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6);
}

function buildInsufficientBalanceMessage(input: {
  balanceLamports: bigint;
  publicKey: string;
  requiredLamports: number;
}): string {
  return `Signer ${input.publicKey} has ${formatSolAmount(
    input.balanceLamports
  )} SOL, but publishing needs at least ${formatSolAmount(
    input.requiredLamports
  )} SOL available before it starts.`;
}

function buildRpcWarningMessage(rpcUrl: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return [
    `Unable to confirm the signer balance via ${rpcUrl}.`,
    `Continuing without a SOL preflight check: ${detail}.`,
  ].join(" ");
}

export async function ensurePublicationSignerBalance(
  input: FundingPreflightInput,
  clientFactory: BalanceClientFactory = createBalanceClient
): Promise<FundingPreflightResult> {
  const rpcUrl = resolveFundingPreflightRpcUrl(input);
  if (!rpcUrl) {
    return {};
  }

  let signerAddress: Address;
  try {
    signerAddress = address(input.publicKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PublishingError(
      "INVALID_PUBLIC_KEY",
      `Invalid signer public key for balance preflight: ${input.publicKey}. ${detail}`
    );
  }

  try {
    const balanceLamports = await clientFactory(rpcUrl).getBalance(
      signerAddress
    );
    if (balanceLamports < BigInt(MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS)) {
      throw new PublishingError(
        "INSUFFICIENT_BALANCE",
        buildInsufficientBalanceMessage({
          balanceLamports,
          publicKey: input.publicKey,
          requiredLamports: MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS,
        })
      );
    }

    return { balanceLamports };
  } catch (error) {
    if (error instanceof PublishingError) {
      throw error;
    }

    return { warning: buildRpcWarningMessage(rpcUrl, error) };
  }
}
