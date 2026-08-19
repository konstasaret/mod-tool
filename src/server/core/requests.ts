import { randomUUID } from 'node:crypto';
import type { TargetAuthor } from './reddit.js';
import {
  getPendingHumanBadgeRequestForUser,
  getPendingRequestForUser,
  saveHumanBadgeRequest,
  saveRequest,
  type VerificationRequest,
} from './state.js';

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

export async function ensureHumanBadgeRequest(
  author: TargetAuthor
): Promise<{ request: VerificationRequest; created: boolean }> {
  const existing = await getPendingHumanBadgeRequestForUser(author.userId);
  if (existing?.status === 'pending') return { request: existing, created: false };

  const request: VerificationRequest = {
    id: randomUUID(),
    redditUserId: author.userId,
    redditUsername: author.username,
    sourceId: 'human-badge-portal',
    status: 'pending',
    level: 'orb',
    requestedAt: new Date().toISOString(),
  };
  await saveHumanBadgeRequest(request);
  return { request, created: true };
}
