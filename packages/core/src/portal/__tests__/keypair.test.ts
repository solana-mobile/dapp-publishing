import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, jest, test } from "@jest/globals";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from "@solana/kit";

import { PublishingError } from "../../errors.js";
import { createAttestationPayload } from "../attestation.js";
import { loadKeypairSignerFromFile } from "../keypair.js";
import {
  decodeCreateV1CollectionAddress,
  signSerializedTransaction,
} from "../signer.js";
// Captured from the 1.x implementation, before the @solana/kit migration.
import fixtures from "./fixtures/signing.json";

const tempDirs: string[] = [];

afterEach(() => {
  jest.restoreAllMocks();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createSigner = () =>
  createKeyPairSignerFromPrivateKeyBytes(
    new Uint8Array(32).fill(fixtures.signerSeedByte)
  );

const releaseMintValidation = {
  kind: "release-mint" as const,
  expectedBlockhash: fixtures.blockhash,
  expectedFeePayerAddress: fixtures.signerAddress,
  expectedSignerAddress: fixtures.signerAddress,
  expectedMintAddress: fixtures.mintAddress,
  expectedAppMintAddress: fixtures.appMintAddress,
};

const decode = (base64: string) =>
  getTransactionDecoder().decode(Buffer.from(base64, "base64"));

function writeKeypairFile(bytes: number[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dapp-store-signer-"));
  tempDirs.push(tempDir);
  const keypairPath = path.join(tempDir, "signer.json");
  fs.writeFileSync(keypairPath, JSON.stringify(bytes));
  return keypairPath;
}

test("loadKeypairSignerFromFile loads a Solana keypair from a JSON array file", async () => {
  const keypairPath = writeKeypairFile([
    ...new Uint8Array(32).fill(fixtures.signerSeedByte),
    ...getAddressEncoder().encode(fixtures.signerAddress as Address),
  ]);

  expect((await loadKeypairSignerFromFile(keypairPath)).address).toBe(
    fixtures.signerAddress
  );
});

test("loadKeypairSignerFromFile throws a typed error for missing or invalid files", async () => {
  const invalidPath = writeKeypairFile([1, 2, 3]);

  for (const keypairPath of ["/tmp/does-not-exist.json", invalidPath]) {
    const thrown = await loadKeypairSignerFromFile(keypairPath).catch(
      (error: unknown) => error
    );
    expect(thrown).toBeInstanceOf(PublishingError);
    expect((thrown as PublishingError).code).toBe("INVALID_KEYPAIR");
  }
});

test("signSerializedTransaction signs a release mint transaction byte-identically to the 1.x implementation", async () => {
  const signed = await signSerializedTransaction(
    await createSigner(),
    fixtures.releaseMintPartiallySigned,
    releaseMintValidation
  );

  expect(signed).toBe(fixtures.releaseMintSigned);
  const input = decode(fixtures.releaseMintPartiallySigned);
  const output = decode(signed);
  expect(output.messageBytes).toEqual(input.messageBytes);
  expect(output.signatures[fixtures.mintAddress as Address]).toEqual(
    input.signatures[fixtures.mintAddress as Address]
  );
});

test("signSerializedTransaction signs a collection verification transaction byte-identically to the 1.x implementation", async () => {
  const signed = await signSerializedTransaction(
    await createSigner(),
    fixtures.verifyCollectionUnsigned,
    {
      kind: "verify-collection",
      expectedBlockhash: fixtures.blockhash,
      expectedFeePayerAddress: fixtures.signerAddress,
      expectedSignerAddress: fixtures.signerAddress,
      expectedNftMintAddress: fixtures.mintAddress,
      expectedCollectionMintAddress: fixtures.appMintAddress,
      expectedCollectionAuthority: fixtures.signerAddress,
    }
  );

  expect(signed).toBe(fixtures.verifyCollectionSigned);
});

test("signSerializedTransaction rejects release mint transactions with unexpected programs", async () => {
  await expect(
    signSerializedTransaction(
      await createSigner(),
      fixtures.releaseMintWithUnexpectedProgram,
      releaseMintValidation
    )
  ).rejects.toThrow("unexpected program ids");
});

test("signSerializedTransaction rejects release mint transactions with invalid pre-existing signatures", async () => {
  const bytes = Buffer.from(fixtures.releaseMintPartiallySigned, "base64");
  const uriOffset = bytes.indexOf("release.json");
  bytes[uriOffset] = "R".charCodeAt(0);

  await expect(
    signSerializedTransaction(
      await createSigner(),
      bytes.toString("base64"),
      releaseMintValidation
    )
  ).rejects.toThrow("invalid existing signatures");
});

test("signSerializedTransaction rejects release mint transactions with a mismatched collection encoded in metadata", async () => {
  await expect(
    signSerializedTransaction(
      await createSigner(),
      fixtures.releaseMintPartiallySigned,
      { ...releaseMintValidation, expectedAppMintAddress: fixtures.mintAddress }
    )
  ).rejects.toThrow("collection mismatch");
});

test("decodeCreateV1CollectionAddress reads the collection key from a real-shaped CreateV1 instruction", () => {
  const message = getCompiledTransactionMessageDecoder().decode(
    decode(fixtures.releaseMintPartiallySigned).messageBytes
  );
  if (message.version !== "legacy") throw new Error("expected legacy");
  const createData = message.instructions[1]!.data as Uint8Array;

  expect(decodeCreateV1CollectionAddress(createData)).toBe(
    fixtures.appMintAddress
  );
  expect(() =>
    decodeCreateV1CollectionAddress(createData.subarray(0, 60))
  ).toThrow(RangeError);
});

test("createAttestationPayload produces the same payload as the 1.x implementation", async () => {
  jest.spyOn(Math, "random").mockReturnValue(0.5);

  const result = await createAttestationPayload(
    {
      slot: fixtures.attestation.slot,
      blockhash: fixtures.attestation.blockhash,
    },
    await createSigner()
  );

  expect(result.requestUniqueId).toBe(fixtures.attestation.requestUniqueId);
  expect(result.payload).toBe(fixtures.attestation.payload);
});
