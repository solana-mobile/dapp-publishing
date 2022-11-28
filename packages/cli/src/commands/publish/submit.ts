import { Connection, Keypair } from "@solana/web3.js";
import type { Publisher, SolanaMobileDappPublisherPortal } from "@solana-mobile/dapp-publishing-tools";
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
  TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS,
  TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME,
  TICKET_PROPERTY_POLICY_COMPLIANT,
  TICKET_PROPERTY_REQUEST_UNIQUE_ID,
  TICKET_PROPERTY_TESTING_INSTRUCTIONS,
  URL_FORM_SUBMIT
} from "./dapp_publisher_portal.js";
import { getConfigFile } from "../../utils.js";

const createSubmitRequest = async (
  connection: Connection,
  releaseMintAddress: string,
  publisher: Keypair,
  publisherDetails: Publisher,
  solanaMobileDappPublisherPortalDetails: SolanaMobileDappPublisherPortal,
  compliesWithSolanaDappStorePolicies: boolean,
  requestorIsAuthorized: boolean
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
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_POLICY_COMPLIANT,
        value: compliesWithSolanaDappStorePolicies
      }
    ]
  };

  if (solanaMobileDappPublisherPortalDetails.google_store_package != undefined) {
    request.fields.push({
      objectTypeId: TICKET_OBJECT_ID,
      name: TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME,
      value: solanaMobileDappPublisherPortalDetails.google_store_package
    });
  }

  if (solanaMobileDappPublisherPortalDetails.testing_instructions != undefined) {
    request.fields.push(
      {
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_TESTING_INSTRUCTIONS,
        value: solanaMobileDappPublisherPortalDetails.testing_instructions
      },
    );
  }

  return request;
};

type PublishSubmitCommandInput = {
  releaseMintAddress: string;
  signer: Keypair;
  url: string;
  dryRun: boolean;
  compliesWithSolanaDappStorePolicies: boolean;
  requestorIsAuthorized: boolean;
};

export const publishSubmitCommand = async ({
  releaseMintAddress,
  signer,
  url,
  dryRun = false,
  compliesWithSolanaDappStorePolicies = false,
  requestorIsAuthorized = false
}: PublishSubmitCommandInput) => {
  if (!compliesWithSolanaDappStorePolicies) {
    console.error("ERROR: Cannot submit a request for which the requestor does not attest that it complies with Solana dApp Store policies");
    return;
  } else if (!requestorIsAuthorized) {
    console.error("ERROR: Cannot submit a request for which the requestor does not attest they are authorized to do so");
    return;
  }

  const connection = new Connection(url);
  const {
    publisher: publisherDetails,
    solana_mobile_dapp_publisher_portal: solanaMobileDappPublisherPortalDetails
  } = await getConfigFile();

  const submitRequest = await createSubmitRequest(
    connection,
    releaseMintAddress,
    signer,
    publisherDetails,
    solanaMobileDappPublisherPortalDetails,
    compliesWithSolanaDappStorePolicies,
    requestorIsAuthorized);

  submitRequestToSolanaDappPublisherPortal(submitRequest, URL_FORM_SUBMIT, dryRun);
};
