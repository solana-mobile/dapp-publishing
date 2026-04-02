import {
  createAttestationPayloadFromClient,
  type PublicationAttestationResult,
} from "../attestation.js";
import {
  signSerializedTransaction,
  type PublicationTransactionValidation,
} from "../signer.js";
import type {
  PublicationAttestationClient,
  PublicationBundle,
  PublicationSession,
  PublicationSigner,
  PublicationWorkflowLogger,
  PublicationWorkflowResult,
} from "../types.js";
import type { PublicationWorkflowClient } from "./contracts.js";
import { logWorkflowInfo } from "./logging.js";
import {
  checkpointAtLeast,
  publicationStageToCheckpoint,
} from "./state/checkpoints.js";
import {
  normalizePublicationBundle,
  resolvePublicationFeePayer,
  resolvePublicationSignerAddress,
  resolveReleaseDisplayName,
  resolveReleaseMetadataUri,
  validatePublicationBundle,
} from "./state/bundle.js";
import {
  normalizePublicationSession,
  resolveReleaseMintAddress,
} from "./state/session.js";

type PublicationExecutionContext = {
  client: PublicationWorkflowClient;
  bundle: PublicationBundle;
  signer: PublicationSigner;
  attestationClient: PublicationAttestationClient;
  publicationSession: PublicationSession;
  publicationCheckpoint: NonNullable<PublicationSession["checkpoint"]>;
  logger?: PublicationWorkflowLogger;
  releaseMetadataUri: string;
  publisherAddress: string;
  payerAddress: string;
};

type PublicationExecutionState = {
  releaseTransactionSignature?: string;
  collectionTransactionSignature?: string;
  attestationResult?: PublicationAttestationResult;
  hubspotTicketId?: string;
  releaseMintAddress?: string;
};

async function signPreparedTransaction(
  signer: PublicationSigner,
  serializedTransaction: string,
  validation: PublicationTransactionValidation
): Promise<string> {
  return signSerializedTransaction(signer, serializedTransaction, validation);
}

async function submitReleaseMintIfNeeded(
  context: PublicationExecutionContext,
  state: PublicationExecutionState
) {
  if (checkpointAtLeast(context.publicationCheckpoint, "mint-submitted")) {
    return;
  }

  logWorkflowInfo(context.logger, "Preparing release NFT transaction", {
    step: "mint.prepare",
    status: "running",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
  });

  const preparedReleaseTransaction =
    await context.client.prepareReleaseNftTransaction({
      releaseId: context.bundle.releaseId,
      releaseName: resolveReleaseDisplayName(context.bundle),
      releaseMetadataUri: context.releaseMetadataUri,
      appMintAddress: context.bundle.signerAuthority.appMintAddress,
      publisherAddress: context.publisherAddress,
      payerAddress: context.payerAddress,
    });

  state.releaseMintAddress = preparedReleaseTransaction.mintAddress;
  state.releaseTransactionSignature = await signPreparedTransaction(
    context.signer,
    preparedReleaseTransaction.transaction,
    {
      kind: "release-mint",
      expectedBlockhash: preparedReleaseTransaction.blockhash,
      expectedFeePayerAddress: context.payerAddress,
      expectedSignerAddress: context.publisherAddress,
      expectedMintAddress: preparedReleaseTransaction.mintAddress,
      expectedAppMintAddress: context.bundle.signerAuthority.appMintAddress,
    }
  );

  const signedTransactionResult = await context.client.submitSignedTransaction({
    signedTransaction: state.releaseTransactionSignature,
    publicationSessionId: context.publicationSession.id,
  });

  state.releaseTransactionSignature =
    signedTransactionResult.transactionSignature;

  logWorkflowInfo(context.logger, "Release NFT transaction submitted", {
    step: "mint.submit",
    status: "complete",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    transactionSignature: state.releaseTransactionSignature,
  });
}

