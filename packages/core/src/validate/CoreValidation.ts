import Ajv from "ajv";

import type {
  AppMetadata,
  MetaplexFileReleaseJsonMetadata,
  PublisherMetadata,
} from "../types.js";

import { readFile } from 'fs/promises';
const publisherSchema = JSON.parse((await readFile(new URL("../schemas/publisherJsonMetadata.json", import.meta.url))).toString());
const appSchema = JSON.parse((await readFile(new URL("../schemas/appJsonMetadata.json", import.meta.url))).toString());
const releaseSchema = JSON.parse((await readFile(new URL("../schemas/releaseJsonMetadata.json", import.meta.url))).toString());
import { isMetaplexFile } from "@metaplex-foundation/js";

export const metaplexFileReplacer = (k: any, v: any) => {
  if (isMetaplexFile(v)) {
    return "https://temp-asset-path";
  }
  return v;
};

export const validatePublisher = (publisherJson: PublisherMetadata) => {
  const jsonToValidate = { ...publisherJson };
  if (typeof jsonToValidate.image !== "string") {
    jsonToValidate.image = jsonToValidate.image?.fileName;
  }

  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(publisherSchema);

  const valid = validate(jsonToValidate);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("Publisher JSON not valid");
  }
  return valid;
};

export const validateApp = (appJson: AppMetadata) => {
  const jsonToValidate = { ...appJson };
  if (typeof jsonToValidate.image !== "string") {
    jsonToValidate.image = jsonToValidate.image?.fileName;
  }

  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(appSchema);

  const valid = validate(jsonToValidate);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("App JSON not valid");
  }
  return valid;
};

export const validateRelease = (releaseJson: MetaplexFileReleaseJsonMetadata) => {
  const jsonToValidate = { ...releaseJson };
  if (typeof jsonToValidate.image !== "string") {
    jsonToValidate.image = jsonToValidate.image?.fileName;
  }

  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(releaseSchema);

  const valid = validate(jsonToValidate);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("Release JSON not valid");
  }
  return valid;
};
