import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

import { createPortalWorkflowClient } from "../workflowClient.js";

function createProcedureResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result: { data: result } }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

let originalFetch: typeof fetch;
let fetchMock: jest.MockedFunction<typeof fetch>;
const tempDirs: string[] = [];

beforeEach(() => {
  originalFetch = global.fetch;
  fetchMock = jest.fn<typeof fetch>();
  global.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

test("createIngestionSession maps apk-url sources to the portal externalUrl API shape", async () => {
  fetchMock.mockResolvedValueOnce(
    createProcedureResponse({
      id: "ingestion-1",
      dappId: "dapp-1",
      idempotencyKey: "idem-1",
      status: "Created",
      sourceKind: "externalUrl",
      sourceUrl: "https://downloads.example.com/releases/app-release.apk",
      releaseFileName: "app-release.apk",
      releaseFileSize: 10,
      releaseId: "release-1",
      publicationSessionId: "session-1",
      bundle: {
        release: {
          id: "release-1",
          releaseFileName: "app-release.apk",
          versionCode: 42,
          versionName: "42",
          androidPackage: "com.example.app",
          localizedName: "Example App",
          newInVersion: "Fixes",
        },
        dapp: {
          id: "dapp-1",
          dappName: "Example App",
          description: "A dApp",
          walletAddress: "wallet-1",
          androidPackage: "com.example.app",
        },
        publisher: {
          id: "publisher-1",
          type: "organization",
          name: "Example Publisher",
          website: "https://example.com",
          email: "team@example.com",
        },
        installFile: {
          uri: "https://downloads.example.com/releases/app-release.apk",
          size: 10,
        },
        signerAuthority: {
          dappWalletAddress: "wallet-1",
          collectionAuthority: "wallet-1",
        },
      },
      publicationSession: {
        id: "session-1",
        releaseId: "release-1",
        stage: "PreparedForMint",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    })
  );

  const client = createPortalWorkflowClient({
    apiBaseUrl: "https://portal.example.com/api",
    apiKey: "portal-key",
  });

  const result = await client.createIngestionSession({
    source: {
      kind: "apk-url",
      url: "https://downloads.example.com/releases/app-release.apk",
    },
    whatsNew: "Fixes",
    idempotencyKey: "idem-1",
  });

  const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
  const requestBody = JSON.parse(String(requestInit?.body));

  expect(String(requestUrl)).toContain(
    "/trpc/publication.createIngestionSession"
  );
  expect(requestInit?.method).toBe("POST");
  expect(requestBody).toMatchObject({
    source: {
      kind: "externalUrl",
      apkUrl: "https://downloads.example.com/releases/app-release.apk",
      releaseFileName: "app-release.apk",
    },
    whatsNew: "Fixes",
    idempotencyKey: "idem-1",
  });
  expect(result.source.kind).toBe("apk-url");
  expect(result.bundle?.metadata?.installFile.origin).toBe("external");
  expect(result.publicationSession?.checkpoint).toBe("bundle-ready");
});

test("createIngestionSession uploads local APK files before creating the ingestion session", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dapp-store-apk-"));
  const apkPath = path.join(tempDir, "release-build");
  tempDirs.push(tempDir);
  fs.writeFileSync(apkPath, Buffer.from("apk-binary"));

  fetchMock
    .mockResolvedValueOnce(
      createProcedureResponse({
        uploadUrl: "https://uploads.example.com/app.apk",
        key: "upload-key",
        providerId: "provider-1",
        publicUrl: "https://cdn.example.com/app.apk",
      })
    )
    .mockResolvedValueOnce(new Response("", { status: 200 }))
    .mockResolvedValueOnce(
      createProcedureResponse({
        id: "ingestion-2",
        dappId: "dapp-1",
        idempotencyKey: "idem-2",
        status: "Created",
        sourceKind: "portalUpload",
        sourceUrl: "https://cdn.example.com/app.apk",
        releaseFileName: "release-build.apk",
        releaseFileSize: 10,
        releaseId: "release-2",
        publicationSessionId: "session-2",
        bundle: {
          release: {
            id: "release-2",
            releaseFileName: "release-build.apk",
            releaseFileUrl: "https://cdn.example.com/app.apk",
            versionCode: 7,
            versionName: "7",
            androidPackage: "com.example.app",
            localizedName: "Example App",
            newInVersion: "Local upload",
          },
          dapp: {
            id: "dapp-1",
            dappName: "Example App",
            description: "A dApp",
            walletAddress: "wallet-1",
            androidPackage: "com.example.app",
          },
          publisher: {
            id: "publisher-1",
            type: "organization",
            name: "Example Publisher",
            website: "https://example.com",
            email: "team@example.com",
          },
          installFile: {
            uri: "https://cdn.example.com/app.apk",
            size: 10,
          },
          signerAuthority: {
            dappWalletAddress: "wallet-1",
            collectionAuthority: "wallet-1",
          },
        },
        publicationSession: {
          id: "session-2",
          releaseId: "release-2",
          stage: "PreparedForMint",
          created: "2024-01-01T00:00:00.000Z",
          updated: "2024-01-01T00:00:00.000Z",
        },
      })
    );

  const client = createPortalWorkflowClient({
    apiBaseUrl: "https://portal.example.com/api",
    apiKey: "portal-key",
  });

  const result = await client.createIngestionSession({
    source: {
      kind: "apk-file",
      filePath: apkPath,
    },
    whatsNew: "Local upload",
    idempotencyKey: "idem-2",
  });

  const [uploadTargetUrl, uploadTargetInit] = fetchMock.mock.calls[0]!;
  const uploadTargetBody = JSON.parse(String(uploadTargetInit?.body));
  expect(String(uploadTargetUrl)).toContain(
    "/trpc/publication.createUploadTarget"
  );
  expect(uploadTargetBody).toMatchObject({
    fileExtension: "apk",
    contentType: "application/vnd.android.package-archive",
  });

  const [uploadUrl, uploadInit] = fetchMock.mock.calls[1]!;
  expect(String(uploadUrl)).toBe("https://uploads.example.com/app.apk");
  expect(uploadInit?.method).toBe("PUT");
  expect(Buffer.from(uploadInit?.body as Uint8Array).toString()).toBe(
    "apk-binary"
  );

  const [ingestionUrl, ingestionInit] = fetchMock.mock.calls[2]!;
  const ingestionBody = JSON.parse(String(ingestionInit?.body));
  expect(String(ingestionUrl)).toContain(
    "/trpc/publication.createIngestionSession"
  );
  expect(ingestionBody).toMatchObject({
    source: {
      kind: "portalUpload",
      releaseFileUrl: "https://cdn.example.com/app.apk",
      releaseFileName: "release-build.apk",
      releaseFileSize: 10,
    },
    whatsNew: "Local upload",
    idempotencyKey: "idem-2",
  });

  expect(result.source.kind).toBe("apk-file");
  expect(result.bundle?.metadata?.installFile.origin).toBe("portal");
  expect(result.releaseId).toBe("release-2");
  expect(result.publicationSessionId).toBe("session-2");
});
