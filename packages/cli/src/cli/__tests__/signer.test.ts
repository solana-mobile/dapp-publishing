import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, jest, test } from "@jest/globals";
import { Keypair } from "@solana/web3.js";

import { parseKeypair } from "../signer.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

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
