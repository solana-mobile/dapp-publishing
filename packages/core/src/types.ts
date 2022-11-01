import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export type Context = {
  publisher: Keypair;
  connection: Connection;
};

export type Publisher = {
  address: PublicKey;
};

export type App = {
  address: PublicKey;
  publisherAddress: PublicKey;
};

export type Release = {
  address: PublicKey;
  appAddress: PublicKey;
  publisherAddress: PublicKey;
};
