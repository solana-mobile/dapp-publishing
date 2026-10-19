import { describe, expect, it, jest } from "@jest/globals";

import { PublishingError } from "../../errors.js";
import { createPortalClient } from "../publishRelease.js";

describe("createPortalClient", () => {
  it("derives the API URL from portalUrl and uses the injected fetch", async () => {
    const fetchMock = jest.fn(
      async (_url: unknown, _init?: unknown) =>
        new Response(
          JSON.stringify({ result: { data: { slot: 7, blockhash: "hash" } } }),
          { status: 200 }
        )
    );
    const client = createPortalClient({
      apiKey: "secret",
      portalUrl: "https://portal.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.attestationClient.getBlockData()).resolves.toEqual({
      slot: 7,
      blockhash: "hash",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/portal\.example\.com\/api\/trpc\/attestation\.getBlockData/
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
