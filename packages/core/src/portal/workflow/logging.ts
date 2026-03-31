import type { PublicationWorkflowLogger } from "../types.js";

export function logWorkflowInfo(
  logger: PublicationWorkflowLogger | undefined,
  message: string,
  metadata?: Record<string, unknown>
) {
  logger?.info?.(message, metadata);
}

export function logWorkflowDebug(
  logger: PublicationWorkflowLogger | undefined,
  message: string,
  metadata?: Record<string, unknown>
) {
  logger?.debug?.(message, metadata);
}
