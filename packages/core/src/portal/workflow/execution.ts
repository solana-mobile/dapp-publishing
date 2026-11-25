import type {
  PublicationSession,
  PublicationWorkflowLogger,
  PublicationWorkflowResult,
} from "../types.js";
import type { PublicationWorkflowClient } from "./contracts.js";
import { logWorkflowInfo } from "./logging.js";
import {
  checkpointAtLeast,
  publicationStageToCheckpoint,
} from "./state/checkpoints.js";
import { normalizePublicationSession } from "./state/session.js";

/**
 * Submits the session's release to the store unless the portal already
 * recorded the submission. When `whatsNew` is omitted the portal uses the
 * release notes it stored at ingestion.
 */
export async function runPublicationWorkflow(
  client: PublicationWorkflowClient,
  session: PublicationSession,
  input: { whatsNew?: string; ingestionSessionId?: string | null } = {},
  logger?: PublicationWorkflowLogger
): Promise<PublicationWorkflowResult> {
  const publicationSession = normalizePublicationSession(session);

  if (publicationSession.stage === "Failed") {
    throw new Error(
      publicationSession.lastError ||
        publicationSession.error ||
        "Publication session failed"
    );
  }

  const releaseId = publicationSession.releaseId;
  let hubspotTicketId = publicationSession.hubspotTicketId ?? undefined;
  const checkpoint =
    publicationSession.checkpoint ??
    publicationStageToCheckpoint(publicationSession.stage);

  if (!checkpointAtLeast(checkpoint, "submitted")) {
    logWorkflowInfo(logger, "Submitting release to store", {
      step: "submit.store",
      status: "running",
      releaseId,
      publicationSessionId: publicationSession.id,
    });

    const submissionResult = await client.submitToStore({
      releaseId,
      whatsNew: input.whatsNew,
    });
    hubspotTicketId = submissionResult.hubspotTicketId ?? hubspotTicketId;

    logWorkflowInfo(logger, "Release submitted to store", {
      step: "submit.store",
      status: "complete",
      releaseId,
      publicationSessionId: publicationSession.id,
      hubspotTicketId,
    });
  }

  return {
    ingestionSessionId:
      publicationSession.ingestionSessionId ?? input.ingestionSessionId ?? "",
    publicationSessionId: publicationSession.id,
    releaseId,
    hubspotTicketId,
    publicationSession,
  };
}
