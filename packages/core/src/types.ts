import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export type Context = {
  publisher: Keypair;
  connection: Connection;
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
  age_rating: string;
  android_details: {
    android_package: string;
    google_store_package: string;
    min_sdk: number;
    version_code: number;
    permissions: (
      | "android.permission.INTERNET"
      | "android.permission.LOCATION_HARDWARE"
      | "com.solanamobile.seedvault.ACCESS_SEED_VAULT"
    )[];
  };
};

export type Release = {
  address: PublicKey;
  appAddress: PublicKey;
  publisherAddress: PublicKey;
};
