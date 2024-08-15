import axios, { AxiosRequestConfig } from "axios";

export const PORTAL_ID = "22812690";

export const CONTACT_OBJECT_ID = "0-1";
export const CONTACT_PROPERTY_COMPANY = "company"; // string
export const CONTACT_PROPERTY_EMAIL = "email"; // string
export const CONTACT_PROPERTY_WEBSITE = "website"; // string

export const TICKET_OBJECT_ID = "0-5";
export const TICKET_PROPERTY_CONTENT = "content"; // string
export const TICKET_PROPERTY_ATTESTATION_PAYLOAD = "attestation_payload"; // base64-encoded string
export const TICKET_PROPERTY_AUTHORIZED_REQUEST = "requestor_is_authorized_to_submit_this_request"; // boolean
export const TICKET_PROPERTY_CRITICAL_UPDATE = "critical_update"; // boolean
export const TICKET_PROPERTY_DAPP_COLLECTION_ACCOUNT_ADDRESS = "dapp_collection_account_address"; // base58-encoded string
export const TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS = "dapp_release_account_address"; // base58-encoded string
export const TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME = "google_play_store_package_name"; // string
export const TICKET_PROPERTY_POLICY_COMPLIANT = "complies_with_solana_dapp_store_policies"; // boolean
export const TICKET_PROPERTY_REQUEST_UNIQUE_ID = "request_unique_id"; // string (32 base-10 digits)
export const TICKET_PROPERTY_TESTING_INSTRUCTIONS = "testing_instructions"; // string
export const TICKET_PROPERTY_ALPHA_TEST = "alpha_test"; // boolean
export const TICKET_PROPERTY_ALPHA_TESTERS = "alpha_testers"; // string

export const FORM_SUBMIT = "1464247f-6804-46e1-8114-952f372daa81";
export const FORM_UPDATE = "87b4cbe7-957f-495c-a132-8b789678883d";
export const FORM_REMOVE = "913a4e44-ec90-4db6-8aa9-c49f29b569b9";
export const FORM_SUPPORT = "2961f018-6a4d-4e9d-8332-e219428c8cf2";

export const URL_FORM_SUBMIT = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_SUBMIT}`
export const URL_FORM_UPDATE = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_UPDATE}`
export const URL_FORM_REMOVE = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_REMOVE}`
export const URL_FORM_SUPPORT = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_SUPPORT}`

export const submitRequestToSolanaDappPublisherPortal = async (
  request: any,
  url: string,
  dryRun: boolean
) => {
  const config = {
    method: "POST",
    url: url,
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify(request),
  } as AxiosRequestConfig;

  if (!dryRun) {
    await axios(config)
      .then((response) => {
        const isAlphaObject = request.fields.find((obj: { objectTypeId: string, name: string; value: string}) => {
          return obj.name === TICKET_PROPERTY_ALPHA_TEST
        })

        if (isAlphaObject !== undefined && isAlphaObject.value) {
          const requestUniqueId = request.fields.find((obj: { objectTypeId: string, name: string; value: string}) => {
            return obj.name === TICKET_PROPERTY_REQUEST_UNIQUE_ID
          }).value
          console.log(
            `Your alpha submission has been received.\n` +
            `It will not be reviewed or published to users.\n` + 
            `Use nonce '${requestUniqueId}' to launch alpha app.\n` + 
            `This can only be used on devices for which the genesis token was listed in your 'config.yaml'`
          )
        } else {
          console.info(`dApp publisher portal response:`, response.data);
        }
      })
      .catch((error) => {
        if (error.response) {
          throw new Error(`Failed to submit request\nError status code: ${error.response.status}\nError message: ${error.response.data}`);
        } else if (error.request) {
          throw new Error(`Failed to submit request: ${error.request}`);
        } else {
          throw new Error(`Failed to submit request: ${error}`);
        }
      });
  } else {
    console.warn("Dry run, not actually sending request to dApp publisher portal");
  }
};
