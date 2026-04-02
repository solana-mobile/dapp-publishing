import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  buildReleaseMetadataDocument,
  type ReleaseMetadataPortalClient,
} from "../releaseMetadata.js";

function makePortalClient(options?: {
  fetchRemoteFile?: Record<
    string,
    {
      data: string;
      fileName: string;
      mimeType: string;
    }
  >;
}): jest.Mocked<ReleaseMetadataPortalClient> {
  return {
    fetchRemoteFile: jest.fn(async (input) => {
      if (!options?.fetchRemoteFile?.[input.url]) {
        throw new Error(`Unexpected remote file fetch for ${input.url}`);
      }

      return options.fetchRemoteFile[input.url]!;
    }),
    createUploadTarget: jest.fn(),
  };
}

describe("buildReleaseMetadataDocument", () => {
  let originalFetch: typeof fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("reuses existing R2 media URLs without reuploading them", async () => {
    const portal = makePortalClient({
      fetchRemoteFile: {
        "https://r2.solanamobiledappstore.com/a/icon.png": {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR3sAAAAASUVORK5CYII=",
            "base64"
          ).toString("base64"),
          fileName: "icon.png",
          mimeType: "image/png",
        },
        "https://r2.solanamobiledappstore.com/a/preview.png": {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mP8z8AARMAgYGJAAwA5WQYB8m8VXwAAAABJRU5ErkJggg==",
            "base64"
          ).toString("base64"),
          fileName: "preview.png",
          mimeType: "image/png",
        },
      },
    });

    const metadata = (await buildReleaseMetadataDocument(
      portal,
      {
        ingestionSessionId: "ingestion-1",
        publicationSessionId: "publication-1",
        releaseId: "release-1",
        release: {
          id: "release-1",
          androidPackage: "com.example.app",
          versionName: "1.0.1",
          versionCode: 2,
          minSdkVersion: 26,
          targetSdkVersion: 36,
          certificateFingerprint: "fingerprint",
          permissions: ["android.permission.INTERNET"],
          locales: ["en-US"],
          shortDescription: "Pay with QR, NFC, Bluetooth, and .skr",
          longDescription: "Long description",
          localizedName: "Seeker PAY",
          newInVersion: "UI improvements",
        },
        dapp: {
          id: "dapp-1",
          dappName: "Seeker PAY",
          subtitle: "Pay with QR, NFC, Bluetooth, and .skr",
          description: "Long description",
          androidPackage: "com.example.app",
          dappIconUrl: "https://r2.solanamobiledappstore.com/a/icon.png",
          dappPreviewUrls: [
            "https://r2.solanamobiledappstore.com/a/preview.png",
          ],
          appWebsite: "https://example.com",
          contactEmail: "contact@example.com",
          supportEmail: "support@example.com",
          languages: ["en-US"],
          licenseUrl: "https://example.com/license",
          copyrightUrl: "https://example.com/copyright",
          privacyPolicyUrl: "https://example.com/privacy",
          walletAddress: "publisher-wallet",
          nftMintAddress: "app-mint",
        },
        publisher: {
          id: "publisher-1",
          type: "organization",
          name: "Publisher",
          website: "https://example.com",
          email: "contact@example.com",
          supportEmail: "support@example.com",
        },
        installFile: {
          uri: "https://example.com/release.apk",
          mimeType: "application/vnd.android.package-archive",
          size: 123456,
          sha256: "apk-hash",
        },
        signerAuthority: {
          dappWalletAddress: "publisher-wallet",
          collectionAuthority: "publisher-wallet",
          appMintAddress: "app-mint",
          sameSignerRequired: true,
          acceptedSignerRoles: ["publisher"],
        },
      },
      "portal"
    )) as Record<string, any>;

    expect(metadata.image).toBe(
      "https://r2.solanamobiledappstore.com/a/icon.png"
    );
    expect(metadata.extensions.solana_dapp_store.media).toEqual([
      {
        mime: "image/png",
        purpose: "icon",
        uri: "https://r2.solanamobiledappstore.com/a/icon.png",
        width: 1,
        height: 1,
        sha256: expect.any(String),
      },
      {
        mime: "image/png",
        purpose: "screenshot",
        uri: "https://r2.solanamobiledappstore.com/a/preview.png",
        width: 2,
        height: 3,
        sha256: expect.any(String),
      },
    ]);
    expect(
      metadata.extensions.solana_dapp_store.android_details.target_sdk
    ).toBe(36);
    expect(
      metadata.extensions.solana_dapp_store.android_details.cert_fingerprint
    ).toBe("fingerprint");
    expect(portal.fetchRemoteFile).toHaveBeenCalledTimes(2);
    expect(portal.createUploadTarget).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mirrors portal-hosted release media to R2 before emitting metadata", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    const iconUrl =
      "https://dev-portal-uploads-prod-854862047012.s3.amazonaws.com/logos/icon.png";
    const previewUrl =
      "https://dev-portal-uploads-prod-854862047012.s3.amazonaws.com/previews/preview.png";
    const portal = makePortalClient({
      fetchRemoteFile: {
        [iconUrl]: {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR3sAAAAASUVORK5CYII=",
            "base64"
          ).toString("base64"),
          fileName: "icon.png",
          mimeType: "image/png",
        },
        [previewUrl]: {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mP8z8AARMAgYGJAAwA5WQYB8m8VXwAAAABJRU5ErkJggg==",
            "base64"
          ).toString("base64"),
          fileName: "preview.png",
          mimeType: "image/png",
        },
      },
    });

    portal.createUploadTarget
      .mockResolvedValueOnce({
        uploadUrl: "https://upload.example.com/icon",
        key: "icon",
        providerId: "provider-1",
        publicUrl: "https://r2.solanamobiledappstore.com/a/r2-icon.png",
      })
      .mockResolvedValueOnce({
        uploadUrl: "https://upload.example.com/preview",
        key: "preview",
        providerId: "provider-1",
        publicUrl: "https://r2.solanamobiledappstore.com/a/r2-preview.png",
      });

    const metadata = (await buildReleaseMetadataDocument(
      portal,
      {
        ingestionSessionId: "ingestion-1",
        publicationSessionId: "publication-1",
        releaseId: "release-1",
        release: {
          id: "release-1",
          androidPackage: "com.example.app",
          versionName: "1.0.1",
          versionCode: 2,
          minSdkVersion: 26,
          targetSdkVersion: 36,
          certificateFingerprint: "fingerprint",
          permissions: ["android.permission.INTERNET"],
          locales: ["en-US"],
          shortDescription: "Pay with QR, NFC, Bluetooth, and .skr",
          longDescription: "Long description",
          localizedName: "Seeker PAY",
          newInVersion: "UI improvements",
        },
        dapp: {
          id: "dapp-1",
          dappName: "Seeker PAY",
          subtitle: "Pay with QR, NFC, Bluetooth, and .skr",
          description: "Long description",
          androidPackage: "com.example.app",
          dappIconUrl: iconUrl,
          dappPreviewUrls: [previewUrl],
          appWebsite: "https://example.com",
          contactEmail: "contact@example.com",
          supportEmail: "support@example.com",
          languages: ["en-US"],
          licenseUrl: "https://example.com/license",
          copyrightUrl: "https://example.com/copyright",
          privacyPolicyUrl: "https://example.com/privacy",
          walletAddress: "publisher-wallet",
          nftMintAddress: "app-mint",
        },
        publisher: {
          id: "publisher-1",
          type: "organization",
          name: "Publisher",
          website: "https://example.com",
          email: "contact@example.com",
          supportEmail: "support@example.com",
        },
        installFile: {
          uri: "https://example.com/release.apk",
          mimeType: "application/vnd.android.package-archive",
          size: 123456,
          sha256: "apk-hash",
        },
        signerAuthority: {
          dappWalletAddress: "publisher-wallet",
          collectionAuthority: "publisher-wallet",
          appMintAddress: "app-mint",
          sameSignerRequired: true,
          acceptedSignerRoles: ["publisher"],
        },
      },
      "portal"
    )) as Record<string, any>;

    expect(metadata.image).toBe(
      "https://r2.solanamobiledappstore.com/a/r2-icon.png"
    );
    expect(metadata.extensions.solana_dapp_store.media).toMatchObject([
      {
        mime: "image/png",
        purpose: "icon",
        uri: "https://r2.solanamobiledappstore.com/a/r2-icon.png",
        width: 1,
        height: 1,
        sha256: expect.any(String),
      },
      {
        mime: "image/png",
        purpose: "screenshot",
        uri: "https://r2.solanamobiledappstore.com/a/r2-preview.png",
        width: 2,
        height: 3,
        sha256: expect.any(String),
      },
    ]);
    expect(portal.fetchRemoteFile).toHaveBeenCalledTimes(2);
    expect(portal.createUploadTarget).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes schemeless media URLs before fetching them", async () => {
    const iconUrl = "r2.solanamobiledappstore.com/a/icon.png";
    const normalizedIconUrl = `https://${iconUrl}`;
    const portal = makePortalClient({
      fetchRemoteFile: {
        [normalizedIconUrl]: {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR3sAAAAASUVORK5CYII=",
            "base64"
          ).toString("base64"),
          fileName: "icon.png",
          mimeType: "image/png",
        },
      },
    });

    const metadata = (await buildReleaseMetadataDocument(
      portal,
      {
        ingestionSessionId: "ingestion-1",
        publicationSessionId: "publication-1",
        releaseId: "release-1",
        release: {
          id: "release-1",
          androidPackage: "com.example.app",
          versionName: "1.0.1",
          versionCode: 2,
          minSdkVersion: 26,
          targetSdkVersion: 36,
          certificateFingerprint: "fingerprint",
          permissions: ["android.permission.INTERNET"],
          locales: ["en-US"],
          shortDescription: "Pay with QR, NFC, Bluetooth, and .skr",
          longDescription: "Long description",
          localizedName: "Seeker PAY",
          newInVersion: "UI improvements",
        },
        dapp: {
          id: "dapp-1",
          dappName: "Seeker PAY",
          subtitle: "Pay with QR, NFC, Bluetooth, and .skr",
          description: "Long description",
          androidPackage: "com.example.app",
          dappIconUrl: iconUrl,
          dappPreviewUrls: [],
          appWebsite: "https://example.com",
          contactEmail: "contact@example.com",
          supportEmail: "support@example.com",
          languages: ["en-US"],
          licenseUrl: "https://example.com/license",
          copyrightUrl: "https://example.com/copyright",
          privacyPolicyUrl: "https://example.com/privacy",
          walletAddress: "publisher-wallet",
          nftMintAddress: "app-mint",
        },
        publisher: {
          id: "publisher-1",
          type: "organization",
          name: "Publisher",
          website: "https://example.com",
          email: "contact@example.com",
          supportEmail: "support@example.com",
        },
        installFile: {
          uri: "https://example.com/release.apk",
          mimeType: "application/vnd.android.package-archive",
          size: 123456,
          sha256: "apk-hash",
        },
        signerAuthority: {
          dappWalletAddress: "publisher-wallet",
          collectionAuthority: "publisher-wallet",
          appMintAddress: "app-mint",
          sameSignerRequired: true,
          acceptedSignerRoles: ["publisher"],
        },
      },
      "portal"
    )) as Record<string, any>;

    expect(metadata.image).toBe(normalizedIconUrl);
    expect(portal.fetchRemoteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: normalizedIconUrl,
      })
    );
    expect(portal.createUploadTarget).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not force feature graphics to image/png when the source is jpeg", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    const iconUrl = "https://r2.solanamobiledappstore.com/a/icon.png";
    const featureGraphicUrl =
      "https://dev-portal-uploads-prod-854862047012.s3.amazonaws.com/previews/feature.jpg";
    const portal = makePortalClient({
      fetchRemoteFile: {
        [iconUrl]: {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR3sAAAAASUVORK5CYII=",
            "base64"
          ).toString("base64"),
          fileName: "icon.png",
          mimeType: "image/png",
        },
        [featureGraphicUrl]: {
          data: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR3sAAAAASUVORK5CYII=",
            "base64"
          ).toString("base64"),
          fileName: "feature.jpg",
          mimeType: "image/jpeg",
        },
      },
    });

    portal.createUploadTarget.mockResolvedValueOnce({
      uploadUrl: "https://upload.example.com/feature",
      key: "feature",
      providerId: "provider-1",
      publicUrl: "https://r2.solanamobiledappstore.com/a/r2-feature.jpg",
    });

    const metadata = (await buildReleaseMetadataDocument(
      portal,
      {
        ingestionSessionId: "ingestion-1",
        publicationSessionId: "publication-1",
        releaseId: "release-1",
        release: {
          id: "release-1",
          androidPackage: "com.example.app",
          versionName: "1.0.1",
          versionCode: 2,
          minSdkVersion: 26,
          targetSdkVersion: 36,
          certificateFingerprint: "fingerprint",
          permissions: ["android.permission.INTERNET"],
          locales: ["en-US"],
          shortDescription: "Pay with QR, NFC, Bluetooth, and .skr",
          longDescription: "Long description",
          localizedName: "Seeker PAY",
          newInVersion: "UI improvements",
        },
        dapp: {
          id: "dapp-1",
          dappName: "Seeker PAY",
          subtitle: "Pay with QR, NFC, Bluetooth, and .skr",
          description: "Long description",
          androidPackage: "com.example.app",
          dappIconUrl: iconUrl,
          dappPreviewUrls: [],
          featureGraphicUrl,
          appWebsite: "https://example.com",
          contactEmail: "contact@example.com",
          supportEmail: "support@example.com",
          languages: ["en-US"],
          licenseUrl: "https://example.com/license",
          copyrightUrl: "https://example.com/copyright",
          privacyPolicyUrl: "https://example.com/privacy",
          walletAddress: "publisher-wallet",
          nftMintAddress: "app-mint",
        },
        publisher: {
          id: "publisher-1",
          type: "organization",
          name: "Publisher",
          website: "https://example.com",
          email: "contact@example.com",
          supportEmail: "support@example.com",
        },
        installFile: {
          uri: "https://example.com/release.apk",
          mimeType: "application/vnd.android.package-archive",
          size: 123456,
          sha256: "apk-hash",
        },
        signerAuthority: {
          dappWalletAddress: "publisher-wallet",
          collectionAuthority: "publisher-wallet",
          appMintAddress: "app-mint",
          sameSignerRequired: true,
          acceptedSignerRoles: ["publisher"],
        },
      },
      "portal"
    )) as Record<string, any>;

    const featureMedia = metadata.extensions.solana_dapp_store.media.find(
      (item: Record<string, any>) => item.purpose === "featureGraphic"
    );

    expect(featureMedia).toMatchObject({
      mime: "image/jpeg",
      uri: "https://r2.solanamobiledappstore.com/a/r2-feature.jpg",
    });
    expect(portal.fetchRemoteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: featureGraphicUrl,
        expectedMimeType: undefined,
      })
    );
  });
});
