export type PublishingErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INVALID_KEYPAIR"
  | "INVALID_PORTAL_URL"
  | "INVALID_PUBLIC_KEY";

export class PublishingError extends Error {
  readonly code: PublishingErrorCode;

  constructor(
    code: PublishingErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "PublishingError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
