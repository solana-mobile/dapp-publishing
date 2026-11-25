export type PublishingErrorCode = "INVALID_PORTAL_URL";

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
