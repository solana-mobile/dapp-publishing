import { Keypair } from "@solana/web3.js";
import fs from "fs";

export const parseKeypair = (pathToKeypairFile: string) => {
  const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
};
