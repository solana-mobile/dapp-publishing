import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Commitment,
} from "@solana/web3.js";

const BALANCE_CHECK_COMMITMENT: Commitment = "confirmed";
const DEFAULT_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

// Release NFT minting currently needs roughly ~0.015 SOL in rent plus fees.
// Keep a small buffer so the CLI fails before uploading the APK.
export const MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS = 16_000_000;

type FundingPreflightInput = {
  localDev?: boolean;
  publicKey: string;
  rpcUrl?: string;
};

type BalanceClient = {
  getBalance(publicKey: PublicKey): Promise<number>;
};

type BalanceClientFactory = (rpcUrl: string) => BalanceClient;

function createBalanceClient(rpcUrl: string): BalanceClient {
  const connection = new Connection(rpcUrl, BALANCE_CHECK_COMMITMENT);
  return {
    async getBalance(publicKey: PublicKey) {
      return await connection.getBalance(publicKey, BALANCE_CHECK_COMMITMENT);
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

function formatSolAmount(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function buildInsufficientBalanceMessage(input: {
  balanceLamports: number;
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
): Promise<string | undefined> {
  const rpcUrl = resolveFundingPreflightRpcUrl(input);
  if (!rpcUrl) {
    return undefined;
  }

  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(input.publicKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid signer public key for balance preflight: ${input.publicKey}. ${detail}`
    );
  }

  try {
    const balanceLamports = await clientFactory(rpcUrl).getBalance(publicKey);
    if (balanceLamports < MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS) {
      throw new Error(
        buildInsufficientBalanceMessage({
          balanceLamports,
          publicKey: input.publicKey,
          requiredLamports: MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS,
        })
      );
    }

    return undefined;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("publishing needs at least")
    ) {
      throw error;
    }

    return buildRpcWarningMessage(rpcUrl, error);
  }
}
