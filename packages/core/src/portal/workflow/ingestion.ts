import type {
  PublicationIngestionSession,
  PublicationWorkflowLogger,
} from "../types.js";
import type {
  PublicationWorkflowClient,
  PublicationWorkflowPollOptions,
} from "./contracts.js";
import { logWorkflowInfo } from "./logging.js";

function isReadyIngestionSession(
  session: PublicationIngestionSession
): boolean {
  return session.status === "Ready" || session.status === "ready";
}

function buildIngestionStatusProgress(
  session: PublicationIngestionSession
): number {
  if (
    typeof session.processingProgress === "number" &&
    Number.isFinite(session.processingProgress)
  ) {
    return Math.max(0, Math.min(1, session.processingProgress / 100));
  }

  switch (session.status) {
    case "created":
      return 0.15;
    case "queued":
      return 0.3;
    case "processing":
      return 0.7;
    case "Ready":
    case "ready":
    case "Failed":
    case "failed":
      return 1;
    default:
      return 0.15;
  }
}

function buildIngestionStatusMessage(
  session: PublicationIngestionSession
): string | null {
  if (
    typeof session.processingDetail === "string" &&
    session.processingDetail.trim().length > 0
  ) {
    return session.processingDetail.trim();
  }

  if (
    typeof session.processingStage === "string" &&
    session.processingStage.trim().length > 0
  ) {
    return session.processingStage.trim();
  }

  switch (session.status) {
    case "created":
      return "Portal ingestion request created";
    case "queued":
      return "Portal ingestion queued";
    case "processing":
      return "Portal ingestion is processing the APK";
    case "Ready":
    case "ready":
      return "Portal ingestion is ready";
    default:
      return null;
  }
}

export async function waitForIngestionSessionReady(
  client: PublicationWorkflowClient,
  ingestionSessionId: string,
  options: PublicationWorkflowPollOptions,
  logger?: PublicationWorkflowLogger
): Promise<PublicationIngestionSession> {
  logWorkflowInfo(logger, "Waiting for portal ingestion to finish", {
    step: "ingestion.wait",
    status: "running",
    ingestionSessionId,
    stepProgress: 0,
  });

  let previousSnapshot:
    | {
        status: PublicationIngestionSession["status"];
        progress: number | null;
        stage: string | null;
        detail: string | null;
      }
    | undefined;

  for (let attempt = 1; attempt <= options.maxPollAttempts; attempt += 1) {
    const session = await client.getIngestionSession({
      sessionId: ingestionSessionId,
      ingestionSessionId,
    });
    if (session.status === "Failed" || session.status === "failed") {
      throw new Error(
        session.error ||
          session.processingError ||
          "Publication ingestion failed before the bundle was ready"
      );
    }

    const nextSnapshot = {
      status: session.status,
      progress:
        typeof session.processingProgress === "number"
          ? session.processingProgress
          : null,
      stage:
        typeof session.processingStage === "string"
          ? session.processingStage
          : null,
      detail:
        typeof session.processingDetail === "string"
          ? session.processingDetail
          : null,
    };

    if (
      !previousSnapshot ||
      previousSnapshot.status !== nextSnapshot.status ||
      previousSnapshot.progress !== nextSnapshot.progress ||
      previousSnapshot.stage !== nextSnapshot.stage ||
      previousSnapshot.detail !== nextSnapshot.detail
    ) {
      previousSnapshot = nextSnapshot;
      const statusMessage = buildIngestionStatusMessage(session);

      if (statusMessage) {
        logWorkflowInfo(logger, statusMessage, {
          step: "ingestion.wait",
          status: "running",
          ingestionSessionId,
          releaseId: session.releaseId ?? undefined,
          publicationSessionId: session.publicationSessionId ?? undefined,
          androidPackage: session.androidPackage ?? undefined,
          versionName: session.versionName ?? undefined,
          ingestionStatus:
            session.processingDetail ??
            session.processingStage ??
            session.status,
          ingestionProgress: nextSnapshot.progress ?? undefined,
          ingestionStage: nextSnapshot.stage ?? undefined,
          ingestionDetail: nextSnapshot.detail ?? undefined,
          stepProgress: buildIngestionStatusProgress(session),
        });
      }
    }

    if (isReadyIngestionSession(session)) {
      logWorkflowInfo(logger, "Portal ingestion is ready", {
        step: "ingestion.wait",
        status: "complete",
        ingestionSessionId,
        releaseId: session.releaseId ?? undefined,
        publicationSessionId: session.publicationSessionId ?? undefined,
        androidPackage: session.androidPackage ?? undefined,
        versionName: session.versionName ?? undefined,
        ingestionStatus:
          session.processingDetail ?? session.processingStage ?? session.status,
        ingestionProgress:
          typeof session.processingProgress === "number"
            ? session.processingProgress
            : 100,
        ingestionStage: session.processingStage ?? "Ready",
        ingestionDetail:
          session.processingDetail ?? "Publication ingestion is ready",
        stepProgress: 1,
      });
      return session;
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for ingestion session ${ingestionSessionId} to become ready`
  );
}
