import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, jest, test } from "@jest/globals";
import {
  createCreateInstruction,
  createVerifyInstruction,
  VerificationArgs,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { signSerializedTransaction } from "../../../../core/src/portal/signer.js";

import { createPublicationSignerFromKeypair, parseKeypair } from "../signer.js";

const tempDirs: string[] = [];
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const TOKEN_METADATA_SEED = Buffer.from("metadata");
const TOKEN_METADATA_EDITION_SEED = Buffer.from("edition");

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createReleaseMintTransaction(options?: {
  signer?: Keypair;
  mint?: Keypair;
  appMintAddress?: PublicKey;
  addUnexpectedProgram?: boolean;
  tamperAfterMintSignature?: boolean;
}) {
  const signer = options?.signer ?? Keypair.generate();
  const mint = options?.mint ?? Keypair.generate();
  const appMintAddress =
    options?.appMintAddress ?? Keypair.generate().publicKey;

  const transaction = new Transaction();
  transaction.feePayer = signer.publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000,
    })
  );
  transaction.add(
    (() => {
      const instruction = createCreateInstruction(
        {
          metadata: Keypair.generate().publicKey,
          masterEdition: Keypair.generate().publicKey,
          mint: mint.publicKey,
          authority: signer.publicKey,
          payer: signer.publicKey,
          updateAuthority: signer.publicKey,
          sysvarInstructions: Keypair.generate().publicKey,
          splTokenProgram: Keypair.generate().publicKey,
        },
        {
          createArgs: {
            __kind: "V1",
            assetData: {
              name: "Example release",
              symbol: "",
              uri: "https://example.com/release.json",
              sellerFeeBasisPoints: 0,
              creators: null,
              primarySaleHappened: false,
              isMutable: false,
              tokenStandard: 0,
              collection: {
                verified: false,
                key: appMintAddress,
              },
              uses: null,
              collectionDetails: null,
              ruleSet: null,
            },
            decimals: null,
            printSupply: null,
          },
        }
      );

      instruction.keys[2]!.isSigner = true;
      instruction.keys[5]!.isSigner = true;

      return instruction;
    })()
  );

  if (options?.addUnexpectedProgram) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      })
    );
  }

  transaction.partialSign(mint);

  if (options?.tamperAfterMintSignature) {
    transaction.instructions[1] = new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: transaction.instructions[1]!.keys,
      data: Buffer.from([9, 9, 9]),
    });
  }

  return {
    signer,
    mint,
    appMintAddress,
    blockhash: transaction.recentBlockhash!,
    serialized: transaction
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      .toString("base64"),
  };
}

function getMetadataPda(mintAddress: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      TOKEN_METADATA_SEED,
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mintAddress.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function getMasterEditionPda(mintAddress: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      TOKEN_METADATA_SEED,
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mintAddress.toBuffer(),
      TOKEN_METADATA_EDITION_SEED,
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function createVerifyCollectionTransaction(options?: {
  signer?: Keypair;
  nftMintAddress?: PublicKey;
  collectionMintAddress?: PublicKey;
}) {
  const signer = options?.signer ?? Keypair.generate();
  const nftMintAddress =
    options?.nftMintAddress ?? Keypair.generate().publicKey;
  const collectionMintAddress =
    options?.collectionMintAddress ?? Keypair.generate().publicKey;

  const transaction = new Transaction();
  transaction.feePayer = signer.publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1_000,
    })
  );
  transaction.add(
    createVerifyInstruction(
      {
        authority: signer.publicKey,
        metadata: getMetadataPda(nftMintAddress),
        collectionMint: collectionMintAddress,
        collectionMetadata: getMetadataPda(collectionMintAddress),
        collectionMasterEdition: getMasterEditionPda(collectionMintAddress),
        systemProgram: SystemProgram.programId,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      {
        verificationArgs: VerificationArgs.CollectionV1,
      }
    )
  );

  return {
    signer,
    nftMintAddress,
    collectionMintAddress,
    blockhash: transaction.recentBlockhash!,
    serialized: transaction
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      .toString("base64"),
  };
}

test("parseKeypair loads a Solana keypair from a JSON array file", () => {
  const keypair = Keypair.generate();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dapp-store-signer-"));
  const keypairPath = path.join(tempDir, "signer.json");
  tempDirs.push(tempDir);

  fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));

  const parsedKeypair = parseKeypair(keypairPath);

  expect(parsedKeypair?.publicKey.toBase58()).toBe(
    keypair.publicKey.toBase58()
  );
});

