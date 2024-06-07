import {
  type Metaplex,
  type TransactionBuilder,
  FailedToConfirmTransactionError,
} from "@metaplex-foundation/js";
import { TransactionExpiredBlockheightExceededError } from "@solana/web3.js";

export async function sendAndConfirmTransaction(
  metaplex: Metaplex,
  builder: TransactionBuilder
): ReturnType<TransactionBuilder["sendAndConfirm"]> {
  for (let i = 0; i < 10; i++) {
    try {
      return await builder.sendAndConfirm(metaplex);
    } catch (e: unknown) {
      if (isTransientError(e)) {
        continue;
      }

      throw e;
    }
  }

  throw new Error("Unable to send transaction. Please try later.");
}

function isTransientError(e: unknown): boolean {
  return (
    e instanceof FailedToConfirmTransactionError &&
    (e.cause instanceof TransactionExpiredBlockheightExceededError ||
      /blockhash not found/i.test(e.cause?.message ?? ""))
  );
}
