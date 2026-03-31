import { createPublicKey, verify } from "node:crypto";

import {
  CreateStruct,
  createInstructionDiscriminator,
  isCreateArgsV1,
} from "@metaplex-foundation/mpl-token-metadata";
import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";

import type { PublicationSigner } from "./types.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const ALLOWED_PUBLICATION_PROGRAM_IDS = new Set([
  ComputeBudgetProgram.programId.toBase58(),
  TOKEN_METADATA_PROGRAM_ID.toBase58(),
]);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type PublicationSignerAdapter = {
  publicKey: string;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
};

export type PublicationTransactionValidation =
  | {
      kind: "release-mint";
      expectedBlockhash: string;
      expectedFeePayerAddress: string;
      expectedSignerAddress: string;
      expectedMintAddress: string;
      expectedAppMintAddress: string;
    }
  | {
      kind: "verify-collection";
      expectedBlockhash: string;
      expectedFeePayerAddress: string;
      expectedSignerAddress: string;
      expectedNftMintAddress: string;
      expectedCollectionMintAddress: string;
      expectedCollectionAuthority: string;
    };

export const createPublicationSigner = (
  adapter: PublicationSignerAdapter
): PublicationSigner => ({
  publicKey: adapter.publicKey,
  signTransaction: adapter.signTransaction,
  signMessage: adapter.signMessage,
});

export const isPublicationSigner = (
  value: unknown
): value is PublicationSigner =>
  typeof value === "object" &&
  value !== null &&
  "publicKey" in value &&
  "signTransaction" in value &&
  "signMessage" in value;

function assertExactAddressSet(
  actual: string[],
  expected: string[],
  label: string
): void {
  const normalizedActual = [...new Set(actual)].sort();
  const normalizedExpected = [...new Set(expected)].sort();

  if (
    normalizedActual.length !== normalizedExpected.length ||
    normalizedActual.some((value, index) => value !== normalizedExpected[index])
  ) {
    throw new Error(
      `${label} signer set mismatch. Expected ${normalizedExpected.join(
        ", "
      )}; received ${normalizedActual.join(", ") || "[none]"}.`
    );
  }
}

function assertAccountsPresent(
  accountAddresses: string[],
  expectedAddresses: Array<[string, string]>
): void {
  for (const [label, address] of expectedAddresses) {
    if (!accountAddresses.includes(address)) {
      throw new Error(
        `Portal transaction is missing the expected ${label} account: ${address}`
      );
    }
  }
}

function assertExistingSignaturesValid(transaction: Transaction): void {
  const signedEntries = transaction.signatures.filter(
    ({ signature }) => signature !== null
  );

  if (signedEntries.length === 0) {
    return;
  }

  const message = transaction.serializeMessage();
  const invalidSigners = signedEntries
    .filter(
      ({ publicKey, signature }) =>
        !verify(
          null,
          message,
          createPublicKey({
            key: Buffer.concat([
              ED25519_SPKI_PREFIX,
              Buffer.from(publicKey.toBytes()),
            ]),
            format: "der",
            type: "spki",
          }),
          signature!
        )
    )
    .map(({ publicKey }) => publicKey.toBase58());

  if (invalidSigners.length > 0) {
    throw new Error(
      `Portal transaction contains invalid existing signatures for ${invalidSigners.join(
        ", "
      )} and may have been modified in transit.`
    );
  }
}

function getTokenMetadataCreateCollectionAddress(
  transaction: Transaction
): string | null {
  for (const instruction of transaction.instructions) {
    if (!instruction.programId.equals(TOKEN_METADATA_PROGRAM_ID)) {
      continue;
    }

    if (
      instruction.data.length === 0 ||
      instruction.data[0] !== createInstructionDiscriminator
    ) {
      continue;
    }

    try {
      const [decodedInstruction] = CreateStruct.deserialize(instruction.data);

      if (!isCreateArgsV1(decodedInstruction.createArgs)) {
        continue;
      }

      return decodedInstruction.createArgs.assetData.collection?.key.toBase58() ?? null;
    } catch (error) {
      throw new Error(
        "Portal transaction contains an invalid token metadata create instruction."
      );
    }
  }

  return null;
}

