import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { jest } from "@jest/globals";
import type { MetaplexFile, StorageDriver } from "@metaplex-foundation/js";
import { CachedStorageDriver } from "../CachedStorageDriver";

type MockStorageDriver = Pick<StorageDriver, "getUploadPrice" | "upload">;

describe("CachedStorageDriver", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cached-storage-driver-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("normalizes a cached legacy arweave URL and persists the rewritten manifest", async () => {
    const file = makeMetaplexFile("icon.png", Buffer.from("cached-asset"));
    const hash = hashBuffer(file.buffer);
    const manifestPath = ".asset-manifest.json";

    fs.writeFileSync(
      path.join(tempDir, manifestPath),
      JSON.stringify(
        {
          assets: {
            [file.fileName]: {
              path: file.fileName,
              sha256: hash,
              uri: "https://arweave.net/legacy-id",
            },
          },
        },
        null,
        2
      )
    );

    let uploadCalls = 0;
    const storageDriver: MockStorageDriver = {
      getUploadPrice: async (_bytes: number) => {
        throw new Error("getUploadPrice should not be called in this test");
      },
      upload: async (_file: MetaplexFile) => {
        uploadCalls += 1;
        throw new Error("upload should not be called in this test");
      },
    };

    const driver = new CachedStorageDriver(storageDriver as StorageDriver, {
      assetManifestPath: manifestPath,
    });

    await expect(driver.upload(file)).resolves.toBe(
      "https://dappstorecontent.com/legacy-id"
    );
    expect(uploadCalls).toBe(0);

    const rewrittenManifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, manifestPath), "utf-8")
    );
    expect(rewrittenManifest.schema_version).toBe("0.1");
    expect(rewrittenManifest.assets[file.fileName].uri).toBe(
      "https://dappstorecontent.com/legacy-id"
    );
  });

  test("supports absolute asset manifest paths", async () => {
    const file = makeMetaplexFile("absolute-icon.png", Buffer.from("cached-asset"));
    const hash = hashBuffer(file.buffer);
    const manifestPath = path.join(tempDir, ".asset-manifest.json");

    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          assets: {
            [file.fileName]: {
              path: file.fileName,
              sha256: hash,
              uri: "https://arweave.net/absolute-id",
            },
          },
        },
        null,
        2
      )
    );

    let uploadCalls = 0;
    const storageDriver: MockStorageDriver = {
      getUploadPrice: async (_bytes: number) => {
        throw new Error("getUploadPrice should not be called in this test");
      },
      upload: async (_file: MetaplexFile) => {
        uploadCalls += 1;
        throw new Error("upload should not be called in this test");
      },
    };

    const driver = new CachedStorageDriver(storageDriver as StorageDriver, {
      assetManifestPath: manifestPath,
    });

    await expect(driver.upload(file)).resolves.toBe(
      "https://dappstorecontent.com/absolute-id"
    );
    expect(uploadCalls).toBe(0);

    const rewrittenManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(rewrittenManifest.assets[file.fileName].uri).toBe(
      "https://dappstorecontent.com/absolute-id"
    );
  });

  test("normalizes fresh uploads before persisting them in the manifest", async () => {
    const file = makeMetaplexFile("banner.png", Buffer.from("fresh-asset"));
    const manifestPath = ".asset-manifest.json";

    let uploadCalls = 0;
    const storageDriver: MockStorageDriver = {
      getUploadPrice: async (_bytes: number) => {
        throw new Error("getUploadPrice should not be called in this test");
      },
      upload: async (_file: MetaplexFile) => {
        uploadCalls += 1;
        return "https://arweave.com/fresh-id";
      },
    };

    const driver = new CachedStorageDriver(storageDriver as StorageDriver, {
      assetManifestPath: manifestPath,
    });

    await expect(driver.upload(file)).resolves.toBe(
      "https://dappstorecontent.com/fresh-id"
    );
    expect(uploadCalls).toBe(1);

    const persistedManifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, manifestPath), "utf-8")
    );
    expect(persistedManifest.schema_version).toBe("0.1");
    expect(persistedManifest.assets[file.fileName].uri).toBe(
      "https://dappstorecontent.com/fresh-id"
    );
  });

  test("normalizes inline metadata uploads without caching them", async () => {
    const file = makeMetaplexFile("inline.json", Buffer.from("{}"));
    let uploadCalls = 0;
    const storageDriver: MockStorageDriver = {
      getUploadPrice: async (_bytes: number) => {
        throw new Error("getUploadPrice should not be called in this test");
      },
      upload: async (_file: MetaplexFile) => {
        uploadCalls += 1;
        return "https://arweave.net/metadata-id";
      },
    };

    const driver = new CachedStorageDriver(storageDriver as StorageDriver, {
      assetManifestPath: ".asset-manifest.json",
    });

    await expect(driver.upload(file)).resolves.toBe(
      "https://dappstorecontent.com/metadata-id"
    );
    expect(uploadCalls).toBe(1);
    expect(fs.existsSync(path.join(tempDir, ".asset-manifest.json"))).toBe(
      false
    );
  });

  test("returns a normalized cached URL even when manifest rewrite persistence fails", async () => {
    const file = makeMetaplexFile("icon.png", Buffer.from("cached-asset"));
    const hash = hashBuffer(file.buffer);
    const manifestPath = ".asset-manifest.json";

    fs.writeFileSync(
      path.join(tempDir, manifestPath),
      JSON.stringify(
        {
          assets: {
            [file.fileName]: {
              path: file.fileName,
              sha256: hash,
              uri: "https://arweave.net/rewrite-failure-id",
            },
          },
        },
        null,
        2
      )
    );

    const writeFileSpy = jest
      .spyOn(fs.promises, "writeFile")
      .mockRejectedValueOnce(new Error("disk full"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const storageDriver: MockStorageDriver = {
      getUploadPrice: async (_bytes: number) => {
        throw new Error("getUploadPrice should not be called in this test");
      },
      upload: async (_file: MetaplexFile) => {
        throw new Error("upload should not be called in this test");
      },
    };

    const driver = new CachedStorageDriver(storageDriver as StorageDriver, {
      assetManifestPath: manifestPath,
    });

    try {
      await expect(driver.upload(file)).resolves.toBe(
        "https://dappstorecontent.com/rewrite-failure-id"
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to rewrite .asset-manifest.json; continuing with normalized URL"
        )
      );
    } finally {
      writeFileSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

const makeMetaplexFile = (fileName: string, buffer: Buffer): MetaplexFile =>
  ({
    fileName,
    buffer,
  }) as MetaplexFile;

const hashBuffer = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("base64");
