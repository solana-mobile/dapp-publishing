import type { Connection, Keypair } from "@solana/web3.js";
import { MetaplexFile } from "@metaplex-foundation/js";
// import { ReleaseJsonMetadata } from "./validate/generated";
// import exp = require("constants");

export * from "./validate/generated/index.js";

export type Context = {
  publisher: Keypair;
  connection: Connection;
};

export type Publisher = {
  address: string;
  name: string;
  website: string;
  email: string;
};

export type App = {
  name: string;
  address: string;
  publisherAddress: string;
  android_package: string;
  urls: {
    license_url: string;
    copyright_url: string;
    privacy_policy_url: string;
    website: string;
  };
};

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

export type Release = {
  address: string;
  version: string;
  appMintAddress: string;
  publisherMintAddress: string;
  media: ReleaseMedia[];
  files: ReleaseFile[];
  android_details: AndroidDetails;
  catalog: {
    [locale: string]: {
      name: string;
      short_description: string;
      long_description: string;
      new_in_version: string;
      saga_features_localized: string;
    };
  };
};

export type AndroidDetails = {
  android_package: string;
  min_sdk: number;
  version_code: number;
  permissions: string[];
  locales: string[];
};

export type ReleaseFile = {
  mime: string;
  purpose: string;
  path: string; // Intermediary value from yaml config
  uri: MetaplexFile;
  size: number;
  sha256: string;
};

export type ReleaseMedia = ReleaseFile & {
  width: number;
  height: number;
};

export type SolanaMobileDappPublisherPortal = {
  google_store_package: string;
  testing_instructions: string;
};
