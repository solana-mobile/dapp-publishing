import { randomUUID } from "node:crypto";

import type {
  PublicationCleanupReleaseResult,
  PublicationGetSessionInput,
  PublicationSession,
} from "../types.js";
import type {
  PublicationResumeInput,
  PublicationWorkflowClient,
  PublicationWorkflowInput,
  PublicationWorkflowOptions,
  PublicationWorkflowPollOptions,
} from "./contracts.js";
import { runPublicationWorkflow } from "./execution.js";
import { waitForIngestionSessionReady } from "./ingestion.js";
import { logWorkflowInfo } from "./logging.js";
import { normalizePublicationSession } from "./state/session.js";
import { preparePublicationSource } from "./source/preparation.js";

function normalizeWorkflowError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolvePublicationSessionLookup(input: {
  publicationSessionId?: string | null;
  releaseId?: string;
}): PublicationGetSessionInput {
  if (input.publicationSessionId) {
    return {
      publicationSessionId: input.publicationSessionId,
    };
  }

  if (!input.releaseId) {
    throw new Error(
      "releaseId is required when publicationSessionId is absent"
    );
  }

  return {
    releaseId: input.releaseId,
  };
}

async function loadPublicationSession(
  client: PublicationWorkflowClient,
  input: {
    publicationSessionId?: string | null;
    releaseId?: string;
    existingSession?: PublicationSession;
    startMessage: string;
    completeMessage: string;
  },
  options: PublicationWorkflowOptions
): Promise<PublicationSession> {
  logWorkflowInfo(options.logger, input.startMessage, {
    step: "session.load",
    status: "running",
    releaseId: input.releaseId,
    publicationSessionId: input.publicationSessionId ?? undefined,
  });

  const publicationSession =
    input.existingSession ??
    normalizePublicationSession(
      await client.getPublicationSession(
        resolvePublicationSessionLookup({
          publicationSessionId: input.publicationSessionId,
          releaseId: input.releaseId,
        })
      )
    );

  logWorkflowInfo(options.logger, input.completeMessage, {
    step: "session.load",
    status: "complete",
    releaseId: publicationSession.releaseId,
    publicationSessionId: publicationSession.id,
    stage: publicationSession.stage,
  });

  return publicationSession;
}

async function recoverPublicationResult(
  client: PublicationWorkflowClient,
  releaseId: string,
  input: PublicationWorkflowInput,
  options: PublicationWorkflowOptions
) {
  logWorkflowInfo(options.logger, "Recovering final publication state", {
    step: "cleanup.recover",
    status: "running",
    releaseId,
  });

  const publicationSession = normalizePublicationSession(
    await client.getPublicationSession({
      releaseId,
    })
  );

  logWorkflowInfo(options.logger, "Recovered final publication state", {
    step: "cleanup.recover",
    status: "complete",
    releaseId,
    publicationSessionId: publicationSession.id,
    stage: publicationSession.stage,
  });

  return runPublicationWorkflow(
    client,
    publicationSession,
    { whatsNew: input.whatsNew },
    options.logger
  );
}

async function cleanupFailedRelease(
  client: PublicationWorkflowClient,
  releaseId: string,
  error: Error,
  options: PublicationWorkflowOptions
): Promise<PublicationCleanupReleaseResult | null> {
  if (!client.cleanupRelease) {
    return null;
  }

  options.logger?.warn?.("Rolling back failed publication release", {
    step: "cleanup.release",
    status: "running",
    releaseId,
    error: error.message,
  });

  const cleanupResult = await client.cleanupRelease({
    releaseId,
  });

  const message =
    cleanupResult.action === "deleted"
      ? "Failed publication release cleaned up"
      : "Publication already reached the submitted state; preserving release";

  logWorkflowInfo(options.logger, message, {
    step: "cleanup.release",
    status: "complete",
    releaseId,
    action: cleanupResult.action,
  });

  return cleanupResult;
}

