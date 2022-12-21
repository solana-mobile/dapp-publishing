import fs from "fs";
import Ajv from "ajv";

import type {
  AppMetadata,
  MetaplexFileReleaseJsonMetadata,
  PublisherMetadata,
  ReleaseJsonMetadata
} from "../types.js";

// eslint-disable-next-line require-extensions/require-extensions
import publisherSchema from "./schemas/publisherJsonMetadata.json" assert { type: "json" };
// eslint-disable-next-line require-extensions/require-extensions
import appSchema from "./schemas/appJsonMetadata.json" assert { type: "json" };
// eslint-disable-next-line require-extensions/require-extensions
import releaseSchema from "./schemas/releaseJsonMetadata.json" assert { type: "json" };

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

  // We need to replace media MetaplexFile instances with strings for validation
  jsonToValidate.extensions.solana_dapp_store.media.forEach((media, index) => {
    if (typeof media.uri !== "string") {
      // @ts-ignore Ignoring hard type override from Metaplex to string
      jsonToValidate.extensions.solana_dapp_store.media[index].uri = media.uri.fileName;
    }
  });

  // We need to replace file MetaplexFile instances with strings for validation
  jsonToValidate.extensions.solana_dapp_store.files.forEach((file, index) => {
    if (typeof file.uri !== "string") {
      // @ts-ignore
      jsonToValidate.extensions.solana_dapp_store.files[index].uri = file.uri.fileName;
    }
  });

  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(releaseSchema);

  const valid = validate(jsonToValidate);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("Release JSON not valid");
  }
  return valid;
};
