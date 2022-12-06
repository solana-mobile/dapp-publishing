import type { App, Publisher, Release, SolanaMobileDappPublisherPortal } from "@solana-mobile/dapp-publishing-tools";
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import debugModule from "debug";
import { dump, load } from "js-yaml";
import * as util from "util";
import { exec } from "child_process";

const runExec = util.promisify(exec);

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

// TODO: Add version number return here
interface CLIConfig {
  publisher: Publisher;
  app: App;
  release: Release;
  solana_mobile_dapp_publisher_portal: SolanaMobileDappPublisherPortal;
}

export const getConfigFile = async (
  buildToolsDir: string | null = null
): Promise<CLIConfig> => {
  const configFilePath = `${process.cwd()}/config.yaml`;
  const configFile = fs.readFileSync(configFilePath, "utf-8");

  console.info(`Pulling details from ${configFilePath}`);

  // TODO(jon): Verify the contents of the YAML file
  return load(configFile) as CLIConfig;
};

type SaveToConfigArgs = {
  publisher?: Pick<Publisher, "address">;
  app?: Pick<App, "address">;
  release?: Pick<Release, "address" | "version">;
};

export const saveToConfig = async ({ publisher, app, release }: SaveToConfigArgs) => {
  const currentConfig = await getConfigFile();

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
    solana_mobile_dapp_publisher_portal: currentConfig.solana_mobile_dapp_publisher_portal,
  };

  // TODO(jon): Verify the contents of the YAML file
  fs.writeFileSync(`${process.cwd()}/config.yaml`, dump(newConfig));
};