export const createPublicationWorkflow = (
  client: PublicationWorkflowClient,
  options: PublicationWorkflowOptions = {}
) => {
  const pollOptions: PublicationWorkflowPollOptions = {
    pollIntervalMs: options.pollIntervalMs ?? 2500,
    // Large APK ingestion can legitimately take tens of minutes once upload,
    // managed-storage download, hashing, aapt2, and apksigner are included.
    // Keep the default wait aligned with the portal queue headroom instead of
    // failing after only ~5 minutes.
    maxPollAttempts: options.maxPollAttempts ?? 1080,
  };

  return {
    async startPublication(input: PublicationWorkflowInput) {
      let createdReleaseId: string | undefined;
      let createdIngestionSessionId: string | undefined;

      try {
        logWorkflowInfo(options.logger, "Preparing publication source", {
          step: "source.prepare",
          status: "running",
        });

        const source = await preparePublicationSource(
          client,
          input.source,
          options.logger
        );

        logWorkflowInfo(options.logger, "Creating ingestion session", {
          step: "ingestion.create",
          status: "running",
        });

        const ingestionSession = await client.createIngestionSession({
          source,
          whatsNew: input.whatsNew,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
          ...(input.dappId ? { dappId: input.dappId } : {}),
        });

        createdReleaseId =
          ingestionSession.releaseId ??
          ingestionSession.bundle?.releaseId ??
          undefined;
        createdIngestionSessionId = ingestionSession.id?.trim();

        if (!createdIngestionSessionId) {
          throw new Error(
            "Portal createIngestionSession did not return an ingestion session id"
          );
        }

        logWorkflowInfo(options.logger, "Ingestion session created", {
          step: "ingestion.create",
          status: "complete",
          ingestionSessionId: createdIngestionSessionId,
          releaseId: createdReleaseId,
        });

        const readySession = await waitForIngestionSessionReady(
          client,
          createdIngestionSessionId,
          pollOptions,
          options.logger
        );

        const releaseId =
          readySession.releaseId ?? readySession.bundle?.releaseId ?? undefined;
        if (!releaseId) {
          throw new Error(
            "Publication ingestion completed without a release identifier"
          );
        }
        createdReleaseId = releaseId;

        const readyPublicationSession = readySession.publicationSession
          ? normalizePublicationSession(readySession.publicationSession)
          : undefined;

        const publicationSession = await loadPublicationSession(
          client,
          {
            releaseId,
            publicationSessionId: readySession.publicationSessionId ?? null,
            existingSession: readyPublicationSession,
            startMessage: "Loading publication session",
            completeMessage: "Publication session loaded",
          },
          options
        );

        return await runPublicationWorkflow(
          client,
          publicationSession,
          { whatsNew: input.whatsNew, ingestionSessionId: readySession.id },
          options.logger
        );
      } catch (error) {
        const normalizedError = normalizeWorkflowError(error);

        if (!createdReleaseId && createdIngestionSessionId) {
          try {
            const failedIngestionSession = await client.getIngestionSession({
              sessionId: createdIngestionSessionId,
              ingestionSessionId: createdIngestionSessionId,
            });
            createdReleaseId =
              failedIngestionSession.releaseId ??
              failedIngestionSession.bundle?.releaseId ??
              undefined;
          } catch {
            // Ignore follow-up lookup failures and rethrow the original error.
          }
        }

        if (!createdReleaseId) {
          throw normalizedError;
        }

        try {
          const cleanupResult = await cleanupFailedRelease(
            client,
            createdReleaseId,
            normalizedError,
            options
          );

          if (cleanupResult?.action === "preservedSubmitted") {
            return await recoverPublicationResult(
              client,
              createdReleaseId,
              input,
              options
            );
          }
        } catch (cleanupError) {
          const normalizedCleanupError = normalizeWorkflowError(cleanupError);
          throw new Error(
            `${normalizedError.message} Cleanup also failed for release ${createdReleaseId}: ${normalizedCleanupError.message}`
          );
        }

        throw normalizedError;
      }
    },

    async resumePublication(input: PublicationResumeInput) {
      if (!input.publicationSessionId && !input.releaseId) {
        throw new Error(
          "Publication session id or release id is required to resume a publication"
        );
      }

      const publicationSession = await loadPublicationSession(
        client,
        {
          publicationSessionId: input.publicationSessionId ?? null,
          releaseId: input.releaseId,
          startMessage: "Loading existing publication session",
          completeMessage: "Existing publication session loaded",
        },
        options
      );

      if (publicationSession.ingestionSessionId) {
        const ingestionSession = await client.getIngestionSession({
          sessionId: publicationSession.ingestionSessionId,
        });

        logWorkflowInfo(options.logger, "Release details loaded", {
          step: "session.load",
          status: "complete",
          releaseId: publicationSession.releaseId,
          androidPackage: ingestionSession.androidPackage ?? undefined,
          versionName: ingestionSession.versionName ?? undefined,
        });
      }

      return runPublicationWorkflow(
        client,
        publicationSession,
        {},
        options.logger
      );
    },
  };
};