async function saveReleaseMintIfNeeded(
  context: PublicationExecutionContext,
  state: PublicationExecutionState
) {
  if (checkpointAtLeast(context.publicationCheckpoint, "mint-saved")) {
    return;
  }

  const mintAddress =
    context.publicationSession.releaseMintAddress ??
    context.publicationSession.expectedMintAddress ??
    context.bundle.release.releaseMintAddress ??
    state.releaseMintAddress;

  if (!mintAddress) {
    throw new Error(
      "Publication bundle did not include a release mint address"
    );
  }

  if (!state.releaseTransactionSignature) {
    throw new Error("Release transaction signature is missing");
  }

  logWorkflowInfo(context.logger, "Saving release NFT data", {
    step: "mint.save",
    status: "running",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    mintAddress,
  });

  await context.client.saveReleaseNftData({
    releaseId: context.bundle.releaseId,
    mintAddress,
    transactionSignature: state.releaseTransactionSignature,
    metadataUri: context.releaseMetadataUri,
    ownerAddress: context.publisherAddress,
    releaseName: resolveReleaseDisplayName(context.bundle),
    releaseVersion: context.bundle.release.versionName,
    androidPackage: context.bundle.release.androidPackage,
    appMintAddress: context.bundle.signerAuthority.appMintAddress,
  });

  state.releaseMintAddress = mintAddress;

  logWorkflowInfo(context.logger, "Release NFT data saved", {
    step: "mint.save",
    status: "complete",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    mintAddress,
  });
}

async function verifyReleaseCollectionIfNeeded(
  context: PublicationExecutionContext,
  state: PublicationExecutionState
) {
  if (
    checkpointAtLeast(context.publicationCheckpoint, "verification-submitted")
  ) {
    return;
  }

  if (!state.releaseMintAddress) {
    throw new Error(
      "Publication bundle did not include a release mint address for collection verification"
    );
  }

  logWorkflowInfo(
    context.logger,
    "Preparing collection verification transaction",
    {
      step: "verify.prepare",
      status: "running",
      releaseId: context.bundle.releaseId,
      publicationSessionId: context.publicationSession.id,
      mintAddress: state.releaseMintAddress,
    }
  );

  const preparedVerifyTransaction =
    await context.client.prepareVerifyCollectionTransaction({
      dappId: context.bundle.signerAuthority.dappId ?? context.bundle.dapp.id,
      nftMintAddress: state.releaseMintAddress,
      collectionMintAddress: context.bundle.signerAuthority.appMintAddress,
      collectionAuthority: context.bundle.signerAuthority.collectionAuthority,
      payerAddress: context.payerAddress,
    });

  state.collectionTransactionSignature = await signPreparedTransaction(
    context.signer,
    preparedVerifyTransaction.transaction,
    {
      kind: "verify-collection",
      expectedBlockhash: preparedVerifyTransaction.blockhash,
      expectedFeePayerAddress: context.payerAddress,
      expectedSignerAddress: context.publisherAddress,
      expectedNftMintAddress: state.releaseMintAddress,
      expectedCollectionMintAddress:
        context.bundle.signerAuthority.appMintAddress,
      expectedCollectionAuthority:
        context.bundle.signerAuthority.collectionAuthority,
    }
  );

  logWorkflowInfo(
    context.logger,
    "Submitting collection verification transaction",
    {
      step: "verify.submit",
      status: "running",
      releaseId: context.bundle.releaseId,
      publicationSessionId: context.publicationSession.id,
      mintAddress: state.releaseMintAddress,
    }
  );

  const signedVerifyTransactionResult =
    await context.client.submitSignedTransaction({
      signedTransaction: state.collectionTransactionSignature,
      publicationSessionId: context.publicationSession.id,
    });

  state.collectionTransactionSignature =
    signedVerifyTransactionResult.transactionSignature;

  await context.client.markReleaseCollectionAsVerified({
    releaseId: context.bundle.releaseId,
  });

  logWorkflowInfo(context.logger, "Release collection verified", {
    step: "verify.submit",
    status: "complete",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    transactionSignature: state.collectionTransactionSignature,
  });
}

