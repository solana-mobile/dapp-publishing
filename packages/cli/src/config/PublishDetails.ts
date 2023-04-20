import type {
  App,
  Publisher,
  Release,
  SolanaMobileDappPublisherPortal
} from "@solana-mobile/dapp-store-publishing-tools";
import fs from "fs/promises";
import { load } from "js-yaml";

import Ajv from "ajv";

// eslint-disable-next-line require-extensions/require-extensions
import schemaJson from "../generated/config_schema.json" assert { type: "json" };

// TODO: Add version number return here
export interface PublishDetails {
  publisher: Publisher;
  app: App;
  release: Release;
  solana_mobile_dapp_publisher_portal: SolanaMobileDappPublisherPortal;
}

const ajv = new Ajv({ strictTuples: false });
const validate = ajv.compile(schemaJson);

export const loadPublishDetails = async (configPath: string) => {
  const configFile = await fs.readFile(configPath, "utf-8");

  const valid = validate(load(configFile) as object);

  if (!valid) {
    console.error(validate.errors);
    process.exit(1);
  }

  const config = load(configFile) as PublishDetails;
  return config;
};
