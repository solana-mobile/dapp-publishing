import Ajv from "ajv";
import { PublisherJsonMetadata } from "../create-publisher";
import publisherSchema from "./schemas/publisher.json";

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
