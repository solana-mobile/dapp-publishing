import type { Connection, Keypair } from "@solana/web3.js";
import { ReleaseJsonMetadata } from "./validate/generated/releaseJsonMetadata.js";

export * from "./validate/generated/index.js";

export type Context = {
  publisher: Keypair;
  connection: Connection;
};

type AndroidDetails = {
  android_package: string;
  google_store_package: string;
  min_sdk: number;
  version_code: number;
  permissions: (
    | "android.permission.INTERNET"
    | "android.permission.LOCATION_HARDWARE"
    | "com.solanamobile.seedvault.ACCESS_SEED_VAULT"
  )[];
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
  description: {
    "en-US": string;
  };
  urls: {
    license_url: string;
    copyright_url: string;
    privacy_policy_url: string;
    website: string;
  };
  android_details: AndroidDetails;
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
    };
  };
};
