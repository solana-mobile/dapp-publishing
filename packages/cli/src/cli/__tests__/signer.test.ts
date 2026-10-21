import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, jest, test } from "@jest/globals";
import { createPrivateKey, createPublicKey } from "node:crypto";

import { parseKeypair } from "../signer.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

// Address of the Ed25519 key pair whose 32-byte seed is all 1s.
const SEED = new Uint8Array(32).fill(1);
const SEED_ADDRESS = "AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9";

function solanaSecretKey(seed: Uint8Array): number[] {
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: "der",
    type: "pkcs8",
  });
  const { x } = createPublicKey(privateKey).export({ format: "jwk" });
  return [...seed, ...Buffer.from(x!, "base64url")];
}

test("parseKeypair loads a Solana keypair from a JSON array file", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dapp-store-signer-"));
  const keypairPath = path.join(tempDir, "signer.json");
  tempDirs.push(tempDir);

  fs.writeFileSync(keypairPath, JSON.stringify(solanaSecretKey(SEED)));

  expect((await parseKeypair(keypairPath))?.address).toBe(SEED_ADDRESS);
});

test("parseKeypair returns undefined and logs an error when the file is missing", async () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

  try {
    expect(await parseKeypair("/tmp/does-not-exist.json")).toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  } finally {
    logSpy.mockRestore();
  }
});
