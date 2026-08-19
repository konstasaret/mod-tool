import { redis } from '@devvit/web/server';
import type { VerificationLevel, VerificationStatus } from '../../shared/contracts.js';
import { canHoldContent, type HeldContent } from './gating.js';

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const HELD_CONTENT_TTL_SECONDS = 24 * 60 * 60;
const MAX_HELD_CONTENT_PER_USER = 5;

export type VerificationRequest = {
  id: string;
  redditUserId: string;
  redditUsername: string;
  sourceId: string;
  status: VerificationStatus;
  level: VerificationLevel;
  requestedAt: string;
  verifiedAt?: string;
  failureReason?: string;
  bridgeSession?: {
    sessionId: string;
    launchUrl: string;
    expiresAt: number;
  };
};

export type VerifiedUser = {
  requestId: string;
  redditUsername: string;
  level: VerificationLevel;
  verifiedAt: string;
  action: string;
  decimalNullifier: string;
};

const keys = {
  portalPost: 'whc:v1:portal-post',
  portalPostVersion: 'whc:v1:portal-post-version',
  request: (id: string) => `whc:v1:request:${id}`,
  pendingUser: (userId: string) => `whc:v1:user:${userId}:pending`,
  verifiedUser: (userId: string) => `whc:v1:user:${userId}:verified`,
  heldUser: (userId: string) => `whc:v1:user:${userId}:held`,
  nullifier: (action: string, decimalNullifier: string) =>
    `whc:v1:nullifier:${action}:${decimalNullifier}`,
};

export async function saveRequest(request: VerificationRequest): Promise<void> {
  const expires = new Date(Date.now() + REQUEST_TTL_MS);
  await Promise.all([
    redis.set(keys.request(request.id), JSON.stringify(request), { expiration: expires }),
    redis.set(keys.pendingUser(request.redditUserId), request.id, { expiration: expires }),
  ]);
}

export async function getRequest(id: string): Promise<VerificationRequest | undefined> {
  const raw = await redis.get(keys.request(id));
  return raw ? (JSON.parse(raw) as VerificationRequest) : undefined;
}

export async function getPendingRequestForUser(
  userId: string
): Promise<VerificationRequest | undefined> {
  const requestId = await redis.get(keys.pendingUser(userId));
  return requestId ? getRequest(requestId) : undefined;
}

export async function saveBridgeSession(
  request: VerificationRequest,
  bridgeSession: NonNullable<VerificationRequest['bridgeSession']>
): Promise<VerificationRequest> {
  const updated = { ...request, bridgeSession };
  await saveRequest(updated);
  return updated;
}

export async function clearBridgeSession(request: VerificationRequest): Promise<void> {
  const { bridgeSession: _bridgeSession, ...updated } = request;
  await saveRequest(updated);
}

export async function getVerifiedUser(userId: string): Promise<VerifiedUser | undefined> {
  const raw = await redis.get(keys.verifiedUser(userId));
  return raw ? (JSON.parse(raw) as VerifiedUser) : undefined;
}

export async function holdContent(userId: string, content: HeldContent): Promise<boolean> {
  const key = keys.heldUser(userId);
  const existing = await redis.hGet(key, content.id);
  if (
    !canHoldContent({
      alreadyHeld: Boolean(existing),
      heldCount: await redis.hLen(key),
      maximum: MAX_HELD_CONTENT_PER_USER,
    })
  ) {
    return false;
  }
  await redis.hSet(key, { [content.id]: JSON.stringify(content) });
  await redis.expire(key, HELD_CONTENT_TTL_SECONDS);
  return true;
}

export async function getHeldContent(userId: string): Promise<HeldContent[]> {
  const values = await redis.hGetAll(keys.heldUser(userId));
  return Object.values(values).flatMap((value) => {
    try {
      return [JSON.parse(value) as HeldContent];
    } catch {
      return [];
    }
  });
}

export async function removeHeldContent(userId: string, contentIds: string[]): Promise<void> {
  if (contentIds.length === 0) return;
  await redis.hDel(keys.heldUser(userId), contentIds);
}

export async function completeRequest(
  request: VerificationRequest,
  action: string,
  nullifier: string
): Promise<void> {
  const verifiedAt = new Date().toISOString();
  const completed: VerificationRequest = { ...request, status: 'verified', verifiedAt };
  const verified: VerifiedUser = {
    requestId: request.id,
    redditUsername: request.redditUsername,
    level: request.level,
    verifiedAt,
    action,
    decimalNullifier: BigInt(nullifier).toString(10),
  };
  await Promise.all([
    redis.set(keys.request(request.id), JSON.stringify(completed)),
    redis.set(keys.verifiedUser(request.redditUserId), JSON.stringify(verified)),
    redis.del(keys.pendingUser(request.redditUserId)),
  ]);
}

export async function failRequest(
  request: VerificationRequest,
  reason: string
): Promise<void> {
  await redis.set(
    keys.request(request.id),
    JSON.stringify({ ...request, status: 'failed', failureReason: reason })
  );
}

export async function claimNullifier(
  action: string,
  nullifier: string,
  requestId: string,
  redditUserId: string
): Promise<boolean> {
  const decimal = BigInt(nullifier).toString(10);
  const key = keys.nullifier(action, decimal);
  const value = JSON.stringify({ requestId, redditUserId });
  const result = await redis.set(key, value, {
    nx: true,
  });
  if (result === 'OK') return true;
  const existing = await redis.get(key);
  if (!existing) return false;
  try {
    return (JSON.parse(existing) as { redditUserId?: string }).redditUserId === redditUserId;
  } catch {
    return false;
  }
}

export async function unlinkUser(userId: string): Promise<VerifiedUser | undefined> {
  const verified = await getVerifiedUser(userId);
  const pending = await getPendingRequestForUser(userId);
  const deleteKeys = [
    keys.verifiedUser(userId),
    keys.pendingUser(userId),
    keys.heldUser(userId),
  ];
  if (verified) {
    deleteKeys.push(keys.request(verified.requestId));
    deleteKeys.push(keys.nullifier(verified.action, verified.decimalNullifier));
  }
  if (pending) deleteKeys.push(keys.request(pending.id));
  await redis.del(...deleteKeys);
  return verified;
}

export async function getPortalPostId(): Promise<string | undefined> {
  return redis.get(keys.portalPost);
}

export async function getPortalPostVersion(): Promise<string | undefined> {
  return redis.get(keys.portalPostVersion);
}

export async function setPortalPost(postId: string, appVersion: string): Promise<void> {
  await Promise.all([
    redis.set(keys.portalPost, postId),
    redis.set(keys.portalPostVersion, appVersion),
  ]);
}
