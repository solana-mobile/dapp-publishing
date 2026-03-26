export const deprecateLegacyPublishSurface = (surface: string): void => {
  console.warn(
    `${surface} is deprecated and now a no-op. Use the portal-driven publication workflow exports from @solana-mobile/dapp-store-publishing-tools instead.`,
  );
};
