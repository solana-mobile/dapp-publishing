import { Keypair } from "@solana/web3.js";
import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";

import type {
  App,
  Publisher,
  Release,
} from "@solana-mobile/dapp-publishing-tools";

export const debug = debugModule("CLI");

export const parseKeypair = (pathToKeypairFile: string) => {
  try {
    const keypairFile = fs.readFileSync(pathToKeypairFile, "utf-8");
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairFile)));
  } catch (e) {
    console.error(
      `Something went wrong when attempting to retrieve the keypair at ${pathToKeypairFile}`
    );
  }
};

interface CLIConfig {
  publisher: Publisher;
  app: App;
  release: Release;
}

export const getConfigFile = (): CLIConfig => {
  const configFilePath = `${process.cwd()}/dapp-store/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");
  console.info(`Pulling details from ${configFilePath}`);

  const config = load(configFile) as CLIConfig;
  // TODO(jon): Verify the contents of the YAML file
  return config;
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address" | "version">;
};

export const saveToConfig = ({ publisher, app, release }: SaveToConfigArgs) => {
  const currentConfig = getConfigFile();

  const newConfig: CLIConfig = {
    publisher: {
      ...currentConfig.publisher,
      address: publisher?.address ?? currentConfig.publisher.address,
    },
    app: {
      ...currentConfig.app,
      address: app?.address ?? currentConfig.app.address,
    },
    release: {
      ...currentConfig.release,
      address: release?.address ?? currentConfig.release.address,
      version: release?.version ?? currentConfig.release.version,
    },
  };

  // TODO(jon): Verify the contents of the YAML file
  fs.writeFileSync(`${process.cwd()}/dapp-store/config.yaml`, dump(newConfig));
};
