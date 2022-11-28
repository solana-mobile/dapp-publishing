import { Connection, Keypair } from "@solana/web3.js";
import type { Publisher } from "@solana-mobile/dapp-publishing-tools";
import { createAttestationPayload } from "./attestation.js";
import {
  CONTACT_OBJECT_ID,
  CONTACT_PROPERTY_COMPANY,
  CONTACT_PROPERTY_EMAIL,
  CONTACT_PROPERTY_WEBSITE,
  submitRequestToSolanaDappPublisherPortal,
  TICKET_OBJECT_ID,
  TICKET_PROPERTY_ATTESTATION_PAYLOAD,
  TICKET_PROPERTY_AUTHORIZED_REQUEST,
  TICKET_PROPERTY_CRITICAL_UPDATE,
  TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS,
  TICKET_PROPERTY_REQUEST_UNIQUE_ID,
  URL_FORM_REMOVE
} from "./dapp_publisher_portal.js";
import { getConfigFile } from "../../utils.js";

const createRemoveRequest = async (
  connection: Connection,
  releaseMintAddress: string,
  publisher: Keypair,
  publisherDetails: Publisher,
  requestorIsAuthorized: boolean,
  criticalUpdate: boolean
) => {
  const { attestationPayload, requestUniqueId } = await createAttestationPayload(connection, publisher);

  const request = {
    fields: [
      {
        objectTypeId: CONTACT_OBJECT_ID,
        name: CONTACT_PROPERTY_COMPANY,
        value: publisherDetails.name
      },
      {
        objectTypeId: CONTACT_OBJECT_ID,
        name: CONTACT_PROPERTY_EMAIL,
        value: publisherDetails.email
      },
      {
        objectTypeId: CONTACT_OBJECT_ID,
        name: CONTACT_PROPERTY_WEBSITE,
        value: publisherDetails.website
      },
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_ATTESTATION_PAYLOAD,
        value: attestationPayload
      },
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS,
        value: releaseMintAddress
      },
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_REQUEST_UNIQUE_ID,
        value: requestUniqueId
      },
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_AUTHORIZED_REQUEST,
        value: requestorIsAuthorized
      },
    ]
  };

  if (criticalUpdate) {
    request.fields.push(
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_CRITICAL_UPDATE,
        value: criticalUpdate
      }
    );
  }

  return request;
};

type PublishRemoveCommandInput = {
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  requestorIsAuthorized: boolean;
  critical: boolean;
};

export const publishRemoveCommand = async ({
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  requestorIsAuthorized = false,
  critical = false
}: PublishRemoveCommandInput) => {
  if (!requestorIsAuthorized) {
    console.error("ERROR: Cannot submit a request for which the requestor does not attest they are authorized to do so");
    return;
  }

  const connection = new Connection(url);
  const { publisher: publisherDetails } = await getConfigFile();

  const removeRequest = await createRemoveRequest(
    connection,
    releaseMintAddress,
    signer,
    publisherDetails,
    requestorIsAuthorized,
    critical);

  submitRequestToSolanaDappPublisherPortal(removeRequest, URL_FORM_REMOVE, dryRun);
};