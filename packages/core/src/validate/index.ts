import Ajv from "ajv";
import { AppJsonMetadata } from "../create-app";
import { PublisherJsonMetadata } from "../create-publisher";
import publisherSchema from "./schemas/publisher.json";
import appSchema from "./schemas/app.json";

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
