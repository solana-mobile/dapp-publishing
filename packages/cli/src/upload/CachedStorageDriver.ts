import fs from "fs";
import path from "path";
import type { MetaplexFile, StorageDriver } from "@metaplex-foundation/js";
import { createHash } from "crypto";
import { normalizePublicContentUrl } from "./contentGateway.js";

type URI = string;

type Asset = {
  path: string;
  sha256: string;
  uri: URI;
};

export type AssetManifestSchema = {
  schema_version: string;
  assets: {
    [path: string]: Asset;
  };
};

// TODO(jon): We need to manage the removal / replacement of assets in the manifest
export class CachedStorageDriver implements StorageDriver {
  // NOTE: this schema version is independent of the publishing JSON schema. It should be updated
  // when the AssetManifestSchema or Asset types are updated.
  static readonly SCHEMA_VERSION = "0.1";

  assetManifest: AssetManifestSchema;
  assetManifestPath: string;
  storageDriver: StorageDriver;

  constructor(
    storageDriver: StorageDriver,
    { assetManifestPath }: { assetManifestPath: string }
  ) {
    this.assetManifestPath = assetManifestPath;
    this.assetManifest = this.loadAssetManifest(assetManifestPath) ?? {
      schema_version: CachedStorageDriver.SCHEMA_VERSION,
      assets: {},
    };
    this.storageDriver = storageDriver;
  }

  async getUploadPrice(bytes: number) {
    return this.storageDriver.getUploadPrice(bytes);
  }

  private resolveAssetManifestPath(): string {
    return path.join(process.cwd(), this.assetManifestPath);
  }

  private normalizeAsset(
    filename: string,
    asset: unknown
  ): Asset | undefined {
    if (!asset || typeof asset !== "object") return;

    const candidate = asset as Partial<Asset>;
    const pathValue =
      typeof candidate.path === "string" ? candidate.path : filename;

    if (
      typeof candidate.sha256 !== "string" ||
      typeof candidate.uri !== "string"
    ) {
      return;
    }

    return {
      path: pathValue,
      sha256: candidate.sha256,
      uri: candidate.uri,
    };
  }

  private normalizeAssetManifest(
    assetManifest: Partial<AssetManifestSchema> | undefined
  ): AssetManifestSchema | undefined {
    if (!assetManifest || typeof assetManifest !== "object") return;

    const assets: Record<string, Asset> = {};
    const assetEntries =
      assetManifest.assets && typeof assetManifest.assets === "object"
        ? Object.entries(assetManifest.assets)
        : [];

    for (const [filename, asset] of assetEntries) {
      const normalizedAsset = this.normalizeAsset(filename, asset);
      if (normalizedAsset) {
        assets[filename] = normalizedAsset;
      }
    }

    return {
      schema_version:
        typeof assetManifest.schema_version === "string"
          ? assetManifest.schema_version
          : CachedStorageDriver.SCHEMA_VERSION,
      assets,
    };
  }

  private async writeAssetManifest(): Promise<void> {
    const normalizedAssetManifest = this.normalizeAssetManifest(
      this.assetManifest
    );

    if (!normalizedAssetManifest) {
      throw new Error("Asset manifest is not serializable");
    }

    this.assetManifest = normalizedAssetManifest;
    await fs.promises.writeFile(
      this.resolveAssetManifestPath(),
      JSON.stringify(this.assetManifest, null, 2),
      "utf-8"
    );
  }

  loadAssetManifest(filename: string): AssetManifestSchema | undefined {
    try {
      return this.normalizeAssetManifest(
        JSON.parse(fs.readFileSync(this.resolveAssetManifestPath(), "utf-8"))
      );
    } catch (error) {
      console.warn(`Failed opening ${filename}; initializing with a blank asset manifest`);
      return;
    }
  }

  uploadedAsset(filename: string, { sha256 }: { sha256: string }) {
    if (this.assetManifest.assets[filename]?.sha256 === sha256) {
      return this.assetManifest.assets[filename];
    }
    return null;
  }

  async upload(file: MetaplexFile): Promise<string> {
    // `inline.json` is the NFT-related metadata. This data is not stable so we'll skip the caching step
    if (file.fileName === "inline.json") {
      return normalizePublicContentUrl(await this.storageDriver.upload(file));
    }
    const hash = createHash("sha256").update(file.buffer).digest("base64");

    const uploadedAsset = this.uploadedAsset(file.fileName, { sha256: hash });
    if (uploadedAsset) {
      const normalizedUri = normalizePublicContentUrl(uploadedAsset.uri);
      if (normalizedUri !== uploadedAsset.uri) {
        uploadedAsset.uri = normalizedUri;
        await this.writeAssetManifest();
      }
      console.log(
        `Asset ${file.fileName} already uploaded at ${normalizedUri}`
      );
      return normalizedUri;
    }

    console.log(`Uploading ${file.fileName}`);
    const uri = normalizePublicContentUrl(await this.storageDriver.upload(file));

    this.assetManifest.assets[file.fileName] = {
      path: file.fileName,
      sha256: hash,
      uri,
    };

    await this.writeAssetManifest();
    console.log(`${file.fileName} uploaded at ${uri}`)

    return uri;
  }
}