test("parseKeypair returns undefined and logs an error when the file is missing", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

  try {
    expect(parseKeypair("/tmp/does-not-exist.json")).toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  } finally {
    logSpy.mockRestore();
  }
});

test("signSerializedTransaction signs a validated release mint transaction", async () => {
  const { signer, mint, appMintAddress, blockhash, serialized } =
    createReleaseMintTransaction();

  const accountAddresses = Transaction.from(
    Buffer.from(serialized, "base64")
  )
    .compileMessage()
    .accountKeys.map((key) => key.toBase58());
  expect(accountAddresses).not.toContain(appMintAddress.toBase58());

  const signedTransaction = await signSerializedTransaction(
    createPublicationSignerFromKeypair(signer),
    serialized,
    {
      kind: "release-mint",
      expectedBlockhash: blockhash,
      expectedFeePayerAddress: signer.publicKey.toBase58(),
      expectedSignerAddress: signer.publicKey.toBase58(),
      expectedMintAddress: mint.publicKey.toBase58(),
      expectedAppMintAddress: appMintAddress.toBase58(),
    }
  );

  expect(
    Transaction.from(
      Buffer.from(signedTransaction, "base64")
    ).verifySignatures()
  ).toBe(true);
});

test("signSerializedTransaction rejects release mint transactions with unexpected programs", async () => {
  const { signer, mint, appMintAddress, blockhash, serialized } =
    createReleaseMintTransaction({
      addUnexpectedProgram: true,
    });

  await expect(
    signSerializedTransaction(
      createPublicationSignerFromKeypair(signer),
      serialized,
      {
        kind: "release-mint",
        expectedBlockhash: blockhash,
        expectedFeePayerAddress: signer.publicKey.toBase58(),
        expectedSignerAddress: signer.publicKey.toBase58(),
        expectedMintAddress: mint.publicKey.toBase58(),
        expectedAppMintAddress: appMintAddress.toBase58(),
      }
    )
  ).rejects.toThrow("unexpected program ids");
});

test("signSerializedTransaction rejects release mint transactions with invalid pre-existing signatures", async () => {
  const { signer, mint, appMintAddress, blockhash, serialized } =
    createReleaseMintTransaction({
      tamperAfterMintSignature: true,
    });

  await expect(
    signSerializedTransaction(
      createPublicationSignerFromKeypair(signer),
      serialized,
      {
        kind: "release-mint",
        expectedBlockhash: blockhash,
        expectedFeePayerAddress: signer.publicKey.toBase58(),
        expectedSignerAddress: signer.publicKey.toBase58(),
        expectedMintAddress: mint.publicKey.toBase58(),
        expectedAppMintAddress: appMintAddress.toBase58(),
      }
    )
  ).rejects.toThrow("invalid existing signatures");
});

test("signSerializedTransaction rejects release mint transactions with a mismatched collection encoded in metadata", async () => {
  const { signer, mint, blockhash, serialized } = createReleaseMintTransaction();
  const unexpectedAppMintAddress = Keypair.generate().publicKey;

  await expect(
    signSerializedTransaction(
      createPublicationSignerFromKeypair(signer),
      serialized,
      {
        kind: "release-mint",
        expectedBlockhash: blockhash,
        expectedFeePayerAddress: signer.publicKey.toBase58(),
        expectedSignerAddress: signer.publicKey.toBase58(),
        expectedMintAddress: mint.publicKey.toBase58(),
        expectedAppMintAddress: unexpectedAppMintAddress.toBase58(),
      }
    )
  ).rejects.toThrow("collection mismatch");
});

test("signSerializedTransaction signs a validated collection verification transaction", async () => {
  const {
    signer,
    nftMintAddress,
    collectionMintAddress,
    blockhash,
    serialized,
  } = createVerifyCollectionTransaction();

  const signedTransaction = await signSerializedTransaction(
    createPublicationSignerFromKeypair(signer),
    serialized,
    {
      kind: "verify-collection",
      expectedBlockhash: blockhash,
      expectedFeePayerAddress: signer.publicKey.toBase58(),
      expectedSignerAddress: signer.publicKey.toBase58(),
      expectedNftMintAddress: nftMintAddress.toBase58(),
      expectedCollectionMintAddress: collectionMintAddress.toBase58(),
      expectedCollectionAuthority: signer.publicKey.toBase58(),
    }
  );

  expect(
    Transaction.from(
      Buffer.from(signedTransaction, "base64")
    ).verifySignatures()
  ).toBe(true);
});
