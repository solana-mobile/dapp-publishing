import {
  address,
  assertIsTransactionWithinSizeLimit,
  getAddressDecoder,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  getTransactionLifetimeConstraintFromCompiledTransactionMessage,
  verifySignature,
  type Address,
  type CompiledTransactionMessageWithLifetime,
  type LegacyCompiledTransactionMessage,
  type Transaction,
} from "@solana/kit";

import type { PublicationSigner } from "./types.js";

const COMPUTE_BUDGET_PROGRAM_ID = address(
  "ComputeBudget111111111111111111111111111111"
);
const TOKEN_METADATA_PROGRAM_ID = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const TOKEN_METADATA_SEED = "metadata";
const TOKEN_METADATA_EDITION_SEED = "edition";
const ALLOWED_PUBLICATION_PROGRAM_IDS = new Set<string>([
  COMPUTE_BUDGET_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
]);
// Token Metadata `Create` instruction discriminator and its only `CreateArgs` variant (V1).
const CREATE_INSTRUCTION_DISCRIMINATOR = 42;
const CREATE_ARGS_V1 = 0;

type CompiledMessage = LegacyCompiledTransactionMessage &
  CompiledTransactionMessageWithLifetime;

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

async function assertExistingSignaturesValid(
  transaction: Transaction
): Promise<void> {
  const invalidSigners: string[] = [];

  for (const [signerAddress, signature] of Object.entries(
    transaction.signatures
  )) {
    if (
      signature &&
      !(await verifySignature(
        await getPublicKeyFromAddress(signerAddress as Address),
        signature,
        transaction.messageBytes
      ))
    ) {
      invalidSigners.push(signerAddress);
    }
  }

  if (invalidSigners.length > 0) {
    throw new Error(
      `Portal transaction contains invalid existing signatures for ${invalidSigners.join(
        ", "
      )} and may have been modified in transit.`
    );
  }
}

/**
 * Reads `assetData.collection.key` from a Token Metadata `Create` (V1) instruction.
 * Borsh layout: u8 discriminator, u8 `CreateArgs` variant, then `AssetData`: name, symbol
 * and uri (u32-prefixed strings), u16 seller fee, `Option<Vec<Creator>>` (34 bytes each),
 * bool primarySaleHappened, bool isMutable, u8 tokenStandard, and
 * `Option<Collection { verified: bool, key: Pubkey }>`. Later fields are not read.
 */
export function decodeCreateV1CollectionAddress(
  data: Uint8Array
): string | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  const take = (length: number) => {
    if (offset + length > data.length) {
      throw new RangeError("Unexpected end of instruction data.");
    }
    const start = offset;
    offset += length;
    return start;
  };
  const u8 = () => data[take(1)]!;
  const u32 = () => view.getUint32(take(4), true);
  const option = () => {
    const tag = u8();
    if (tag > 1) {
      throw new RangeError(`Invalid option tag ${tag}.`);
    }
    return tag === 1;
  };

  if (u8() !== CREATE_INSTRUCTION_DISCRIMINATOR) {
    throw new RangeError("Not a create instruction.");
  }
  if (u8() !== CREATE_ARGS_V1) {
    throw new RangeError("Unsupported create args variant.");
  }
  take(u32()); // name
  take(u32()); // symbol
  take(u32()); // uri
  take(2); // sellerFeeBasisPoints
  if (option()) {
    take(u32() * 34); // creators
  }
  take(3); // primarySaleHappened, isMutable, tokenStandard
  if (!option()) {
    return null;
  }
  take(1); // collection.verified
  const keyOffset = take(32);
  return getAddressDecoder().decode(data.subarray(keyOffset, keyOffset + 32));
}

function getTokenMetadataCreateCollectionAddress(
  message: CompiledMessage
): string | null {
  for (const instruction of message.instructions) {
    if (
      message.staticAccounts[instruction.programAddressIndex] !==
      TOKEN_METADATA_PROGRAM_ID
    ) {
      continue;
    }

    const data = instruction.data as Uint8Array | undefined;
    if (!data || data.length === 0 || data[0] !== CREATE_INSTRUCTION_DISCRIMINATOR) {
      continue;
    }

    try {
      return decodeCreateV1CollectionAddress(data);
    } catch (error) {
      throw new Error(
        "Portal transaction contains an invalid token metadata create instruction."
      );
    }
  }

  return null;
}