function validatePublicationTransaction(
  signer: PublicationSigner,
  transaction: Transaction,
  validation: PublicationTransactionValidation
): void {
  if (transaction.recentBlockhash !== validation.expectedBlockhash) {
    throw new Error(
      `Portal transaction blockhash mismatch. Expected ${validation.expectedBlockhash}; received ${transaction.recentBlockhash}.`
    );
  }

  const feePayerAddress = transaction.feePayer?.toBase58();
  if (!feePayerAddress) {
    throw new Error("Portal transaction is missing a fee payer.");
  }
  if (feePayerAddress !== validation.expectedFeePayerAddress) {
    throw new Error(
      `Portal transaction fee payer mismatch. Expected ${validation.expectedFeePayerAddress}; received ${feePayerAddress}.`
    );
  }

  if (signer.publicKey !== validation.expectedSignerAddress) {
    throw new Error(
      `Publication signer mismatch. Expected ${validation.expectedSignerAddress}; received ${signer.publicKey}.`
    );
  }

  assertExistingSignaturesValid(transaction);

  const compiledMessage = transaction.compileMessage();
  const accountAddresses = compiledMessage.accountKeys.map((key) =>
    key.toBase58()
  );
  const requiredSignerAddresses = compiledMessage.accountKeys
    .slice(0, compiledMessage.header.numRequiredSignatures)
    .map((key) => key.toBase58());

  if (!requiredSignerAddresses.includes(signer.publicKey)) {
    throw new Error(
      `Portal transaction does not require the local signer ${signer.publicKey}.`
    );
  }

  const unexpectedPrograms = transaction.instructions
    .map((instruction) => instruction.programId.toBase58())
    .filter((programId) => !ALLOWED_PUBLICATION_PROGRAM_IDS.has(programId));
  if (unexpectedPrograms.length > 0) {
    throw new Error(
      `Portal transaction includes unexpected program ids: ${[
        ...new Set(unexpectedPrograms),
      ].join(", ")}`
    );
  }

  if (
    !transaction.instructions.some((instruction) =>
      instruction.programId.equals(TOKEN_METADATA_PROGRAM_ID)
    )
  ) {
    throw new Error(
      "Portal transaction is missing the expected token metadata instruction."
    );
  }

  if (validation.kind === "release-mint") {
    assertExactAddressSet(
      requiredSignerAddresses,
      [validation.expectedFeePayerAddress, validation.expectedMintAddress],
      "Release mint transaction"
    );
    assertAccountsPresent(accountAddresses, [
      ["release mint", validation.expectedMintAddress],
    ]);

    const actualCollectionMintAddress =
      getTokenMetadataCreateCollectionAddress(transaction);
    if (actualCollectionMintAddress !== validation.expectedAppMintAddress) {
      throw new Error(
        `Portal transaction token metadata collection mismatch. Expected ${validation.expectedAppMintAddress}; received ${actualCollectionMintAddress ?? "[none]"}.`
      );
    }

    const mintSignature = transaction.signatures.find(({ publicKey }) =>
      publicKey.equals(new PublicKey(validation.expectedMintAddress))
    )?.signature;
    if (!mintSignature) {
      throw new Error(
        "Release mint transaction is missing the pre-signed mint signature."
      );
    }

    return;
  }

  assertExactAddressSet(
    requiredSignerAddresses,
    [
      validation.expectedFeePayerAddress,
      validation.expectedCollectionAuthority,
    ],
    "Collection verification transaction"
  );
  assertAccountsPresent(accountAddresses, [
    ["release mint", validation.expectedNftMintAddress],
    ["app collection mint", validation.expectedCollectionMintAddress],
    ["collection authority", validation.expectedCollectionAuthority],
  ]);
}

export const signSerializedTransaction = async (
  signer: PublicationSigner,
  serializedTransaction: string,
  validation?: PublicationTransactionValidation
): Promise<string> => {
  const transaction = Transaction.from(
    Buffer.from(serializedTransaction, "base64")
  );

  if (validation) {
    validatePublicationTransaction(signer, transaction, validation);
  }

  const signedTransaction = await signer.signTransaction(transaction);
  return signedTransaction.serialize().toString("base64");
};
