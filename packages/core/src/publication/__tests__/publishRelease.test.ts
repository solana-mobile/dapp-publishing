import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, jest } from "@jest/globals";

import { PublishingError } from "../../errors.js";
import {
  createPortalClient,
  publishRelease,
  resumeRelease,
} from "../publishRelease.js";

type RecordedRequest = { url: string; method: string; body: string };

function trpcResponse(data: unknown) {
  return new Response(JSON.stringify({ result: { data } }), { status: 200 });
}

function createRecordingPortal(responses: Record<string, unknown>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    requests.push({
      url: href,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });

    const procedure = href.match(/\/trpc\/([^?]+)/)?.[1];
    if (!procedure) {
      for await (const _chunk of init?.body as AsyncIterable<unknown>) {
        // Drain the streamed APK upload.
      }
      return new Response(null, { status: 200 });
    }
    if (!(procedure in responses)) {
      throw new Error(`Unexpected portal procedure: ${procedure}`);
    }
    const response = responses[procedure];
    if (typeof response !== "function") {
      return trpcResponse(response);
    }
    const next = response();
    return next instanceof Response ? next : trpcResponse(next);
  };

  const procedures = () =>
    requests
      .map(({ url }) => url.match(/\/trpc\/([^?]+)/)?.[1])
      .filter((procedure): procedure is string => Boolean(procedure));

  return { fetch: fetchMock as typeof fetch, requests, procedures };
}

const portalResponses = {
  "publication.createUploadTarget": {
    uploadUrl: "https://uploads.example.com/staging/app.apk",
    key: "releases/app.apk",
    providerId: "r2",
    publicUrl: "https://cdn.example.com/releases/app.apk",
    stagingKey: "staging/app.apk",
  },
  "publication.finalizeUpload": {
    key: "releases/app.apk",
    providerId: "r2",
    publicUrl: "https://cdn.example.com/releases/app.apk",
    reused: false,
  },
  "publication.createIngestionSession": {
    id: "ingestion-1",
    status: "Processing",
  },
  "publication.getIngestionSession": {
    id: "ingestion-1",
    status: "Ready",
    releaseId: "release-1",
    publicationSessionId: "session-1",
    androidPackage: "com.example.app",
    versionName: "1.2.3",
  },
  "publication.getPublicationSession": {
    id: "session-1",
    releaseId: "release-1",
    ingestionSessionId: "ingestion-1",
    stage: "PreparedForMint",
  },
  "publication.submitToStore": {
    success: true,
    hubspotTicketId: "ticket-1",
    message: "Submitted",
  },
};