async function getTokenMetadataPdaAddress(
  mintAddress: string,
  edition = false
): Promise<string> {
  const addressEncoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ID,
    seeds: [
      TOKEN_METADATA_SEED,
      addressEncoder.encode(TOKEN_METADATA_PROGRAM_ID),
      addressEncoder.encode(address(mintAddress)),
      ...(edition ? [TOKEN_METADATA_EDITION_SEED] : []),
    ],
  });
  return pda;
}

async function validatePublicationTransaction(
  signer: PublicationSigner,
  transaction: Transaction,
  message: CompiledMessage,
  validation: PublicationTransactionValidation
): Promise<void> {
  if (message.lifetimeToken !== validation.expectedBlockhash) {
    throw new Error(
      `Portal transaction blockhash mismatch. Expected ${validation.expectedBlockhash}; received ${message.lifetimeToken}.`
    );
  }

  const requiredSignerAddresses: string[] = message.staticAccounts.slice(
    0,
    message.header.numSignerAccounts
  );
  const feePayerAddress = requiredSignerAddresses[0];
  if (!feePayerAddress) {
    throw new Error("Portal transaction is missing a fee payer.");
  }
  if (feePayerAddress !== validation.expectedFeePayerAddress) {
    throw new Error(
      `Portal transaction fee payer mismatch. Expected ${validation.expectedFeePayerAddress}; received ${feePayerAddress}.`
    );
  }

  if (signer.address !== validation.expectedSignerAddress) {
    throw new Error(
      `Publication signer mismatch. Expected ${validation.expectedSignerAddress}; received ${signer.address}.`
    );
  }

  await assertExistingSignaturesValid(transaction);

  const accountAddresses: string[] = message.staticAccounts;

  if (!requiredSignerAddresses.includes(signer.address)) {
    throw new Error(
      `Portal transaction does not require the local signer ${signer.address}.`
    );
  }

  const programIds = message.instructions.map(
    (instruction) => message.staticAccounts[instruction.programAddressIndex]!
  );
  const unexpectedPrograms = programIds.filter(
    (programId) => !ALLOWED_PUBLICATION_PROGRAM_IDS.has(programId)
  );
  if (unexpectedPrograms.length > 0) {
    throw new Error(
      `Portal transaction includes unexpected program ids: ${[
        ...new Set(unexpectedPrograms),
      ].join(", ")}`
    );
  }

  if (!programIds.includes(TOKEN_METADATA_PROGRAM_ID)) {
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
      getTokenMetadataCreateCollectionAddress(message);
    if (actualCollectionMintAddress !== validation.expectedAppMintAddress) {
      throw new Error(
        `Portal transaction token metadata collection mismatch. Expected ${validation.expectedAppMintAddress}; received ${actualCollectionMintAddress ?? "[none]"}.`
      );
    }

    const mintSignature =
      transaction.signatures[validation.expectedMintAddress as Address];
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
    [
      "release metadata",
      await getTokenMetadataPdaAddress(validation.expectedNftMintAddress),
    ],
    ["app collection mint", validation.expectedCollectionMintAddress],
    [
      "app collection metadata",
      await getTokenMetadataPdaAddress(validation.expectedCollectionMintAddress),
    ],
    [
      "app collection master edition",
      await getTokenMetadataPdaAddress(
        validation.expectedCollectionMintAddress,
        true
      ),
    ],
    ["collection authority", validation.expectedCollectionAuthority],
  ]);
}

/**
 * Validates and partially signs a portal-built transaction. The message bytes are
 * signed verbatim (never recompiled) so the portal's pre-existing mint signature
 * stays valid.
 */
export const signSerializedTransaction = async (
  signer: PublicationSigner,
  serializedTransaction: string,
  validation?: PublicationTransactionValidation
): Promise<string> => {
  const transaction = getTransactionDecoder().decode(
    Buffer.from(serializedTransaction, "base64")
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes
  );
  if (message.version !== "legacy") {
    throw new Error(
      `Portal transaction must use the legacy format; received version ${message.version}.`
    );
  }

  if (validation) {
    await validatePublicationTransaction(
      signer,
      transaction,
      message,
      validation
    );
  }

  const signableTransaction = {
    ...transaction,
    lifetimeConstraint:
      await getTransactionLifetimeConstraintFromCompiledTransactionMessage(
        message
      ),
  };
  assertIsTransactionWithinSizeLimit(signableTransaction);
  const [signatures] = await signer.signTransactions([signableTransaction]);

  return getBase64EncodedWireTransaction({
    ...transaction,
    signatures: { ...transaction.signatures, ...signatures },
  });
};
