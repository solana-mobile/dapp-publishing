import { getTurboServiceConfig } from "../TurboStorageDriver";

describe("TurboStorageDriver", () => {
  test("uses the latest Turbo SDK service config shape for devnet", () => {
    expect(getTurboServiceConfig("devnet")).toEqual({
      gatewayUrl: "https://api.devnet.solana.com",
      uploadServiceConfig: { url: "https://upload.ardrive.dev" },
      paymentServiceConfig: { url: "https://payment.ardrive.dev" },
    });
  });

  test("relies on the SDK defaults for mainnet service URLs", () => {
    expect(getTurboServiceConfig("mainnet")).toEqual({});
  });
});
