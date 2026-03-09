import { buildPublicContentUrl, normalizePublicContentUrl } from "../contentGateway";

describe("contentGateway", () => {
  test("builds a mainnet dappstorecontent URL from an upload id", () => {
    expect(buildPublicContentUrl("abc123", "mainnet")).toBe(
      "https://dappstorecontent.com/abc123"
    );
  });

  test("builds a devnet Turbo raw URL from an upload id", () => {
    expect(buildPublicContentUrl("abc123", "devnet")).toBe(
      "https://turbo.ardrive.dev/raw/abc123"
    );
  });

  test("normalizes arweave.net and arweave.com URLs to dappstorecontent", () => {
    expect(normalizePublicContentUrl("https://arweave.net/abc123")).toBe(
      "https://dappstorecontent.com/abc123"
    );
    expect(
      normalizePublicContentUrl("https://www.arweave.com/abc123?ext=png")
    ).toBe("https://dappstorecontent.com/abc123?ext=png");
  });

  test("leaves non-arweave URLs unchanged", () => {
    expect(
      normalizePublicContentUrl("https://turbo.ardrive.dev/raw/abc123")
    ).toBe("https://turbo.ardrive.dev/raw/abc123");
    expect(normalizePublicContentUrl("not-a-url")).toBe("not-a-url");
  });
});
