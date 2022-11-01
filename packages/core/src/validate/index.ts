import Ajv from "ajv";
import publisherSchema from "./schemas/publisherJsonMetadata.json";
import appSchema from "./schemas/appJsonMetadata.json";
import releaseSchema from "./schemas/releaseJsonMetadata.json";
import type {
  AppJsonMetadata,
  PublisherJsonMetadata,
  ReleaseJsonMetadata,
} from "../types";

export const validatePublisher = (publisherJson: PublisherJsonMetadata) => {
  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(publisherSchema);

  const valid = validate(publisherJson);
  if (!valid) {
    console.error(validate.errors);
    throw new Error("Publisher JSON not valid");
  }
  return valid;
};

export const validateApp = (appJson: AppJsonMetadata) => {
  const ajv = new Ajv({ strictTuples: false });
  const validate = ajv.compile(appSchema);

  const valid = validate(appJson);
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
