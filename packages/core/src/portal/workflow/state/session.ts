import type {
  PublicationBundle,
  PublicationSession,
  PublicationSessionStage,
} from "../../types.js";
import {
  publicationStageToCheckpoint,
  publicationStageToStatus,
} from "./checkpoints.js";

export function normalizePublicationSession(
  session: PublicationSession
): PublicationSession {
  const stage = resolvePublicationSessionStage(session);
  const checkpoint = session.checkpoint ?? publicationStageToCheckpoint(stage);

  return {
    ...session,
    stage,
    checkpoint,
    status: session.status ?? publicationStageToStatus(stage),
    releaseMintAddress:
      session.releaseMintAddress ?? session.expectedMintAddress ?? null,
    verifyTransactionSignature:
      session.verifyTransactionSignature ??
      session.verificationTransactionSignature ??
      null,
  };
}

export function resolvePublicationSessionStage(
  session: PublicationSession
): PublicationSessionStage {
  if (session.stage) {
    return session.stage;
  }

  if (session.status === "failed") {
    return "Failed";
  }

  if (session.status === "completed") {
    return "Submitted";
  }

  if (
    session.checkpoint === "submitted" ||
    session.checkpoint === "completed"
  ) {
    return "Submitted";
  }

  if (session.checkpoint === "verified") {
    return "Verified";
  }

  if (session.checkpoint === "attested") {
    return "Attested";
  }

  if (session.checkpoint === "verification-submitted") {
    return "VerificationSubmitted";
  }

  if (session.checkpoint === "mint-saved") {
    return "MintSaved";
  }

  if (session.checkpoint === "mint-submitted") {
    return "MintSubmitted";
  }

  return "PreparedForMint";
}

export function resolveReleaseMintAddress(
  bundle: PublicationBundle,
  publicationSession: PublicationSession
): string | undefined {
  return (
    publicationSession.releaseMintAddress ??
    publicationSession.expectedMintAddress ??
    bundle.release.nftMintAddress ??
    bundle.release.releaseMintAddress ??
    undefined
  );
}
