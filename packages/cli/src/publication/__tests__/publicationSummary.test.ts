import { expect, test } from '@jest/globals';

import { extractPublicationSummaryLines } from '../publicationSummary';

test('summary keeps the completion message and only the compact fields', () => {
  const lines = extractPublicationSummaryLines({
    releaseId: 'release-123',
    publicationSessionId: 'session-123',
    ingestionSessionId: 'ingestion-123',
    hubspotTicketId: 'ticket-123',
  });

  expect(lines).toEqual(['This app is now in review.', 'Ticket ID: ticket-123']);
});

test('summary still shows the in-review message when no fields are available', () => {
  expect(extractPublicationSummaryLines(undefined)).toEqual([
    'This app is now in review.',
  ]);
});
