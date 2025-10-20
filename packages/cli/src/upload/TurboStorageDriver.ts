import type { Keypair } from "@solana/web3.js";
import type { MetaplexFile } from "@metaplex-foundation/js";
import { TurboFactory, lamportToTokenAmount } from "@ardrive/turbo-sdk";
import bs58 from "bs58";
import debugModule from "debug";

const debug = debugModule("cli:turbo-storage");

interface TurboClient {
  getUploadCosts(args: {
    bytes: number[];
  }): Promise<Array<{ winc: string | number | bigint }>>;
  getBalance(): Promise<{ winc: string | number | bigint }>;
  getWincForToken?(args: {
    tokenAmount: number;
  }): Promise<{ winc: string | number | bigint }>;
  topUpWithTokens?(args: { tokenAmount: string | number }): Promise<unknown>;
  uploadFile(args: {
    fileStreamFactory: () => Buffer;
    fileSizeFactory: () => number;
    dataItemOpts?: { tags?: Array<{ name: string; value: string }> };
  }): Promise<{ id: string }>;
}

const CONSTANTS = {
  FREE_UPLOAD_LIMIT: 97_280, // 95 KiB
  UPLOAD_DELAY_MS: 2000,
  MAX_RETRIES: 5,
  SOL_IN_LAMPORTS: 1_000_000_000,
  BACKOFF: {
    BASE_MS: 500,
    MAX_MS: 8000,
  },
  GATEWAYS: {
    devnet: "https://turbo.ardrive.dev/raw",
    mainnet: "https://arweave.net",
  },
} as const;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class TurboStorageDriver {
  private turbo: TurboClient;
  private bufferPercentage: number;
  private network: "devnet" | "mainnet";

  private uploadQueue: Array<{
    file: MetaplexFile;
    resolve: (url: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessingQueue = false;

  constructor(
    keypair: Keypair,
    network: "devnet" | "mainnet" = "mainnet",
    bufferPercentage = 20
  ) {
    this.network = network;
    this.bufferPercentage = bufferPercentage;

    this.turbo = TurboFactory.authenticated({
      privateKey: bs58.encode(keypair.secretKey),
      token: "solana",
      ...this.getServiceUrls(network === "devnet"),
    }) as TurboClient;
  }

  private getServiceUrls(isDev: boolean) {
    const base = isDev ? "ardrive.dev" : "ardrive.io";
    return {
      uploadUrl: `https://upload.${base}`,
      paymentUrl: `https://payment.${base}`,
    };
  }

  async getUploadPrice(bytes: number): Promise<bigint> {
    if (bytes <= CONSTANTS.FREE_UPLOAD_LIMIT) return BigInt(0);

    const [cost] = await this.turbo.getUploadCosts({ bytes: [bytes] });
    const base = BigInt(String(cost.winc));
    return (base * BigInt(100 + this.bufferPercentage)) / BigInt(100);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    isRetriable: (error: string) => boolean = (msg) =>
      msg.includes("429") || msg.includes("Too Many Requests")
  ): Promise<T> {
    for (let retry = 0; retry <= CONSTANTS.MAX_RETRIES; retry++) {
      try {
        return await operation();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (retry < CONSTANTS.MAX_RETRIES && isRetriable(errorMessage)) {
          const delayMs = Math.min(
            CONSTANTS.BACKOFF.BASE_MS * Math.pow(2, retry),
            CONSTANTS.BACKOFF.MAX_MS
          );
          console.log(
            `Rate limited, retrying after ${delayMs}ms (attempt ${retry + 1}/${
              CONSTANTS.MAX_RETRIES
            })...`
          );
          await delay(delayMs);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
  }

  private formatInsufficientFundsError(errorMessage: string): void {
    const match = errorMessage.match(/insufficient lamports (\d+), need (\d+)/);
    if (!match) return;

    const [current, needed] = [BigInt(match[1]), BigInt(match[2])];
    const [currentSOL, neededSOL] = [
      Number(current) / 1e9,
      Number(needed) / 1e9,
    ];

    console.error(`\nInsufficient SOL balance for top-up:`);
    console.error(`  Current: ${currentSOL.toFixed(9)} SOL`);
    console.error(`  Required: ${neededSOL.toFixed(9)} SOL`);
    console.error(`  Shortfall: ${(neededSOL - currentSOL).toFixed(9)} SOL\n`);
  }

  private async topUpCredits(wincAmount: bigint): Promise<void> {
    try {
      await this.withRetry(async () => {
        const exchangeRate = await this.turbo.getWincForToken?.({
          tokenAmount: CONSTANTS.SOL_IN_LAMPORTS,
        });

        if (!exchangeRate) {
          throw new Error("Unable to get Winston Credits exchange rate");
        }

        const wincPerSol = BigInt(String(exchangeRate.winc));
        // Manual ceiling division for bigint
        const lamportsNeeded = (wincAmount * BigInt(CONSTANTS.SOL_IN_LAMPORTS) + wincPerSol - 1n) / wincPerSol;

        debug(
          `Buying ${wincAmount} Winston Credits for ~${
            Number(lamportsNeeded) / 1e9
          } SOL`
        );

        await this.turbo.topUpWithTokens?.({
          tokenAmount: String(lamportToTokenAmount(lamportsNeeded.toString())),
        });

        debug(`Top-up initiated for ${wincAmount} Winston Credits`);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debug("Top-up failed:", error);

      if (errorMessage.includes("insufficient lamports")) {
        this.formatInsufficientFundsError(errorMessage);
      }

      throw new Error(
        `Failed to top up ${wincAmount} Winston Credits: ${errorMessage}`
      );
    }
  }

  private async checkBalanceAndTopUp(requiredWinc: bigint): Promise<void> {
    if (requiredWinc === BigInt(0)) return;

    const current = BigInt(String((await this.turbo.getBalance()).winc));

    if (current >= requiredWinc) {
      debug(
        `Sufficient balance: ${current} Winston Credits (required: ${requiredWinc})`
      );
      return;
    }

    const deficit = requiredWinc - current;
    debug(
      `Current: ${current}, Required: ${requiredWinc}, Topping up: ${deficit}`
    );
    await this.topUpCredits(deficit);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.uploadQueue.length) return;

    this.isProcessingQueue = true;

    while (this.uploadQueue.length > 0) {
      const item = this.uploadQueue.shift();
      if (!item) continue;

      try {
        debug(
          `Processing upload for ${item.file.fileName} (${item.file.buffer.length} bytes)`
        );

        const estimated = await this.getUploadPrice(item.file.buffer.length);
        await this.checkBalanceAndTopUp(estimated);

        const tags = [...(item.file.tags ?? [])];
        if (item.file.contentType) {
          tags.push({ name: "Content-Type", value: item.file.contentType });
        }

        const uploadResult = await this.turbo.uploadFile({
          fileStreamFactory: () => item.file.buffer,
          fileSizeFactory: () => item.file.buffer.byteLength,
          dataItemOpts: { tags },
        });

        const gateway = CONSTANTS.GATEWAYS[this.network];
        const url = `${gateway}/${uploadResult.id}`;
        debug(`Upload complete: ${url}`);
        item.resolve(url);

        if (this.uploadQueue.length > 0) {
          debug(`Waiting ${CONSTANTS.UPLOAD_DELAY_MS}ms before next upload...`);
          await delay(CONSTANTS.UPLOAD_DELAY_MS);
        }
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.isProcessingQueue = false;
  }

  async upload(file: MetaplexFile): Promise<string> {
    return new Promise((resolve, reject) => {
      debug(
        `Queueing upload for ${file.fileName} (${file.buffer.length} bytes)`
      );
      this.uploadQueue.push({ file, resolve, reject });
      this.processQueue().catch(reject);
    });
  }
}