describe("createPortalClient", () => {
  it("derives the API URL from portalUrl and uses the injected fetch", async () => {
    const fetchMock = jest.fn(async (_url: unknown, _init?: unknown) =>
      trpcResponse({ id: "session-1", releaseId: "release-1" })
    );
    const client = createPortalClient({
      apiKey: "secret",
      portalUrl: "https://portal.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.getPublicationSession({ publicationSessionId: "session-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/portal\.example\.com\/api\/trpc\/publication\.getPublicationSession/
    );
    expect((init as RequestInit).headers).toMatchObject({
      "x-api-key": "secret",
    });
  });

  it("rejects non-HTTPS portal URLs with a typed error", () => {
    expect(() =>
      createPortalClient({
        apiKey: "secret",
        portalUrl: "http://portal.example.com",
      })
    ).toThrow(PublishingError);
  });
});

describe("publishRelease", () => {
  it("uploads the APK, waits for ingestion, and submits to the store", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-release-"));
    const apkPath = path.join(tempDir, "app.apk");
    fs.writeFileSync(apkPath, "apk-bytes");
    const portal = createRecordingPortal(portalResponses);

    try {
      const result = await publishRelease({
        client: createPortalClient({
          apiKey: "secret",
          portalUrl: "https://portal.example.com",
          fetch: portal.fetch,
        }),
        source: { kind: "apk-file", filePath: apkPath, fileName: "app.apk" },
        whatsNew: "Fixes",
        idempotencyKey: "key-1",
      });

      expect(portal.procedures()).toEqual([
        "publication.createUploadTarget",
        "publication.finalizeUpload",
        "publication.createIngestionSession",
        "publication.getIngestionSession",
        "publication.getPublicationSession",
        "publication.submitToStore",
      ]);
      expect(portal.requests).toHaveLength(7);
      expect(JSON.parse(portal.requests.at(-1)?.body ?? "")).toEqual({
        releaseId: "release-1",
        whatsNew: "Fixes",
      });
      expect(result).toMatchObject({
        releaseId: "release-1",
        publicationSessionId: "session-1",
        ingestionSessionId: "ingestion-1",
        hubspotTicketId: "ticket-1",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("resumeRelease", () => {
  it("logs the app and version, then submits the stored release", async () => {
    const portal = createRecordingPortal(portalResponses);
    const info = jest.fn();

    await resumeRelease({
      client: createPortalClient({
        apiKey: "secret",
        portalUrl: "https://portal.example.com",
        fetch: portal.fetch,
      }),
      releaseId: "release-1",
      logger: { info },
    });

    expect(portal.procedures()).toEqual([
      "publication.getPublicationSession",
      "publication.getIngestionSession",
      "publication.submitToStore",
    ]);
    expect(info).toHaveBeenCalledWith(
      "Release details loaded",
      expect.objectContaining({
        androidPackage: "com.example.app",
        versionName: "1.2.3",
      })
    );
    expect(JSON.parse(portal.requests.at(-1)?.body ?? "")).toEqual({
      releaseId: "release-1",
    });
  });

  it("skips submission when the portal already recorded it", async () => {
    const portal = createRecordingPortal({
      ...portalResponses,
      "publication.getPublicationSession": {
        ...portalResponses["publication.getPublicationSession"],
        stage: "Submitted",
        hubspotTicketId: "ticket-1",
      },
    });

    const result = await resumeRelease({
      client: createPortalClient({
        apiKey: "secret",
        portalUrl: "https://portal.example.com",
        fetch: portal.fetch,
      }),
      sessionId: "session-1",
    });

    expect(portal.procedures()).toEqual([
      "publication.getPublicationSession",
      "publication.getIngestionSession",
    ]);
    expect(result.hubspotTicketId).toBe("ticket-1");
  });
});

describe("publishRelease recovery", () => {
  it("returns the submitted result when cleanup finds the release already submitted", async () => {
    const sessionStages = ["PreparedForMint", "Submitted"];
    const portal = createRecordingPortal({
      ...portalResponses,
      "publication.getPublicationSession": () => ({
        ...portalResponses["publication.getPublicationSession"],
        stage: sessionStages.shift(),
        hubspotTicketId: sessionStages.length === 0 ? "ticket-1" : null,
      }),
      "publication.submitToStore": () =>
        new Response(
          JSON.stringify({ error: { message: "Gateway timeout" } }),
          {
            status: 504,
          }
        ),
      "publication.cleanupRelease": {
        success: true,
        releaseId: "release-1",
        action: "preservedSubmitted",
        message: "Already submitted",
      },
    });

    const result = await publishRelease({
      client: createPortalClient({
        apiKey: "secret",
        portalUrl: "https://portal.example.com",
        fetch: portal.fetch,
      }),
      source: { kind: "apk-url", url: "https://example.com/app.apk" },
      whatsNew: "Fixes",
    });

    expect(portal.procedures()).toEqual([
      "publication.createIngestionSession",
      "publication.getIngestionSession",
      "publication.getPublicationSession",
      "publication.submitToStore",
      "publication.cleanupRelease",
      "publication.getPublicationSession",
    ]);
    expect(result).toMatchObject({
      releaseId: "release-1",
      hubspotTicketId: "ticket-1",
    });
  });
});
