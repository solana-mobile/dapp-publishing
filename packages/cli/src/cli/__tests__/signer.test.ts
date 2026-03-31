import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, jest, test } from "@jest/globals";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
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
    new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: appMintAddress, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, 2, 3]),
    })
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
    new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: false },
        { pubkey: nftMintAddress, isSigner: false, isWritable: true },
        { pubkey: collectionMintAddress, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([4, 5, 6]),
    })
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