async function attestAndSubmitIfNeeded(
  context: PublicationExecutionContext,
  state: PublicationExecutionState
) {
  if (checkpointAtLeast(context.publicationCheckpoint, "submitted")) {
    return;
  }

  logWorkflowInfo(context.logger, "Creating attestation payload", {
    step: "attestation.create",
    status: "running",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
  });

  state.attestationResult = await createAttestationPayloadFromClient(
    context.attestationClient,
    context.signer
  );

  logWorkflowInfo(context.logger, "Attestation payload created", {
    step: "attestation.create",
    status: "complete",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    requestUniqueId: state.attestationResult.requestUniqueId,
  });

  logWorkflowInfo(context.logger, "Submitting release to store", {
    step: "submit.store",
    status: "running",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
  });

  const submissionResult = await context.client.submitToStore({
    releaseId: context.bundle.releaseId,
    whatsNew: context.bundle.release.newInVersion,
    attestation: {
      payload: state.attestationResult.payload,
      requestUniqueId: state.attestationResult.requestUniqueId,
    },
  });

  state.hubspotTicketId =
    submissionResult.hubspotTicketId ?? state.hubspotTicketId;

  logWorkflowInfo(context.logger, "Release submitted to store", {
    step: "submit.store",
    status: "complete",
    releaseId: context.bundle.releaseId,
    publicationSessionId: context.publicationSession.id,
    hubspotTicketId: state.hubspotTicketId,
  });
}

export async function runPublicationWorkflow(
  client: PublicationWorkflowClient,
  bundle: PublicationBundle,
  signer: PublicationSigner,
  attestationClient: PublicationAttestationClient,
  session: PublicationSession,
  logger?: PublicationWorkflowLogger
): Promise<PublicationWorkflowResult> {
  const normalizedBundle = normalizePublicationBundle(bundle);
  const normalizedSession = normalizePublicationSession(session);
  validatePublicationBundle(normalizedBundle);

  const requiredSignerAddress =
    resolvePublicationSignerAddress(normalizedBundle);
  if (signer.publicKey !== requiredSignerAddress) {
    throw new Error(
      `Publication signer mismatch. Expected ${requiredSignerAddress}; received ${signer.publicKey}.`
    );
  }

  if (normalizedSession.stage === "Failed") {
    throw new Error(
      normalizedSession.lastError ||
        normalizedSession.error ||
        "Publication session failed"
    );
  }

  const publicationSession = normalizedSession;
  const publicationCheckpoint =
    publicationSession.checkpoint ??
    publicationStageToCheckpoint(publicationSession.stage);
  const state: PublicationExecutionState = {
    releaseTransactionSignature:
      publicationSession.mintTransactionSignature ?? undefined,
    collectionTransactionSignature:
      publicationSession.verifyTransactionSignature ??
      publicationSession.verificationTransactionSignature ??
      undefined,
    hubspotTicketId: publicationSession.hubspotTicketId ?? undefined,
    releaseMintAddress: resolveReleaseMintAddress(
      normalizedBundle,
      publicationSession
    ),
  };

  const context: PublicationExecutionContext = {
    client,
    bundle: normalizedBundle,
    signer,
    attestationClient,
    publicationSession,
    publicationCheckpoint,
    logger,
    releaseMetadataUri: resolveReleaseMetadataUri(
      normalizedBundle,
      publicationSession
    ),
    publisherAddress: resolvePublicationSignerAddress(normalizedBundle),
    payerAddress: resolvePublicationFeePayer(normalizedBundle, signer),
  };

  await submitReleaseMintIfNeeded(context, state);
  await saveReleaseMintIfNeeded(context, state);
  await verifyReleaseCollectionIfNeeded(context, state);
  await attestAndSubmitIfNeeded(context, state);

  if (!state.releaseMintAddress) {
    throw new Error(
      "Publication session did not resolve a release mint address"
    );
  }

  return {
    ingestionSessionId:
      publicationSession.ingestionSessionId ??
      normalizedBundle.ingestionSessionId ??
      "",
    publicationSessionId:
      publicationSession.id || normalizedBundle.publicationSessionId || "",
    releaseId: normalizedBundle.releaseId || publicationSession.releaseId || "",
    releaseMintAddress: state.releaseMintAddress,
    collectionMintAddress: normalizedBundle.signerAuthority.appMintAddress,
    releaseTransactionSignature: state.releaseTransactionSignature,
    collectionTransactionSignature: state.collectionTransactionSignature,
    attestationRequestUniqueId:
      state.attestationResult?.requestUniqueId ??
      publicationSession.attestationRequestUniqueId ??
      undefined,
    hubspotTicketId: state.hubspotTicketId,
    publicationBundle: normalizedBundle,
    publicationSession,
  };
}
