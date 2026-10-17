import {
  createPublicationWorkflow,
  type PublicationResumeInput,
  type PublicationWorkflowClient,
  type PublicationWorkflowInput,
  type PublicationWorkflowOptions,
} from '../portal/workflow.js';
import type { PublicationWorkflowResult } from '../portal/types.js';

export type PublicationMode = 'new-version' | 'resume';

export type PublicationWorkflowRequest =
  | {
      mode: 'new-version';
      client: PublicationWorkflowClient;
      input: PublicationWorkflowInput;
      options?: PublicationWorkflowOptions;
    }
  | {
      mode: 'resume';
      client: PublicationWorkflowClient;
      input: PublicationResumeInput;
      options?: PublicationWorkflowOptions;
    };

export async function runPublicationWorkflow(
  request: PublicationWorkflowRequest,
): Promise<PublicationWorkflowResult> {
  const workflow = createPublicationWorkflow(request.client, request.options);

  if (request.mode === 'new-version') {
    return await workflow.startPublication(request.input);
  }

  return await workflow.resumePublication(request.input);
}
