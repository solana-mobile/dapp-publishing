import { createPortalAttestationClient } from "../portal/client/attestationClient.js";
import type { PortalClientConfig } from "../portal/client/types.js";
import { createPortalWorkflowClient } from "../portal/client/workflowClient.js";
import type {
  PublicationAttestationClient,
  PublicationSigner,
  PublicationSource,
  PublicationWorkflowLogger,
  PublicationWorkflowResult,
} from "../portal/types.js";
import {
  createPublicationWorkflow,
  type PublicationWorkflowClient,
} from "../portal/workflow.js";
import { resolvePortalTargets } from "./portalTargets.js";

export type PortalClient = PublicationWorkflowClient & {
  attestationClient: PublicationAttestationClient;
};

export type CreatePortalClientInput = {
  apiKey: string;
  /** Defaults to DEFAULT_PRODUCTION_PORTAL_URL (or DEFAULT_LOCAL_PORTAL_URL with localDev). */
  portalUrl?: string;
  /** Allows plain-http localhost portal URLs and rejects non-localhost ones. */
  localDev?: boolean;
  /** Used for portal API calls and uploads; defaults to the global fetch. */
  fetch?: typeof fetch;
};

export function createPortalClient(
  input: CreatePortalClientInput
): PortalClient {
  const { apiBaseUrl } = resolvePortalTargets(input);
  const config: PortalClientConfig = {
    apiBaseUrl,
    apiKey: input.apiKey,
    fetch: input.fetch,
  };

  return {
    ...createPortalWorkflowClient(config),
    attestationClient: createPortalAttestationClient(config),
  };
}

export type PublishReleaseInput = {
  client: PortalClient;
  signer: PublicationSigner;
  source: PublicationSource;
  whatsNew: string;
  idempotencyKey?: string;
  logger?: PublicationWorkflowLogger;
};

export async function publishRelease(
  input: PublishReleaseInput
): Promise<PublicationWorkflowResult> {
  return await createPublicationWorkflow(input.client, {
    logger: input.logger,
  }).startPublication({
    source: input.source,
    whatsNew: input.whatsNew,
    idempotencyKey: input.idempotencyKey,
    signer: input.signer,
    attestationClient: input.client.attestationClient,
  });
}

export type ResumeReleaseInput = {
  client: PortalClient;
  signer: PublicationSigner;
  releaseId?: string;
  sessionId?: string;
  logger?: PublicationWorkflowLogger;
};

export async function resumeRelease(
  input: ResumeReleaseInput
): Promise<PublicationWorkflowResult> {
  return await createPublicationWorkflow(input.client, {
    logger: input.logger,
  }).resumePublication({
    releaseId: input.releaseId,
    publicationSessionId: input.sessionId,
    signer: input.signer,
    attestationClient: input.client.attestationClient,
  });
}
