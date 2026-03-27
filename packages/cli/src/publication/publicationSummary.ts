function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractPublicationSummaryLines(result: unknown): string[] {
  const lines = ['This app is now in review.'];

  if (!isRecord(result)) {
    return lines;
  }

  const keys = [
    ['releaseMintAddress', 'Release mint address'],
    ['collectionMintAddress', 'Collection mint address'],
    ['hubspotTicketId', 'Ticket ID'],
  ] as const;

  for (const [key, label] of keys) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      lines.push(`${label}: ${value}`);
    }
  }

  return lines;
}
