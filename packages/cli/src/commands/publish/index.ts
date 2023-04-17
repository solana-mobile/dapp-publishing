export * from "./PublishCliRemove.js";
export * from "./PublishCliSubmit.js";
export * from "./PublishCliSupport.js";
export * from "./PublishCliUpdate.js";

/*
 * Module responsible for submitting requests to the Solana dApp Store publisher portal
 * Anything that is out-of-order will be prompted back into order
 * And steps that happen more than once will do their best to remember as much information as possible.
 * We will ask questions and do our best to answer anything that's already been configured, and prompt for anything that's not
 */

// We'll never ask for private keys or seed phrases
// You must use the same signer(s) when submitting requests to the publisher portal as was used to publish
// your app on-chain.

// The Solana Mobile dApp publisher portal supports 4 different requests: `submit`, `update`, `remove`, and `support`.
// Each request includes:
// - a 32-digit randomly generated unique identifier
// - an attestation payload, signed with the private key of the dApp collection update authority
// - the dApp release NFT address
// - contact and company information for the requestor
// - a self-attestation that the requestor is authorized to make this request
// - additional fields, specific to the request type in question

// We'll attempt to read as much as possible from a provided `.yml` file
// If there are provided folders that are well-structured, we'll opt to use that too.

// Requests and responses are logged to the console, to facilitate use in an automated CI/CD environment.
