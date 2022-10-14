import { Metaplex, Signer } from "@metaplex-foundation/js";
import { PublicKey } from "@solana/web3.js";

export type Context = {
  metaplex: Metaplex;
  publisher: Signer;
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
