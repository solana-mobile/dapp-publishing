import { randomUUID } from "node:crypto";

import type {
  PublicationBundle,
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
import {
  hasResolvableReleaseMetadataUri,
  normalizePublicationBundle,
  validatePublicationBundle,
  withPublicationBundleIdentifiers,
} from "./state/bundle.js";
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

async function loadPublicationBundle(
  client: PublicationWorkflowClient,
  input: {
    releaseId: string;
    publicationSessionId?: string | null;
    ingestionSessionId?: string | null;
    existingBundle?: PublicationBundle | null;
    existingSession?: PublicationSession;
  },
  options: PublicationWorkflowOptions
): Promise<PublicationBundle> {
  logWorkflowInfo(options.logger, "Loading publication bundle", {
    step: "bundle.load",
    status: "running",
    releaseId: input.releaseId,
  });

  const publicationBundle =
    input.existingBundle &&
    hasResolvableReleaseMetadataUri(input.existingBundle, input.existingSession)
      ? input.existingBundle
      : withPublicationBundleIdentifiers(
          normalizePublicationBundle(
            await client.getPublicationBundle({
              releaseId: input.releaseId,
            })
          ),
          {
            releaseId: input.releaseId,
            publicationSessionId: input.publicationSessionId ?? null,
            ingestionSessionId: input.ingestionSessionId ?? null,
          }
        );

  validatePublicationBundle(publicationBundle);

  logWorkflowInfo(options.logger, "Publication bundle loaded", {
    step: "bundle.load",
    status: "complete",
    releaseId: input.releaseId,
    androidPackage: publicationBundle.release.androidPackage,
    versionName: publicationBundle.release.versionName,
  });

  return publicationBundle;
}

async function recoverPublicationResult(
  client: PublicationWorkflowClient,
  releaseId: string,
  input: Pick<PublicationWorkflowInput, "signer" | "attestationClient">,
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
  const publicationBundle = withPublicationBundleIdentifiers(
    normalizePublicationBundle(
      await client.getPublicationBundle({
        releaseId,
      })
    ),
    {
      releaseId,
      publicationSessionId: publicationSession.id,
      ingestionSessionId: publicationSession.ingestionSessionId ?? null,
    }
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
    publicationBundle,
    input.signer,
    input.attestationClient,
    publicationSession,
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

        const readyPublicationBundle = readySession.bundle
          ? withPublicationBundleIdentifiers(
              normalizePublicationBundle(readySession.bundle),
              {
                releaseId,
                publicationSessionId: readySession.publicationSessionId ?? null,
                ingestionSessionId: readySession.id,
              }
            )
          : null;

        const publicationBundle = await loadPublicationBundle(
          client,
          {
            releaseId,
            publicationSessionId: readySession.publicationSessionId ?? null,
            ingestionSessionId: readySession.id,
            existingBundle: readyPublicationBundle,
            existingSession: readyPublicationSession,
          },
          options
        );

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
          publicationBundle,
          input.signer,
          input.attestationClient,
          publicationSession,
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

      const publicationBundle = await loadPublicationBundle(
        client,
        {
          releaseId: publicationSession.releaseId,
          publicationSessionId: publicationSession.id,
          ingestionSessionId: publicationSession.ingestionSessionId ?? null,
        },
        options
      );

      return runPublicationWorkflow(
        client,
        publicationBundle,
        input.signer,
        input.attestationClient,
        publicationSession,
        options.logger
      );
    },
  };
};
