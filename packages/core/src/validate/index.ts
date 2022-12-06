import { MetaplexFile } from "@metaplex-foundation/js";

import Ajv from "ajv";
// eslint-disable-next-line require-extensions/require-extensions
import publisherSchema from "./schemas/publisherJsonMetadata.json";
// eslint-disable-next-line require-extensions/require-extensions
import appSchema from "./schemas/appJsonMetadata.json";
// eslint-disable-next-line require-extensions/require-extensions
import releaseSchema from "./schemas/releaseJsonMetadata.json";

import type {
  AppMetadata,
  PublisherMetadata,
  ReleaseJsonMetadata,
} from "../types.js";

export const validatePublisher = (publisherJson: PublisherMetadata) => {
  const jsonToValidate = { ...publisherJson };
  if (typeof jsonToValidate.image !== "string") {
    jsonToValidate.image = jsonToValidate.image.fileName;
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
    jsonToValidate.image = jsonToValidate.image.fileName;
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

export const validateRelease = (releaseJson: ReleaseJsonMetadata) => {
  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(releaseSchema);

  const valid = validate(releaseJson);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("Release JSON not valid");
  }
  return valid;
};
