import { randomUUID } from 'node:crypto';
import type { TargetAuthor } from './reddit.js';
import { getPendingRequestForUser, saveRequest, type VerificationRequest } from './state.js';

export async function ensureHumanCheckRequest(
  author: TargetAuthor,
  sourceId: string
): Promise<{ request: VerificationRequest; created: boolean }> {
  const existing = await getPendingRequestForUser(author.userId);
  if (existing?.status === 'pending') return { request: existing, created: false };

  const request: VerificationRequest = {
    id: randomUUID(),
    redditUserId: author.userId,
    redditUsername: author.username,
    sourceId,
    status: 'pending',
    level: 'selfie',
    requestedAt: new Date().toISOString(),
  };
  await saveRequest(request);
  return { request, created: true };
}
