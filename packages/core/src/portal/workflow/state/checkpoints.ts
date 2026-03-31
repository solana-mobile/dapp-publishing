import type { PublicationCheckpoint, PublicationSession } from "../../types.js";

const publicationCheckpointOrder: PublicationCheckpoint[] = [
  "created",
  "bundle-ready",
  "mint-submitted",
  "mint-saved",
  "verification-submitted",
  "verified",
  "attested",
  "submitted",
  "completed",
];

export function checkpointAtLeast(
  checkpoint: PublicationCheckpoint,
  expected: PublicationCheckpoint
): boolean {
  return (
    publicationCheckpointOrder.indexOf(checkpoint) >=
    publicationCheckpointOrder.indexOf(expected)
  );
}

export function publicationStageToCheckpoint(
  stage: PublicationSession["stage"]
): PublicationCheckpoint {
  if (!stage) {
    return "created";
  }

  switch (stage) {
    case "PreparedForMint":
      return "bundle-ready";
    case "MintSubmitted":
      return "mint-submitted";
    case "MintSaved":
      return "mint-saved";
    case "VerificationSubmitted":
      return "verification-submitted";
    case "Verified":
      return "verified";
    case "Attested":
      return "attested";
    case "Submitted":
      return "submitted";
    case "Failed":
    default:
      return "created";
  }
}

export function publicationStageToStatus(
  stage: PublicationSession["stage"]
): PublicationSession["status"] {
  if (!stage) {
    return "pending";
  }

  switch (stage) {
    case "Submitted":
      return "completed";
    case "Failed":
      return "failed";
    case "PreparedForMint":
      return "pending";
    default:
      return "running";
  }
}
