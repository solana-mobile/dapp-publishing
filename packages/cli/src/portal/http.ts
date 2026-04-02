import {
  type PortalClientConfig,
  type PortalProcedureResult,
} from './types.js';
import { isRecord, readDeep } from './records.js';

function unwrapPortalResult<T>(
  result: PortalProcedureResult<T> | Record<string, unknown> | T,
  fallbackMessage: string,
): T {
  if (isRecord(result) && '_tag' in result) {
    const tagged = result as PortalProcedureResult<T>;
    if (tagged._tag === 'Left') {
      throw new Error(tagged.left.message || fallbackMessage);
    }

    return tagged.right;
  }

  return result as T;
}

export async function callPortalProcedure<T>(
  config: PortalClientConfig,
  procedure: string,
  input: unknown,
  method: 'query' | 'mutation' = 'mutation',
): Promise<T> {
  const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
  const url = new URL(`${baseUrl}/trpc/${procedure}`);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-api-key': config.apiKey,
  };

  let response: Response;
  if (method === 'query') {
    if (input !== undefined) {
      url.searchParams.set('input', JSON.stringify(input));
    }
    response = await fetch(url, {
      method: 'GET',
      headers,
    });
  } else {
    headers['content-type'] = 'application/json';
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: input === undefined ? undefined : JSON.stringify(input),
    });
  }

  const text = await response.text();
  let payload: unknown;

  try {
    payload = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    const preview =
      text.replace(/\s+/g, ' ').trim().slice(0, 180) || '[empty]';
    throw new Error(
      `Failed to parse portal response from ${procedure}: ${preview}`,
    );
  }

  const normalizedPayload =
    isRecord(payload) && '0' in payload
      ? (payload as Record<string, unknown>)['0']
      : payload;

  if (!response.ok) {
    if (isRecord(normalizedPayload)) {
      const error = readDeep(normalizedPayload, 'error.message');
      if (typeof error === 'string' && error.length > 0) {
        throw new Error(`${procedure}: ${error}`);
      }

      const nested = readDeep(normalizedPayload, 'result.data');
      if (isRecord(nested) && nested._tag === 'Left') {
        const left = nested as Extract<
          PortalProcedureResult<T>,
          { _tag: 'Left' }
        >;
        if (left.left.message) {
          throw new Error(`${procedure}: ${left.left.message}`);
        }
      }
    }

    throw new Error(
      `${procedure}: Portal request failed with status ${response.status}`,
    );
  }

  const result =
    readDeep(normalizedPayload, 'result.data') ??
    readDeep(normalizedPayload, 'result');
  return unwrapPortalResult(
    result as PortalProcedureResult<T> | Record<string, unknown> | T,
    `Portal request failed for ${procedure}`,
  );
}

function isRetryableCreateIngestionSessionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes(
      'failed to parse portal response from publication.createingestionsession',
    ) ||
    message.includes('gateway timeout') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('unexpected token <')
  );
}

export async function callCreateIngestionSessionWithRetry(
  config: PortalClientConfig,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callPortalProcedure<Record<string, unknown>>(
        config,
        'publication.createIngestionSession',
        input,
        'mutation',
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableCreateIngestionSessionError(error) || attempt === 2) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to create ingestion session');
}

export async function uploadBytes(
  uploadUrl: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
    },
    body,
  });

  if (!response.ok) {
    const preview = (await response.text()).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Failed to upload file to the portal: ${preview || response.statusText}`,
    );
  }
}
