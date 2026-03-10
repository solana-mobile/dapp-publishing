export type StorageNetwork = "devnet" | "mainnet";

const MAINNET_PUBLIC_CONTENT_GATEWAY = "https://dappstorecontent.com";
const DEVNET_PUBLIC_CONTENT_GATEWAY = "https://turbo.ardrive.dev/raw";

const LEGACY_MAINNET_CONTENT_HOSTS = new Set([
  "arweave.net",
  "www.arweave.net",
  "arweave.com",
  "www.arweave.com",
]);

export const buildPublicContentUrl = (
  id: string,
  network: StorageNetwork
): string => {
  const gateway =
    network === "devnet"
      ? DEVNET_PUBLIC_CONTENT_GATEWAY
      : MAINNET_PUBLIC_CONTENT_GATEWAY;

  return `${gateway}/${id}`;
};

export const normalizePublicContentUrl = (url: string): string => {
  try {
    const parsed = new URL(url);

    if (!LEGACY_MAINNET_CONTENT_HOSTS.has(parsed.host.toLowerCase())) {
      return url;
    }

    return `${MAINNET_PUBLIC_CONTENT_GATEWAY}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
};
