import { describe, expect, it, jest } from "@jest/globals";
import { getAddressDecoder } from "@solana/kit";

import {
  ensurePublicationSignerBalance,
  MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS,
  resolveFundingPreflightRpcUrl,
} from "../fundingPreflight.js";

describe("resolveFundingPreflightRpcUrl", () => {
  it("defaults to mainnet when local-dev is not enabled", () => {
    expect(resolveFundingPreflightRpcUrl({})).toBe(
      "https://api.mainnet-beta.solana.com"
    );
  });

  it("skips the default RPC in local-dev mode", () => {
    expect(resolveFundingPreflightRpcUrl({ localDev: true })).toBeUndefined();
  });

  it("honors an explicit RPC URL", () => {
    expect(
      resolveFundingPreflightRpcUrl({
        localDev: true,
        rpcUrl: "https://rpc.example.com",
      })
    ).toBe("https://rpc.example.com");
  });
});

describe("ensurePublicationSignerBalance", () => {
  const publicKey = getAddressDecoder().decode(new Uint8Array(32).fill(7));

  it("throws before publication when the signer balance is too low", async () => {
    await expect(
      ensurePublicationSignerBalance(
        {
          publicKey,
        },
        () => ({
          getBalance: jest
            .fn()
            .mockResolvedValue(BigInt(MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS - 1)),
        })
      )
    ).rejects.toThrow("publishing needs at least");
  });

  it("returns the balance when it is sufficient", async () => {
    const result = await ensurePublicationSignerBalance(
      {
        publicKey,
      },
      () => ({
        getBalance: jest
          .fn()
          .mockResolvedValue(BigInt(MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS + 1)),
      })
    );

    expect(result).toEqual({
      balanceLamports: BigInt(MIN_PUBLICATION_SIGNER_BALANCE_LAMPORTS + 1),
    });
  });

  it("skips the check for a local dev portal without an RPC URL", async () => {
    const getBalance = jest.fn();
    const result = await ensurePublicationSignerBalance(
      { localDev: true, publicKey },
      () => ({ getBalance })
    );

    expect(result).toEqual({});
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("returns a warning when the RPC balance check fails", async () => {
    const result = await ensurePublicationSignerBalance(
      {
        publicKey,
      },
      () => ({
        getBalance: jest.fn().mockRejectedValue(new Error("RPC timeout")),
      })
    );

    expect(result.balanceLamports).toBeUndefined();
    expect(result.warning).toContain("Continuing without a SOL preflight check");
    expect(result.warning).toContain("RPC timeout");
  });
});

