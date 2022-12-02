import type { Connection, Keypair } from "@solana/web3.js";
import { ReleaseJsonMetadata } from "./validate/generated";

export * from "./validate/generated/index.js";

export type Context = {
  publisher: Keypair;
  connection: Connection;
};

export type AndroidDetails = {
  android_package: string;
  min_sdk: number;
  version_code: number;
  permissions: string[];
  locales: string[];
};

export type Publisher = {
  address: string;
  name: string;
  description: {
    "en-US": string;
  };
  website: string;
  email: string;
};

export type App = {
  name: string;
  address: string;
  publisherAddress: string;
  android_package: string;
  description: {
    "en-US": string;
  };
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
  media: ReleaseJsonMetadata["extensions"]["solana_dapp_store"]["media"];
  files: ReleaseJsonMetadata["extensions"]["solana_dapp_store"]["files"];
  android_details: AndroidDetails;
  localized_resources: {
    [locale: string]: {
      short_description: string;
      long_description: string;
      new_in_version: string;
      saga_features_localized: string;
    };
  };
};
