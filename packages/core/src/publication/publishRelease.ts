import type { PortalClientConfig } from "../portal/client/types.js";
import { createPortalWorkflowClient } from "../portal/client/workflowClient.js";
import type {
  PublicationSource,
  PublicationWorkflowLogger,
  PublicationWorkflowResult,
} from "../portal/types.js";
import {
  createPublicationWorkflow,
  type PublicationWorkflowClient,
} from "../portal/workflow.js";
import { resolvePortalTargets } from "./portalTargets.js";

/** Portal client authenticated with a portal API key. */
export type PortalClient = PublicationWorkflowClient;

export type CreatePortalClientInput = {
  apiKey: string;
  /** Defaults to DEFAULT_PRODUCTION_PORTAL_URL (or DEFAULT_LOCAL_PORTAL_URL with localDev). */
  portalUrl?: string;
  /** Allows plain-http localhost portal URLs and rejects non-localhost ones. */
  localDev?: boolean;
  /** Used for portal API calls and uploads; defaults to the global fetch. */
  fetch?: typeof fetch;
};

/** Creates a portal client; throws `PublishingError` for an invalid or non-HTTPS portal URL. */
export function createPortalClient(
  input: CreatePortalClientInput
): PortalClient {
  const { apiBaseUrl } = resolvePortalTargets(input);
  const config: PortalClientConfig = {
    apiBaseUrl,
    apiKey: input.apiKey,
    fetch: input.fetch,
  };

  return createPortalWorkflowClient(config);
}

export type PublishReleaseInput = {
  client: PortalClient;
  source: PublicationSource;
  whatsNew: string;
  idempotencyKey?: string;
  logger?: PublicationWorkflowLogger;
};

/**
 * Uploads the APK, waits for the portal to process it, and submits the
 * release to the store.
 */
export async function publishRelease(
  input: PublishReleaseInput
): Promise<PublicationWorkflowResult> {
  return await createPublicationWorkflow(input.client, {
    logger: input.logger,
  }).startPublication({
    source: input.source,
    whatsNew: input.whatsNew,
    idempotencyKey: input.idempotencyKey,
  });
}

export type ResumeReleaseInput = {
  client: PortalClient;
  releaseId?: string;
  sessionId?: string;
  logger?: PublicationWorkflowLogger;
};

/** Submits a release whose publication session stopped before store submission. */
export async function resumeRelease(
  input: ResumeReleaseInput
): Promise<PublicationWorkflowResult> {
  return await createPublicationWorkflow(input.client, {
    logger: input.logger,
  }).resumePublication({
    releaseId: input.releaseId,
    publicationSessionId: input.sessionId,
  });
}
